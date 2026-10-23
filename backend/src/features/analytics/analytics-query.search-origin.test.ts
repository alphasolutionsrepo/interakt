// src/features/analytics/analytics-query.search-origin.test.ts

/**
 * Who made a search: visitor searches and the assistant's own searches are reported
 * apart, and internal lookups (facet values, vocabularies) aren't counted as searches.
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

import { getOverviewMetrics, getPopularQueries, getSearchTrends, getZeroResultQueries } from './analytics-query.service';

function searchEvent(triggerType: string, query: string, totalResults: number) {
  return {
    requestId: crypto.randomUUID(),
    timestamp: new Date(Date.now() - 10 * 60_000),
    source: 'api',
    triggerType,
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
    searchEvent('ai_tool', 'wedding dress', 0),
    searchEvent('ai_tool', 'wedding dress', 2),
    searchEvent('system', '*', 0),
    searchEvent('system', '*', 0),
  ]);
});
afterAll(async () => {
  await testDb.close();
});

describe('search origin', () => {
  it('leaves internal lookups out of the overview totals', async () => {
    const overview = await getOverviewMetrics('24h');

    expect(overview.totalSearches).toBe(4);
    expect(overview.zeroResultRate).toBe(0.5);
    expect(overview.uniqueQueries).toBe(3);
    expect(overview.searchesByTrigger).toEqual({ user: 2, ai_tool: 2, ai_rag: 0, system: 2 });
  });

  it('leaves internal lookups out of the trend chart, matching the totals', async () => {
    const trends = await getSearchTrends('24h');

    expect(trends.reduce((sum, point) => sum + point.totalSearches, 0)).toBe(4);
  });

  it('lists visitor and assistant searches separately', async () => {
    expect((await getPopularQueries('24h')).map((q) => q.query).sort()).toEqual(['linen shirt', 'wool coat']);
    expect(await getPopularQueries('24h', undefined, 20, undefined, 'assistant')).toEqual([
      expect.objectContaining({ query: 'wedding dress', searchCount: 2, zeroResultCount: 1 }),
    ]);
  });

  it('lists only what visitors typed as failed searches by default', async () => {
    expect((await getZeroResultQueries('24h')).map((q) => q.query)).toEqual(['wool coat']);
    expect((await getZeroResultQueries('24h', undefined, 50, undefined, 'assistant')).map((q) => q.query)).toEqual([
      'wedding dress',
    ]);
  });
});
