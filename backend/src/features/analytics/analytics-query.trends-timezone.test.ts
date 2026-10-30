// src/features/analytics/analytics-query.trends-timezone.test.ts

/**
 * Trend buckets start at the viewer's midnight: a search at 23:30 UTC on
 * 12 Oct is on 13 Oct in Copenhagen (UTC+2), so it counts towards 13 Oct there.
 * Runs on real Postgres (PGlite) with the analytics migrations applied.
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

import { getGranularityForRange, getSearchTrends } from './analytics-query.service';

function searchAt(iso: string) {
  return {
    requestId: crypto.randomUUID(),
    timestamp: new Date(iso),
    source: 'api',
    triggerType: 'user',
    searchType: 'lexical',
    indexIds: ['idx'],
    experienceId: null,
    queryText: 'shoes',
    queryNormalized: 'shoes',
    queryLength: 5,
    queryWordCount: 1,
    totalResults: 1,
    resultsReturned: 1,
    durationMs: 10,
    success: true,
  };
}

// A ten-day period, so buckets are days
const period = { from: new Date('2026-10-05T00:00:00Z'), to: new Date('2026-10-15T00:00:00Z') };

beforeAll(async () => {
  testDb = await createAnalyticsTestDb();
});
beforeEach(async () => {
  await testDb.reset();
  await testDb.db.insert(searchEvents).values([searchAt('2026-10-12T23:30:00Z'), searchAt('2026-10-12T10:00:00Z')]);
});
afterAll(async () => {
  await testDb.close();
});

describe('getSearchTrends time zone', () => {
  it('groups days at UTC midnight by default', async () => {
    const trends = await getSearchTrends('custom', undefined, period);
    expect(trends.map((p) => [p.timestamp.toISOString(), p.totalSearches])).toEqual([['2026-10-12T00:00:00.000Z', 2]]);
  });

  it("groups days at the viewer's midnight", async () => {
    const trends = await getSearchTrends('custom', undefined, period, 'Europe/Copenhagen');
    // Copenhagen midnight is 22:00 UTC the day before (summer time)
    expect(trends.map((p) => [p.timestamp.toISOString(), p.totalSearches])).toEqual([
      ['2026-10-11T22:00:00.000Z', 1],
      ['2026-10-12T22:00:00.000Z', 1],
    ]);
  });
});

describe('getGranularityForRange', () => {
  const span = (days: number) => ({ from: new Date(0), to: new Date(days * 24 * 60 * 60 * 1000) });

  it('uses hours up to two days, days up to a quarter, then weeks', () => {
    expect(getGranularityForRange(span(2))).toBe('hour');
    expect(getGranularityForRange(span(7))).toBe('day');
    expect(getGranularityForRange(span(31))).toBe('day');
    expect(getGranularityForRange(span(120))).toBe('week');
  });
});
