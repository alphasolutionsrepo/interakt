// src/features/jobs/handlers/refresh-insights.handler.test.ts

/**
 * The nightly insights refresh covers the all-experiences view and every
 * recently active experience; one failing experience doesn't fail (and so
 * retry) the whole run.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { runAnalyticsProcessing, listRecentlyActiveExperienceIds } = vi.hoisted(() => ({
  runAnalyticsProcessing: vi.fn(),
  listRecentlyActiveExperienceIds: vi.fn(),
}));
vi.mock('@/features/analytics/analytics-processing.service', () => ({ runAnalyticsProcessing }));
vi.mock('@/features/analytics/analytics-insights.service', () => ({ listRecentlyActiveExperienceIds }));

import { refreshInsightsWorker } from './refresh-insights.handler';

beforeEach(() => {
  runAnalyticsProcessing.mockReset();
  listRecentlyActiveExperienceIds.mockReset().mockResolvedValue(['exp-a', 'exp-b']);
});

describe('refreshInsightsWorker', () => {
  it('refreshes only the given experience', async () => {
    runAnalyticsProcessing.mockResolvedValue({ status: 'completed', runId: 'r1', durationMs: 5 });

    await refreshInsightsWorker([{ id: 'job', data: { experienceId: 'exp-a', triggeredBy: 'admin' } }]);

    expect(runAnalyticsProcessing.mock.calls).toEqual([[{ experienceId: 'exp-a', triggeredBy: 'admin' }]]);
    expect(listRecentlyActiveExperienceIds).not.toHaveBeenCalled();
  });

  it('without an experience, refreshes the combined view and then each active experience', async () => {
    runAnalyticsProcessing.mockResolvedValue({ status: 'completed', runId: 'r', durationMs: 5 });

    await refreshInsightsWorker([{ id: 'job', data: { triggeredBy: 'schedule' } }]);

    expect(runAnalyticsProcessing.mock.calls.map(([o]) => o.experienceId)).toEqual([undefined, 'exp-a', 'exp-b']);
  });

  it('reports a failing experience without failing the job', async () => {
    runAnalyticsProcessing
      .mockResolvedValueOnce({ status: 'completed', runId: 'r0', durationMs: 5 })
      .mockResolvedValueOnce({ status: 'failed', error: 'model timeout' })
      .mockResolvedValueOnce({ status: 'completed', runId: 'r2', durationMs: 5 });

    const [result] = await refreshInsightsWorker([{ id: 'job', data: {} }]);

    expect(result.runs.map((r) => r.experienceId)).toEqual([null, 'exp-b']);
    expect(result.failures).toEqual([{ experienceId: 'exp-a', error: 'model timeout' }]);
  });

  it('fails the job when nothing could be refreshed, so it is retried', async () => {
    runAnalyticsProcessing.mockResolvedValue({ status: 'failed', error: 'analytics DB down' });

    await expect(refreshInsightsWorker([{ id: 'job', data: {} }])).rejects.toThrow('analytics DB down');
  });
});
