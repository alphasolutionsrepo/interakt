// src/features/analytics/analytics-collector.shutdown.test.ts

/**
 * Stopping the collector (a deploy or restart) stores what was still queued. Real Postgres
 * (PGlite with the analytics migrations); the switch is the shared stub.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

let testDb: AnalyticsTestDb;
// The analytics database refuses every write for one test (an outage)
let down = false;
vi.mock('@/db/index', () => ({
  get analyticsDB() {
    if (down) return { insert: () => { throw new Error('analytics database down'); } };
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
  it('stores every event still queued, more than one batch', async () => {
    // 250 events: two and a half batches of 100
    for (let i = 0; i < 250; i++) {
      trackSearch({
        requestId: crypto.randomUUID(), triggerType: 'ai_tool', searchType: 'lexical', indexIds: ['idx'],
        queryText: `queued at shutdown ${i}`, totalResults: 1, resultsReturned: 1, durationMs: 5, success: true,
      });
    }
    expect(getQueueStats()).toMatchObject({ searchEvents: 250 });

    await stopAnalyticsCollector();

    expect(getQueueStats()).toMatchObject({ searchEvents: 0 });
    expect(await testDb.db.select({ q: searchEvents.queryText }).from(searchEvents)).toHaveLength(250);
  });

  it('returns when the events cannot be stored, leaving them queued', async () => {
    trackSearch({
      requestId: crypto.randomUUID(), triggerType: 'ai_tool', searchType: 'lexical', indexIds: ['idx'],
      queryText: 'never stored', totalResults: 1, resultsReturned: 1, durationMs: 5, success: true,
    });
    down = true;
    try {
      await stopAnalyticsCollector();
    } finally {
      down = false;
    }
    expect(getQueueStats()).toMatchObject({ searchEvents: 1 });
  });
});
