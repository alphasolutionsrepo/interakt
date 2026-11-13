// src/features/telemetry/postgres-span-exporter.feature-off.test.ts

/**
 * With the Analytics area turned off no traces are stored; back on, they are. Through the
 * real exporter on real Postgres (PGlite with the analytics migrations).
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createAnalyticsTestDb, type AnalyticsTestDb } from '@/shared/test/analytics-test-db';

let testDb: AnalyticsTestDb;
vi.mock('@/db/index', () => ({
  get analyticsDB() {
    return testDb.db;
  },
  db: {},
}));
vi.mock('@/features/feature-switches/feature-switches.service', async () => (await import('@/shared/test/feature-switches-stub')).featureSwitchesService);

import type { ReadableSpan } from '@opentelemetry/sdk-trace-base';

import { otelSpans } from '@/db/analytics-schema/otel-spans.schema';
import * as featureSwitches from '@/features/feature-switches/feature-switches.service';
import { featureSwitchesStub } from '@/shared/test/feature-switches-stub';

import { PostgresSpanExporter } from './postgres-span-exporter';

beforeAll(async () => {
  testDb = await createAnalyticsTestDb();
});
beforeEach(async () => {
  featureSwitchesStub.reset();
  await testDb.db.delete(otelSpans);
});
afterEach(() => vi.restoreAllMocks());
afterAll(async () => {
  await testDb.close();
});

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
const exportSpan = () => new Promise<void>((resolve) => new PostgresSpanExporter().export([span()], () => resolve()));

describe('traces with the Analytics area off', () => {
  it('are not stored, and are again once it is back on', async () => {
    featureSwitchesStub.off.add('analytics');
    await exportSpan();
    expect(await testDb.db.select().from(otelSpans)).toHaveLength(0);

    featureSwitchesStub.reset();
    await exportSpan();
    expect(await testDb.db.select().from(otelSpans)).toHaveLength(1);
  });

  it('are still stored when the switch cannot be read', async () => {
    vi.spyOn(featureSwitches, 'isAreaOn').mockRejectedValue(new Error('switch store unavailable'));
    await exportSpan();
    expect(await testDb.db.select().from(otelSpans)).toHaveLength(1);
  });
});
