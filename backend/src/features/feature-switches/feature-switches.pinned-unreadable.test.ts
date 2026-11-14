// src/features/feature-switches/feature-switches.pinned-unreadable.test.ts

/**
 * An area the deployment setting turns off stays off when the stored switches can't be read
 * (main database down, nothing read yet): the setting needs no database. Checked through the
 * real switch service, analytics collector and trace exporter, with the analytics database
 * (PGlite) up, so anything recorded would be stored.
 */

import type { ReadableSpan } from '@opentelemetry/sdk-trace-base';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => ({ reads: 0 }));

vi.mock('server-only', () => ({}));
vi.mock('@/features/global-settings', () => ({
  getStoredFeaturesOff: vi.fn(async () => {
    store.reads++;
    throw new Error('main database down');
  }),
  updateFeaturesOff: vi.fn(),
}));

let testDb: AnalyticsTestDb;
vi.mock('@/db/index', () => ({
  get analyticsDB() {
    return testDb.db;
  },
  db: {},
}));
vi.mock('@/features/analytics/analytics-config', () => ({ analyticsFlags: { canTrackSearch: () => true, canTrackAI: () => true, canTrackTools: () => true, canTrackClicks: () => true } }));
vi.mock('@/features/analytics/analytics-retention', () => ({ startRetentionCleanup: vi.fn(), stopRetentionCleanup: vi.fn() }));

import { clearFeatureSwitchCache, isAreaOn } from './feature-switches.service';

import { searchEvents } from '@/db/analytics-schema';
import { otelSpans } from '@/db/analytics-schema/otel-spans.schema';
import { clearQueues, forceFlush, getQueueStats, stopAnalyticsCollector, trackSearch } from '@/features/analytics/analytics-collector';
import { PostgresSpanExporter } from '@/features/telemetry/postgres-span-exporter';
import { createAnalyticsTestDb, type AnalyticsTestDb } from '@/shared/test/analytics-test-db';


function span(): ReadableSpan {
  const time: [number, number] = [1_762_400_000, 0];
  return {
    name: 'search.execute',
    kind: 0,
    spanContext: () => ({ traceId: 'a'.repeat(32), spanId: 'b'.repeat(16), traceFlags: 1 }),
    parentSpanContext: undefined,
    startTime: time,
    endTime: [time[0] + 1, 0],
    status: { code: 1 },
    attributes: { 'alpha.search.query_text': 'linen' },
    events: [],
    resource: { attributes: { 'service.name': 'alpha-search' } },
    links: [], duration: [1, 0], ended: true, instrumentationScope: { name: 'test' }, droppedAttributesCount: 0, droppedEventsCount: 0, droppedLinksCount: 0,
  } as unknown as ReadableSpan;
}

beforeAll(async () => {
  testDb = await createAnalyticsTestDb();
});
beforeEach(async () => {
  process.env.INTERAKT_FEATURES_OFF = 'analytics';
  clearFeatureSwitchCache();
  clearQueues();
  store.reads = 0;
  await testDb.reset();
});
afterAll(async () => {
  delete process.env.INTERAKT_FEATURES_OFF;
  await stopAnalyticsCollector();
  await testDb.close();
});

describe('an area turned off by the deployment setting, with the switches unreadable', () => {
  it('is off without reading the database', async () => {
    expect(await isAreaOn('analytics')).toBe(false);
    expect(store.reads).toBe(0);
  });

  it('turns off what needs it when nothing else it needs is on', async () => {
    // AI summaries need Search: pinned off, AI summaries are off too, still with no read
    process.env.INTERAKT_FEATURES_OFF = 'search';
    expect(await isAreaOn('ai-summaries')).toBe(false);
    expect(store.reads).toBe(0);
  });

  it('leaves the other areas to the stored switches: unreadable, they are an error as before', async () => {
    await expect(isAreaOn('chat')).rejects.toThrow('main database down');
    expect(store.reads).toBe(1);
  });

  it('records no analytics events', async () => {
    await forceFlush(); // reads the switch
    trackSearch({
      requestId: crypto.randomUUID(), triggerType: 'ai_tool', searchType: 'lexical', indexIds: ['idx'],
      queryText: 'linen shirt', totalResults: 1, resultsReturned: 1, durationMs: 5, success: true,
    });
    await forceFlush();

    expect(getQueueStats()).toMatchObject({ searchEvents: 0 });
    expect(await testDb.db.select().from(searchEvents)).toHaveLength(0);
  });

  it('stores no traces', async () => {
    await new Promise<void>((resolve) => new PostgresSpanExporter().export([span()], () => resolve()));
    expect(await testDb.db.select().from(otelSpans)).toHaveLength(0);
  });
});
