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

function failedSpan(extra: { attributes?: Record<string, unknown>; events?: unknown[]; spanId?: string } = {}): ReadableSpan {
  const time: [number, number] = [1_762_400_000, 0];
  return {
    name: 'search.execute',
    kind: 0,
    spanContext: () => ({ traceId: 'a'.repeat(32), spanId: extra.spanId ?? 'b'.repeat(16), traceFlags: 1 }),
    parentSpanContext: undefined,
    startTime: time,
    endTime: [time[0] + 1, 0],
    status: { code: 2, message: failure },
    attributes: { 'alpha.search.query_text': 'linen', ...extra.attributes },
    events: [{ name: 'exception', time, attributes: { 'exception.message': failure, 'exception.type': 'Error' } }, ...(extra.events ?? [])],
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

describe('a span that keeps content', () => {
  const time: [number, number] = [1_762_400_000, 0];

  it("keeps the visitor's words as written, and scrubs the error text around them", async () => {
    await new Promise<void>((resolve) => new PostgresSpanExporter().export([failedSpan({
      spanId: 'c'.repeat(16),
      attributes: {
        'alpha.telemetry.content_recorded': true,
        'alpha.search.query': 'Basic 12-pack',
        'alpha.error.detail': [failure, 'token=sk-live-123'],
        // A content attribute, but a failure's text: scrubbed like any error
        'alpha.v2.step.error': 'Search failed: postgres://interakt:s3cret-step@db.internal:5432/app',
      },
      events: [{ name: 'ai.response', time, attributes: { 'ai.response.text': 'Try the Basic 12-pack' } }],
    })], () => resolve()));

    const rows = await testDb.db.select({ attributes: otelSpans.attributes, events: otelSpans.events }).from(otelSpans);
    const row = rows.find((r) => JSON.stringify(r).includes('12-pack'))!;
    expect(row.attributes).toMatchObject({ 'alpha.search.query': 'Basic 12-pack' });
    expect(JSON.stringify(row.events)).toContain('Try the Basic 12-pack');
    expect(JSON.stringify(row)).not.toContain('hunter2');
    expect(JSON.stringify(row)).not.toContain('sk-live-123');
    expect(JSON.stringify(row)).not.toContain('s3cret-step');
  });
});
