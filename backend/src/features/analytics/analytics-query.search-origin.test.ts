// src/features/analytics/analytics-query.search-origin.test.ts

/**
 * Who made a search: visitor searches and the assistant's own searches are reported
 * apart, and lookups (Find Record, List Values, query understanding) aren't counted as searches.
 * Runs the queries on real Postgres (PGlite) with the analytics migrations applied.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createAnalyticsTestDb, type AnalyticsTestDb } from '@/shared/test/analytics-test-db';

let testDb: AnalyticsTestDb;
vi.mock('@/db/index', () => ({
  get analyticsDB() {
    return testDb.db;
  },
  db: {},
}));

import { searchEvents } from '@/db/analytics-schema';

import {
  getOverviewMetrics,
  getPerformanceMetrics,
  getPopularQueries,
  getSearchTrends,
  getSearchTypeBreakdown,
  getZeroResultQueries,
} from './analytics-query.service';

function searchEvent(triggerType: string, query: string, totalResults: number, triggerStep: string | null = null) {
  return {
    requestId: crypto.randomUUID(),
    timestamp: new Date(Date.now() - 10 * 60_000),
    source: 'api',
    triggerType,
    triggerStep,
    searchType: 'lexical',
    indexIds: ['idx'],
    experienceId: null,
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

beforeAll(async () => {
  testDb = await createAnalyticsTestDb();
});
beforeEach(async () => {
  await testDb.reset();
  await testDb.db.insert(searchEvents).values([
    searchEvent('user', 'linen shirt', 4),
    searchEvent('user', 'wool coat', 0),
    searchEvent('ai_tool', 'wedding dress', 0, 'search'),
    searchEvent('ai_tool', 'wedding dress', 2, 'search'),
    // Lookups: Find Record, List Values and a search experience's query understanding
    searchEvent('ai_tool', 'SKU-123', 0, 'lookup'),
    searchEvent('ai_tool', '*', 0, 'enumerate'),
    searchEvent('ai_step', '*', 0, 'query_interpretation'),
  ]);
});
afterAll(async () => {
  await testDb.close();
});

describe('search origin', () => {
  it('leaves lookups out of the overview totals, and counts them apart', async () => {
    const overview = await getOverviewMetrics('24h');

    expect(overview.totalSearches).toBe(4);
    expect(overview.zeroResultRate).toBe(0.5);
    expect(overview.uniqueQueries).toBe(3);
    expect(overview.searchesByTrigger).toEqual({ user: 2, ai_tool: 2, lookups: 3 });
  });

  it('leaves lookups out of the search types chart and the timings', async () => {
    await testDb.db.insert(searchEvents).values({ ...searchEvent('ai_tool', '*', 0, 'enumerate'), durationMs: 1000 });

    expect((await getOverviewMetrics('24h')).avgSearchDurationMs).toBe(20);

    const types = await getSearchTypeBreakdown('24h');
    expect(types.lexical + types.semantic + types.hybrid).toBe(4);
    expect((await getPerformanceMetrics('24h')).avgDurationMs).toBe(20);
  });

  it('leaves lookups out of the trend chart, matching the totals', async () => {
    const trends = await getSearchTrends('24h');

    expect(trends.reduce((sum, point) => sum + point.totalSearches, 0)).toBe(4);
  });

  it('lists visitor and assistant searches separately', async () => {
    expect((await getPopularQueries('24h', undefined, 20, undefined, 'visitor')).map((q) => q.query).sort()).toEqual([
      'linen shirt',
      'wool coat',
    ]);
    expect(await getPopularQueries('24h', undefined, 20, undefined, 'assistant')).toEqual([
      expect.objectContaining({ query: 'wedding dress', searchCount: 2, zeroResultCount: 1 }),
    ]);
  });

  it('lists an assistant search recorded before its step was (no step) under assistant searches', async () => {
    await testDb.db.insert(searchEvents).values(searchEvent('ai_tool', 'return policy', 0));

    expect((await getPopularQueries('24h', undefined, 20, undefined, 'assistant')).map((q) => q.query)).toContain('return policy');
    expect((await getZeroResultQueries('24h', undefined, 20, undefined, 'assistant')).map((q) => q.query)).toContain('return policy');
    expect((await getPopularQueries('24h', undefined, 20, undefined, 'visitor')).map((q) => q.query)).not.toContain('return policy');
  });

  it('lists visitor and assistant failed searches separately', async () => {
    expect((await getZeroResultQueries('24h', undefined, 50, undefined, 'visitor')).map((q) => q.query)).toEqual(['wool coat']);
    expect((await getZeroResultQueries('24h', undefined, 50, undefined, 'assistant')).map((q) => q.query)).toEqual([
      'wedding dress',
    ]);
  });

  it('lists both, without lookups, when no origin is asked for (the API and the analytics assistant)', async () => {
    expect((await getPopularQueries('24h')).map((q) => q.query).sort()).toEqual(['linen shirt', 'wedding dress', 'wool coat']);
    expect((await getZeroResultQueries('24h')).map((q) => q.query).sort()).toEqual(['wedding dress', 'wool coat']);
  });
});
