// src/features/analytics/analytics-insights.service.test.ts

/**
 * Reading stored proactive insights for the overview's "What needs attention"
 * list: each state (computed, nothing to compute, never processed) is reported
 * as itself, and an experience's insights are never mixed with another's.
 * Runs on real Postgres (PGlite) with the analytics migrations applied.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createAnalyticsTestDb, type AnalyticsTestDb } from '@/shared/test/analytics-test-db';

let testDb: AnalyticsTestDb;
vi.mock('@/db/index', () => ({
  get analyticsDB() {
    return testDb.db;
  },
}));

import { analyticsHiddenFindings, analyticsInsights, otelSpans, searchEvents } from '@/db/analytics-schema';

import {
  getProactiveInsights,
  getStoredInsight,
  hideFinding,
  listRecentlyActiveExperienceIds,
  unhideFinding,
} from './analytics-insights.service';

const insight = {
  id: 'zero-results',
  severity: 'warning',
  category: 'search_quality',
  title: 'Searches for gift cards find nothing',
  description: '38 searches found nothing',
};

beforeAll(async () => {
  testDb = await createAnalyticsTestDb();
});
beforeEach(async () => {
  await testDb.reset();
});
afterAll(async () => {
  await testDb.close();
});

describe('getProactiveInsights', () => {
  it('returns the stored insights with when they were computed', async () => {
    const experienceId = crypto.randomUUID();
    const processedAt = new Date('2026-10-22T02:00:00Z');
    await testDb.db.insert(analyticsInsights).values({
      experienceId,
      insightType: 'proactive_insights',
      timeRange: '7d',
      data: { insights: [insight] },
      processedAt,
    });

    expect(await getProactiveInsights('7d', experienceId)).toEqual({
      status: 'ready',
      timeRange: '7d',
      processedAt: processedAt.toISOString(),
      insights: [insight],
      hidden: [],
    });
  });

  it('keeps hidden findings apart until they come back, per experience', async () => {
    const experienceId = crypto.randomUUID();
    const other = { ...insight, id: 'cost_retry_waste', title: 'Retries waste tokens' };
    for (const scope of [experienceId, null]) {
      await testDb.db.insert(analyticsInsights).values({
        experienceId: scope,
        insightType: 'proactive_insights',
        timeRange: '7d',
        data: { insights: [insight, other] },
      });
    }

    const until = await hideFinding(insight.id, experienceId, 7);
    const result = await getProactiveInsights('7d', experienceId);
    expect(result.insights.map((i) => i.id)).toEqual(['cost_retry_waste']);
    expect(result.hidden).toEqual([{ ...insight, hiddenUntil: until.toISOString() }]);
    // Hiding it for one experience leaves the all-experiences view alone
    expect((await getProactiveInsights('7d')).insights).toHaveLength(2);

    await unhideFinding(insight.id, experienceId);
    expect((await getProactiveInsights('7d', experienceId)).hidden).toEqual([]);
  });

  it('shows a finding again once its hide runs out', async () => {
    await testDb.db.insert(analyticsInsights).values({
      experienceId: null,
      insightType: 'proactive_insights',
      timeRange: '7d',
      data: { insights: [insight] },
    });
    await testDb.db.insert(analyticsHiddenFindings).values({
      scope: 'all',
      findingId: insight.id,
      hiddenUntil: new Date(Date.now() - 1000),
    });

    expect((await getProactiveInsights('7d')).insights).toHaveLength(1);
  });

  it('reports a period with no activity as no data, not as nothing wrong', async () => {
    await testDb.db.insert(analyticsInsights).values({
      experienceId: null,
      insightType: 'proactive_insights',
      timeRange: '7d',
      data: { empty: true, reason: 'no_spans' },
    });

    const result = await getProactiveInsights('7d');
    expect(result.status).toBe('no_data');
    expect(result.insights).toEqual([]);
  });

  it('reports insights that were never computed as not processed', async () => {
    expect((await getProactiveInsights('7d', crypto.randomUUID())).status).toBe('not_processed');
  });

  it('keeps experiences and the all-experiences view apart', async () => {
    const experienceId = crypto.randomUUID();
    await testDb.db.insert(analyticsInsights).values({
      experienceId: null,
      insightType: 'proactive_insights',
      timeRange: '7d',
      data: { insights: [insight] },
    });

    expect((await getProactiveInsights('7d', experienceId)).status).toBe('not_processed');
    expect((await getProactiveInsights('24h')).status).toBe('not_processed');
  });
});

describe('getStoredInsight', () => {
  it('serves intent clusters without the visitor messages and queries they keep', async () => {
    await testDb.db.insert(analyticsInsights).values({
      experienceId: null,
      insightType: 'intent_clusters',
      timeRange: '7d',
      data: {
        totalIntents: 12,
        uniqueIntents: 2,
        processingDurationMs: 40,
        clusters: [
          { label: 'Delivery times', count: 9, avgOutcomeSuccess: 0.4, samples: ['when will my order arrive'], topQueries: ['delivery'] },
        ],
      },
    });

    const result = await getStoredInsight('intent_clusters', '7d');

    expect(result.status).toBe('ready');
    expect(result.data).toEqual({
      totalIntents: 12,
      uniqueIntents: 2,
      clusters: [{ label: 'Delivery times', count: 9, avgOutcomeSuccess: 0.4 }],
    });
  });

  it('returns other insight types as stored', async () => {
    const data = { totalConversations: 4, successRate: 0.75, outcomes: { success: 3, plan_failed: 1 } };
    await testDb.db.insert(analyticsInsights).values({ experienceId: null, insightType: 'ai_effectiveness', timeRange: '24h', data });

    expect((await getStoredInsight('ai_effectiveness', '24h')).data).toEqual(data);
  });
});

describe('listRecentlyActiveExperienceIds', () => {
  it('lists experiences with chat traces or searches in the window, once each', async () => {
    const [chat, search, both, idle] = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
    const daysAgo = (d: number) => new Date(Date.now() - d * 24 * 60 * 60 * 1000);

    const span = (experienceId: string, startTime: Date, n: number) => ({
      traceId: crypto.randomUUID().replace(/-/g, ''),
      spanId: n.toString(16).padStart(16, '0'),
      operationName: 'pipeline.v2.turn',
      serviceName: 'interakt',
      startTime,
      endTime: startTime,
      durationMs: 1,
      experienceId,
      attributes: {},
    });
    const search_ = (experienceId: string, timestamp: Date) => ({
      requestId: crypto.randomUUID(),
      timestamp,
      triggerType: 'user',
      searchType: 'lexical',
      indexIds: [],
      experienceId,
      queryText: 'shoes',
      queryNormalized: 'shoes',
      queryLength: 5,
      queryWordCount: 1,
      totalResults: 1,
      resultsReturned: 1,
      durationMs: 1,
      success: true,
    });

    await testDb.db.insert(otelSpans).values([span(chat, daysAgo(2), 1), span(both, daysAgo(3), 2), span(idle, daysAgo(45), 3)]);
    await testDb.db.insert(searchEvents).values([search_(search, daysAgo(1)), search_(both, daysAgo(1)), search_(idle, daysAgo(40))]);

    expect((await listRecentlyActiveExperienceIds(30)).sort()).toEqual([chat, search, both].sort());
  });
});
