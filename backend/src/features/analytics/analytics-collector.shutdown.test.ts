// src/features/analytics/analytics-collector.shutdown.test.ts

/**
 * Stopping the collector (a deploy or restart) stores what was still queued. Real Postgres
 * (PGlite with the analytics migrations); the switch is the shared stub.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

let testDb: AnalyticsTestDb;
vi.mock('@/db/index', () => ({
  get analyticsDB() {
    return testDb.db;
  },
  db: {},
}));
vi.mock('./analytics-config', () => ({ analyticsFlags: { canTrackSearch: () => true, canTrackAI: () => true, canTrackTools: () => true, canTrackClicks: () => true } }));
vi.mock('./analytics-retention', () => ({ startRetentionCleanup: vi.fn(), stopRetentionCleanup: vi.fn() }));
vi.mock('@/features/feature-switches/feature-switches.service', async () => (await import('@/shared/test/feature-switches-stub')).featureSwitchesService);

import { getQueueStats, stopAnalyticsCollector, trackSearch } from './analytics-collector';

import { searchEvents } from '@/db/analytics-schema';
import { createAnalyticsTestDb, type AnalyticsTestDb } from '@/shared/test/analytics-test-db';

beforeAll(async () => {
  testDb = await createAnalyticsTestDb();
});
afterAll(async () => {
  await testDb.close();
});

describe('stopping the analytics collector', () => {
  it('stores the events still queued', async () => {
    trackSearch({
      requestId: crypto.randomUUID(), triggerType: 'ai_tool', searchType: 'lexical', indexIds: ['idx'],
      queryText: 'queued at shutdown', totalResults: 1, resultsReturned: 1, durationMs: 5, success: true,
    });
    expect(getQueueStats()).toMatchObject({ searchEvents: 1 });

    await stopAnalyticsCollector();

    expect(getQueueStats()).toMatchObject({ searchEvents: 0 });
    expect((await testDb.db.select({ q: searchEvents.queryText }).from(searchEvents)).map((r) => r.q)).toEqual(['queued at shutdown']);
  });
});
