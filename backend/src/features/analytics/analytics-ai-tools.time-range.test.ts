// src/features/analytics/analytics-ai-tools.time-range.test.ts

/**
 * Analytics chat tools report the period their data actually covers. Precomputed
 * insights only exist for 24h/7d/30d, so a "last hour" request reads the 24h insight
 * and must say so. Runs on real Postgres (PGlite) with the analytics migrations applied.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createAnalyticsTestDb, type AnalyticsTestDb } from '@/shared/test/analytics-test-db';

let testDb: AnalyticsTestDb;
vi.mock('@/db/index', () => ({
  get analyticsDB() {
    return testDb.db;
  },
}));

import { analyticsInsights } from '@/db/analytics-schema';

import { executeAnalyticsTool } from './analytics-ai-tools';

beforeAll(async () => {
  testDb = await createAnalyticsTestDb();
});
beforeEach(async () => {
  await testDb.reset();
});
afterAll(async () => {
  await testDb.close();
});

describe('time range reported by analytics tools', () => {
  it('reports 24 hours when a precomputed insight is asked for the last hour', async () => {
    const experienceId = crypto.randomUUID();
    await testDb.db.insert(analyticsInsights).values({
      experienceId,
      insightType: 'cost_analysis',
      timeRange: '24h',
      data: { totalTokens: 1000 },
    });

    const result = await executeAnalyticsTool('get_cost_analysis', { timeRange: '1h', experienceId });

    expect(result.success).toBe(true);
    expect(result.timeRange).toBe('24h');
  });

  it('reports the requested range when the tool can read it', async () => {
    const experienceId = crypto.randomUUID();
    await testDb.db.insert(analyticsInsights).values({
      experienceId,
      insightType: 'cost_analysis',
      timeRange: '30d',
      data: { totalTokens: 1000 },
    });

    const result = await executeAnalyticsTool('get_cost_analysis', { timeRange: '30d', experienceId });

    expect(result.timeRange).toBe('30d');
  });

  it('reads the 30-day insight for a 90-day period, the nearest one stored', async () => {
    const experienceId = crypto.randomUUID();
    await testDb.db.insert(analyticsInsights).values({
      experienceId,
      insightType: 'cost_analysis',
      timeRange: '30d',
      data: { totalTokens: 1000 },
    });

    const result = await executeAnalyticsTool('get_cost_analysis', { timeRange: '90d', experienceId });

    expect(result.timeRange).toBe('30d');
  });

  it('reports no range for the latest-searches tool, which ignores it', async () => {
    const result = await executeAnalyticsTool('get_recent_searches', { timeRange: '30d', experienceId: crypto.randomUUID() });

    expect(result.success).toBe(true);
    expect(result.timeRange).toBeUndefined();
  });
});
