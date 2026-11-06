// src/features/analytics/analytics-processing.no-finished-turns.test.ts

/**
 * When the visitor left every turn, none finished: the AI effectiveness insight has no
 * success rate or turn time, rather than 0% and 0 ms. Runs the insights job on real
 * Postgres (PGlite); clustering and proactive insights (model calls) are stubbed.
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
vi.mock('./intent-clustering', () => ({
  clusterIntents: vi.fn(async () => ({ clusters: [], totalIntents: 0, uniqueIntents: 0, processingDurationMs: 0 })),
}));
vi.mock('./proactive-insights.service', () => ({ detectProactiveInsights: vi.fn(() => []) }));

import { eq } from 'drizzle-orm';

import { analyticsInsights, otelSpans } from '@/db/analytics-schema';
import { ATTR } from '@/features/telemetry/attribute-keys';

import { runAnalyticsProcessing } from './analytics-processing.service';

beforeAll(async () => {
  testDb = await createAnalyticsTestDb();
  const start = new Date(Date.now() - 10 * 60_000);
  await testDb.db.insert(otelSpans).values({
    traceId: 'd'.repeat(32),
    spanId: '1'.padStart(16, '0'),
    operationName: 'pipeline.v2.turn',
    serviceName: 'interakt',
    startTime: start,
    endTime: new Date(start.getTime() + 100),
    durationMs: 100,
    experienceId: null,
    // As the pipeline records a turn the visitor left: no outcome, where it stopped
    attributes: { [ATTR.TURN_ABANDONED]: 'writing the answer' },
  });
});
afterAll(async () => {
  await testDb.close();
});

describe('AI effectiveness when the visitor left every turn', () => {
  it('has no success rate or turn time, rather than 0%', async () => {
    await runAnalyticsProcessing({ timeRanges: ['24h'] });

    const [row] = await testDb.db.select({ data: analyticsInsights.data }).from(analyticsInsights)
      .where(eq(analyticsInsights.insightType, 'ai_effectiveness'));
    expect(row.data).toMatchObject({ totalConversations: 0, successRate: null, avgDurationMs: null });
  });
});
