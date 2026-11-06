// src/features/analytics/analytics-processing.abandoned-turns.test.ts

/**
 * A chat turn the visitor left before it had an outcome neither succeeded nor failed: the AI
 * effectiveness insight doesn't rate it or count its plan, and intent clustering doesn't
 * count its intent. Runs
 * the insights job on real Postgres (PGlite); clustering and proactive insights (model calls)
 * are stubbed.
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
import { clusterIntents } from './intent-clustering';

let spanCount = 0;
const traces = { success: 'a'.repeat(32), abandoned: 'b'.repeat(32), planFailed: 'c'.repeat(32) };
function turn(attributes: Record<string, unknown>, traceId = crypto.randomUUID().replace(/-/g, ''), operationName = 'pipeline.v2.turn') {
  const start = new Date(Date.now() - 10 * 60_000);
  return {
    traceId,
    spanId: (++spanCount).toString(16).padStart(16, '0'),
    operationName,
    serviceName: 'interakt',
    startTime: start,
    endTime: new Date(start.getTime() + 100),
    durationMs: 100,
    experienceId: null,
    attributes,
  };
}

beforeAll(async () => {
  testDb = await createAnalyticsTestDb();
  await testDb.db.insert(otelSpans).values([
    turn({ 'alpha.v2.outcome': 'success' }, traces.success),
    // As the pipeline records a turn the visitor left: no outcome, where it stopped
    turn({ [ATTR.TURN_ABANDONED]: 'writing the answer' }, traces.abandoned),
    // Its plan had failed before the visitor left: that still counts
    turn({ 'alpha.v2.outcome': 'plan_failed', [ATTR.TURN_ABANDONED]: 'saving the turn' }, traces.planFailed),
    ...Object.entries(traces).map(([name, traceId]) => turn({ 'alpha.v2.plan.reasoning': `find ${name}` }, traceId, 'pipeline.v2.turn_planner')),
  ]);
});
afterAll(async () => {
  await testDb.close();
});

describe('AI effectiveness', () => {
  it("doesn't rate a turn the visitor left before it had an outcome", async () => {
    await runAnalyticsProcessing({ timeRanges: ['24h'] });

    const [row] = await testDb.db.select({ data: analyticsInsights.data }).from(analyticsInsights)
      .where(eq(analyticsInsights.insightType, 'ai_effectiveness'));
    expect(row.data).toMatchObject({
      totalConversations: 2,
      successRate: 0.5,
      outcomes: { success: 1, plan_failed: 1, context_assembly_failed: 0, unknown: 0 },
      // The same turns' plans: the one the visitor left isn't among the decisions either
      decisions: { direct_response: 0, tool_call: 2, unknown: 0 },
    });
  });
});

describe('intent clustering', () => {
  it("leaves out the intent of a turn the visitor left, and keeps one whose plan had failed", async () => {
    await runAnalyticsProcessing({ timeRanges: ['24h'] });

    const entries = vi.mocked(clusterIntents).mock.calls.at(-1)?.[0] ?? [];
    expect(entries.map((e) => [e.reasoning, e.outcome]).sort()).toEqual([['find planFailed', 'plan_failed'], ['find success', 'success']]);
  });
});
