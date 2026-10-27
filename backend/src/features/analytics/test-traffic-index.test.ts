// src/features/analytics/test-traffic-index.test.ts

/**
 * Span reports leave out test traffic by looking for a test-source span in each trace. The
 * partial index on those spans keeps that from reading every span ever stored, but Postgres only
 * uses it when the check's condition is written out exactly as the index's.
 */

import { sql } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { otelSpans } from '@/db/analytics-schema';
import { ATTR } from '@/features/telemetry/attribute-keys';
import { createAnalyticsTestDb, type AnalyticsTestDb } from '@/shared/test/analytics-test-db';

import { notTestTraffic } from './analytics-query.service';

let testDb: AnalyticsTestDb;
beforeAll(async () => {
  testDb = await createAnalyticsTestDb();
});
afterAll(async () => {
  await testDb.close();
});

describe('test-traffic check on spans', () => {
  it('is written out, with no bound values, and names the attribute the pipeline records', () => {
    const query = new PgDialect().sqlToQuery(notTestTraffic(otelSpans));

    expect(query.params).toEqual([]);
    expect(query.sql).toContain(`->>'${ATTR.ANALYTICS_SOURCE}' IN ('admin_test', 'playground')`);
  });

  it('looks test spans up through the partial index', async () => {
    const check = new PgDialect().sqlToQuery(notTestTraffic(otelSpans)).sql;
    await testDb.db.execute(sql.raw('SET enable_seqscan = off'));
    const plan = await testDb.db.execute(sql.raw(`EXPLAIN SELECT count(*) FROM otel_spans WHERE ${check}`));

    expect(JSON.stringify(plan)).toContain('idx_otel_spans_test_traffic');
  });
});
