// src/features/analytics/analytics-collector.feature-off.test.ts

/**
 * With the Analytics area turned off nothing is recorded: queued events are dropped at the
 * flush, the one place they are written. Switched back on, recording resumes. Real Postgres
 * (PGlite with the analytics migrations); the switch is the shared stub.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createAnalyticsTestDb, type AnalyticsTestDb } from '@/shared/test/analytics-test-db';
import type { LogLine } from '@/shared/test/log-recorder';

const logs = vi.hoisted(() => [] as LogLine[]);
vi.mock('@/shared/logger/logger', async () => (await import('@/shared/test/log-recorder')).recordingLogger(logs));

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
import { featureSwitchesService, featureSwitchesStub } from '@/shared/test/feature-switches-stub';

import { clearQueues, forceFlush, getQueueStats, stopAnalyticsCollector, trackAI, trackSearch } from './analytics-collector';

function recordSearch(queryText: string) {
  trackSearch({
    requestId: crypto.randomUUID(), triggerType: 'ai_tool', searchType: 'lexical', indexIds: ['idx'],
    queryText, totalResults: 1, resultsReturned: 1, durationMs: 5, success: true,
  });
}

function recordAI(queryText: string) {
  trackAI({
    requestId: crypto.randomUUID(), operation: 'chat', providerId: crypto.randomUUID(), providerKey: 'ollama', modelKey: queryText,
    inputTokens: 1, outputTokens: 1, totalTokens: 2, durationMs: 5, success: true,
  });
}

/** Both kinds of event are queued, to be flushed together. */
function record(queryText: string) {
  recordSearch(queryText);
  recordAI(queryText);
}

/**
 * Record and flush, one kind at a time. A flush that writes search and AI events imports the mocked
 * '@/db/index' twice at once, and vitest then gives the second import the real module (no database),
 * so the AI rows would be silently discarded. The collector itself is fine; only the mock is racy.
 */
async function recordAndFlush(queryText: string) {
  recordSearch(queryText);
  await forceFlush();
  recordAI(queryText);
  await forceFlush();
}

beforeAll(async () => {
  testDb = await createAnalyticsTestDb();
});
beforeEach(async () => {
  clearQueues();
  logs.length = 0;
  featureSwitchesStub.reset();
  // The collector keeps the last answer of the switch: read it again, now that it is on
  await forceFlush();
  await testDb.reset();
});
afterAll(async () => {
  await stopAnalyticsCollector();
  await testDb.close();
});

describe('analytics events with the Analytics area off', () => {
  it('are not queued once the switch is known to be off', async () => {
    featureSwitchesStub.off.add('analytics');
    await forceFlush(); // reads the switch
    record('never queued');

    expect(getQueueStats()).toMatchObject({ searchEvents: 0, aiEvents: 0 });
  });

  it('queued while it was on are dropped at the flush, with one info line giving the count', async () => {
    record('queued while on');
    featureSwitchesStub.off.add('analytics');
    await forceFlush();

    expect(getQueueStats()).toMatchObject({ searchEvents: 0, aiEvents: 0 });
    expect(logs.filter((l) => l.message.includes('dropped'))).toEqual([
      expect.objectContaining({ level: 'info', context: { dropped: 2 } }),
    ]);
  });

  it('are not recorded, and what was queued is dropped', async () => {
    featureSwitchesStub.off.add('analytics');
    recordSearch('linen shirt');
    await forceFlush();
    recordAI('linen shirt');
    await forceFlush();

    expect(await testDb.db.select().from(searchEvents)).toHaveLength(0);
    expect(await testDb.db.select().from(aiUsageEvents)).toHaveLength(0);
    expect(getQueueStats()).toMatchObject({ searchEvents: 0, aiEvents: 0 });
  });

  it('are recorded again once the area is back on', async () => {
    featureSwitchesStub.off.add('analytics');
    await forceFlush();
    record('dropped');
    await forceFlush();
    featureSwitchesStub.reset();
    await forceFlush(); // reads the switch
    await recordAndFlush('kept');

    expect((await testDb.db.select({ q: searchEvents.queryText }).from(searchEvents)).map((r) => r.q)).toEqual(['kept']);
    expect((await testDb.db.select({ m: aiUsageEvents.modelKey }).from(aiUsageEvents)).map((r) => r.m)).toEqual(['kept']);
  });

  it('keep being recorded when the switches cannot be read', async () => {
    const isAreaOn = vi.spyOn(featureSwitchesService, 'isAreaOn').mockRejectedValue(new Error('database down'));
    try {
      await expect(recordAndFlush('unreadable switches')).resolves.not.toThrow();
      expect(isAreaOn).toHaveBeenCalled();
    } finally {
      isAreaOn.mockRestore();
    }

    expect((await testDb.db.select({ q: searchEvents.queryText }).from(searchEvents)).map((r) => r.q)).toEqual(['unreadable switches']);
    expect((await testDb.db.select({ m: aiUsageEvents.modelKey }).from(aiUsageEvents)).map((r) => r.m)).toEqual(['unreadable switches']);
  });
});
