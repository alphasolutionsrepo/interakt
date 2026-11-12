// src/features/analytics/analytics-collector.feature-off.test.ts

/**
 * With the Analytics area turned off nothing is recorded: queued events are dropped at the
 * flush, the one place they are written. Switched back on, recording resumes. Real Postgres
 * (PGlite with the analytics migrations); the switch is the shared stub.
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
vi.mock('./analytics-config', () => ({ analyticsFlags: { canTrackSearch: () => true, canTrackAI: () => true, canTrackTools: () => true, canTrackClicks: () => true } }));
vi.mock('./analytics-retention', () => ({ startRetentionCleanup: vi.fn(), stopRetentionCleanup: vi.fn() }));
vi.mock('@/features/feature-switches/feature-switches.service', async () => (await import('@/shared/test/feature-switches-stub')).featureSwitchesService);

import { aiUsageEvents, searchEvents } from '@/db/analytics-schema';
import { featureSwitchesStub } from '@/shared/test/feature-switches-stub';

import { clearQueues, forceFlush, getQueueStats, stopAnalyticsCollector, trackAI, trackSearch } from './analytics-collector';

function record(queryText: string) {
  trackSearch({
    requestId: crypto.randomUUID(), triggerType: 'ai_tool', searchType: 'lexical', indexIds: ['idx'],
    queryText, totalResults: 1, resultsReturned: 1, durationMs: 5, success: true,
  });
  trackAI({
    requestId: crypto.randomUUID(), operation: 'chat', providerId: crypto.randomUUID(), providerKey: 'ollama', modelKey: queryText,
    inputTokens: 1, outputTokens: 1, totalTokens: 2, durationMs: 5, success: true,
  });
}

beforeAll(async () => {
  testDb = await createAnalyticsTestDb();
});
beforeEach(async () => {
  clearQueues();
  featureSwitchesStub.reset();
  await testDb.reset();
});
afterAll(async () => {
  await stopAnalyticsCollector();
  await testDb.close();
});

describe('analytics events with the Analytics area off', () => {
  it('are not recorded, and what was queued is dropped', async () => {
    featureSwitchesStub.off.add('analytics');
    record('linen shirt');
    await forceFlush();

    expect(await testDb.db.select().from(searchEvents)).toHaveLength(0);
    expect(await testDb.db.select().from(aiUsageEvents)).toHaveLength(0);
    expect(getQueueStats()).toMatchObject({ searchEvents: 0, aiEvents: 0 });
  });

  it('are recorded again once the area is back on', async () => {
    featureSwitchesStub.off.add('analytics');
    record('dropped');
    await forceFlush();
    featureSwitchesStub.reset();
    record('kept');
    await forceFlush();

    expect((await testDb.db.select({ q: searchEvents.queryText }).from(searchEvents)).map((r) => r.q)).toEqual(['kept']);
  });
});
