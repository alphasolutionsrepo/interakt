// src/features/analytics/analytics-search-origin.callers.test.ts

/**
 * A chat experience's searches are all made by its assistant. The popular/failed search
 * endpoints and the analytics assistant's tools list them unless asked for visitor searches
 * only. Runs on real Postgres (PGlite) with the analytics migrations applied.
 */

import { NextRequest } from 'next/server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createAnalyticsTestDb, type AnalyticsTestDb } from '@/shared/test/analytics-test-db';

let testDb: AnalyticsTestDb;
vi.mock('@/db/index', () => ({
  get analyticsDB() {
    return testDb.db;
  },
  db: {},
}));
vi.mock('@/shared/utils/auth-utils', () => ({ getCurrentUserId: async () => 'admin' }));

import { searchEvents } from '@/db/analytics-schema';

import { executeAnalyticsTool } from './analytics-ai-tools';
import { handleGetPopularQueries, handleGetZeroResultQueries } from './analytics.api.handlers';

const experienceId = crypto.randomUUID();

function assistantSearch(query: string, totalResults: number) {
  return {
    requestId: crypto.randomUUID(),
    timestamp: new Date(Date.now() - 10 * 60_000),
    source: 'api',
    triggerType: 'ai_tool',
    searchType: 'lexical',
    indexIds: ['idx'],
    experienceId,
    queryText: query,
    queryNormalized: query,
    queryLength: query.length,
    queryWordCount: query.split(' ').length,
    totalResults,
    resultsReturned: totalResults,
    isZeroResult: totalResults === 0,
    durationMs: 20,
    success: true,
  };
}

async function get(handler: (r: NextRequest) => Promise<Response>, query: string) {
  const response = await handler(new NextRequest(`http://localhost/api/analytics/search/x?experienceId=${experienceId}${query}`));
  return ((await response.json()) as { data: Array<{ query: string }> }).data.map((q) => q.query);
}

beforeAll(async () => {
  testDb = await createAnalyticsTestDb();
});
beforeEach(async () => {
  await testDb.reset();
  await testDb.db.insert(searchEvents).values([assistantSearch('linen shirt', 3), assistantSearch('wool coat', 0)]);
});
afterAll(async () => {
  await testDb.close();
});

describe("a chat experience's searches", () => {
  it('are listed by the popular and failed search endpoints, and narrowed by origin', async () => {
    expect((await get(handleGetPopularQueries, '')).sort()).toEqual(['linen shirt', 'wool coat']);
    expect(await get(handleGetZeroResultQueries, '')).toEqual(['wool coat']);
    expect(await get(handleGetPopularQueries, '&origin=visitor')).toEqual([]);
    expect((await get(handleGetPopularQueries, '&origin=assistant')).sort()).toEqual(['linen shirt', 'wool coat']);
  });

  it('refuses an unknown origin on the endpoints; the analytics assistant then lists all', async () => {
    const response = await handleGetPopularQueries(
      new NextRequest(`http://localhost/api/analytics/search/popular?experienceId=${experienceId}&origin=bots`),
    );
    const listed = await executeAnalyticsTool('get_popular_queries', { timeRange: '24h', experienceId, origin: 'bots' });

    expect(response.status).toBe(400);
    expect((listed.rawData as Array<{ query: string }>).map((q) => q.query).sort()).toEqual(['linen shirt', 'wool coat']);
  });

  it('are found by the analytics assistant, which can ask for visitor searches only', async () => {
    const all = await executeAnalyticsTool('get_popular_queries', { timeRange: '24h', experienceId });
    const visitors = await executeAnalyticsTool('get_popular_queries', { timeRange: '24h', experienceId, origin: 'visitor' });
    const failed = await executeAnalyticsTool('get_zero_result_queries', { timeRange: '24h', experienceId });

    expect((all.rawData as Array<{ query: string }>).map((q) => q.query).sort()).toEqual(['linen shirt', 'wool coat']);
    expect(visitors.rawData).toEqual([]);
    expect((failed.rawData as Array<{ query: string }>).map((q) => q.query)).toEqual(['wool coat']);
  });

  it("are counted in the analytics assistant's overview, with lookups shown apart", async () => {
    await testDb.db.insert(searchEvents).values({ ...assistantSearch('*', 0), triggerStep: 'enumerate' });

    const overview = String((await executeAnalyticsTool('get_search_overview', { timeRange: '24h', experienceId })).data);

    expect(overview).toContain('Total Searches: 2');
    expect(overview).toContain('Lookups by Find Record, List Values and query understanding (not in Total Searches): 1');
  });

  it('are told apart from lookups by the analytics assistant, read from what was stored', async () => {
    await testDb.db.insert(searchEvents).values({ ...assistantSearch('SKU-123', 0), triggerStep: 'lookup' });

    const recent = await executeAnalyticsTool('get_recent_searches', { timeRange: '24h', experienceId });
    const events = await executeAnalyticsTool('get_query_search_events', { timeRange: '24h', experienceId, queryText: 'SKU-123' });

    expect((recent.rawData as Array<{ query: string; triggerStep: string | null }>).find((e) => e.query === 'SKU-123')?.triggerStep).toBe('lookup');
    expect(String(recent.data)).toContain('[ai_tool:lookup] "SKU-123"');
    expect(String(recent.data)).toContain('[ai_tool] "linen shirt"');
    expect((events.rawData as Array<{ triggerStep: string | null }>)[0]?.triggerStep).toBe('lookup');
    expect(String(events.data)).toContain('- ai_tool:lookup: 1 searches');
  });
});
