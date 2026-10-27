// src/features/analytics/analytics-processing.test-traffic.test.ts

/**
 * Insights are built from live traffic only: every span of an admin test chat's trace is left
 * out, though only its chat turn span records the source. Runs the insights job on real
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

import { otelSpans } from '@/db/analytics-schema';
import { ATTR } from '@/features/telemetry/attribute-keys';

import { runAnalyticsProcessing } from './analytics-processing.service';
import { getRetryAnalysis } from './conversation-analytics.service';

let spanCount = 0;
function span(traceId: string, operationName: string, attributes: Record<string, unknown>) {
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

/** One chat turn as recorded: the source only on the chat turn span */
function turn(source: string) {
  const traceId = crypto.randomUUID().replace(/-/g, '');
  return [
    span(traceId, 'chat.ai_experience.turn', { [ATTR.ANALYTICS_SOURCE]: source, 'alpha.chat.user_message': 'red shoes' }),
    span(traceId, 'pipeline.v2.turn', { 'alpha.v2.outcome': 'success' }),
    span(traceId, 'tool.execute', { 'alpha.tool.slug': 'catalog-search', 'alpha.tool.result_count': 0 }),
  ];
}

beforeAll(async () => {
  testDb = await createAnalyticsTestDb();
  await testDb.db.insert(otelSpans).values([...turn('api'), ...turn('admin_test'), ...turn('playground')]);
});
afterAll(async () => {
  await testDb.close();
});

describe('insights and retry analysis leave out test chats', () => {
  it('fetches only the live chat turn\'s spans for insights', async () => {
    const result = await runAnalyticsProcessing({ timeRanges: ['24h'] });

    expect(result.steps.find((s) => s.step === 'fetch_spans_24h')?.count).toBe(3);
  });

  it('counts only live tool runs in retry analysis', async () => {
    expect((await getRetryAnalysis('24h')).totalSearches).toBe(1);
  });
});
