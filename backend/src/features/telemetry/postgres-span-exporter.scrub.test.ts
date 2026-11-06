// src/features/telemetry/postgres-span-exporter.scrub.test.ts

/**
 * A failed span's status message and exception event carry the error's text, which can
 * hold a connection URL's password. They are stored with credentials scrubbed, as the
 * logs and analytics events are. Through the real exporter on real Postgres (PGlite with
 * the analytics migrations).
 */

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createAnalyticsTestDb, type AnalyticsTestDb } from '@/shared/test/analytics-test-db';

let testDb: AnalyticsTestDb;
vi.mock('@/db/index', () => ({
  get analyticsDB() {
    return testDb.db;
  },
  db: {},
}));

import type { ReadableSpan } from '@opentelemetry/sdk-trace-base';

import { otelSpans } from '@/db/analytics-schema/otel-spans.schema';

import { PostgresSpanExporter } from './postgres-span-exporter';

beforeAll(async () => {
  testDb = await createAnalyticsTestDb();
});
afterAll(async () => {
  await testDb.close();
});

const failure = 'connect ECONNREFUSED postgres://interakt:hunter2@db.internal:5432/app';

function failedSpan(): ReadableSpan {
  const time: [number, number] = [1_762_400_000, 0];
  return {
    name: 'search.execute',
    kind: 0,
    spanContext: () => ({ traceId: 'a'.repeat(32), spanId: 'b'.repeat(16), traceFlags: 1 }),
    parentSpanContext: undefined,
    startTime: time,
    endTime: [time[0] + 1, 0],
    status: { code: 2, message: failure },
    attributes: { 'alpha.search.query_text': 'linen' },
    events: [{ name: 'exception', time, attributes: { 'exception.message': failure, 'exception.type': 'Error' } }],
    resource: { attributes: { 'service.name': 'alpha-search' } },
    links: [], duration: [1, 0], ended: true, instrumentationScope: { name: 'test' }, droppedAttributesCount: 0, droppedEventsCount: 0, droppedLinksCount: 0,
  } as unknown as ReadableSpan;
}

describe('a failed span', () => {
  it('is stored without the password in its status or exception event', async () => {
    await new Promise<void>((resolve) => new PostgresSpanExporter().export([failedSpan()], () => resolve()));

    const [row] = await testDb.db.select({ status: otelSpans.statusMessage, events: otelSpans.events }).from(otelSpans);
    expect(row.status).toContain('db.internal:5432');
    expect(JSON.stringify(row)).not.toContain('hunter2');
  });
});
