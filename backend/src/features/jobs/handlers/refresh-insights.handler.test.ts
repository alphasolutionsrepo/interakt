// src/features/jobs/handlers/refresh-insights.handler.test.ts

/**
 * The nightly insights refresh covers the all-experiences view and every
 * recently active experience; one failing experience doesn't fail (and so
 * retry) the whole run.
 */

import { DrizzleQueryError } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { refreshInsightsWorker } from './refresh-insights.handler';

import { INTERNAL_MESSAGE } from '@/shared/errors/app-error';
import { failedQuery } from '@/shared/test/error-answers';
import { reported, type LogLine } from '@/shared/test/log-recorder';

const logs = vi.hoisted(() => [] as LogLine[]);
vi.mock('@/shared/logger/logger', async () => (await import('@/shared/test/log-recorder')).recordingLogger(logs));
const { runAnalyticsProcessing, listRecentlyActiveExperienceIds } = vi.hoisted(() => ({
  runAnalyticsProcessing: vi.fn(),
  listRecentlyActiveExperienceIds: vi.fn(),
}));
vi.mock('@/features/analytics/analytics-processing.service', () => ({ runAnalyticsProcessing }));
vi.mock('@/features/analytics/analytics-insights.service', () => ({ listRecentlyActiveExperienceIds }));

beforeEach(() => {
  logs.length = 0;
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
    expect(result.failures).toEqual([{ experienceId: 'exp-a', runId: undefined, code: 'INTERNAL_ERROR', message: INTERNAL_MESSAGE, requestId: expect.any(String) }]);
  });

  it("keeps a failure's own text (its SQL) out of the output, with the ids that find it in the log", async () => {
    const failed = failedQuery();
    runAnalyticsProcessing
      .mockResolvedValueOnce({ status: 'failed', runId: 'r0', error: failed.message, cause: failed })
      .mockResolvedValue({ status: 'completed', runId: 'r', durationMs: 5 });

    const [result] = await refreshInsightsWorker([{ id: 'job', data: {} }]);

    expect(JSON.stringify(result)).not.toMatch(/select|admin_chat_sessions/);
    const [failure] = result.failures;
    expect(failure).toMatchObject({ experienceId: null, runId: 'r0', code: 'INTERNAL_ERROR' });
    expect(reported(logs)).toEqual([
      expect.objectContaining({ level: 'error', context: expect.objectContaining({ runId: 'r0', requestId: failure.requestId, err: failed }) }),
    ]);
  });

  it('explains a failure it recognises (the database is down) in the output', async () => {
    const down = new DrizzleQueryError('select 1', [], Object.assign(new Error('connect ECONNREFUSED 10.0.0.5:5432'), { code: 'ECONNREFUSED' }));
    runAnalyticsProcessing
      .mockResolvedValueOnce({ status: 'failed', runId: 'r0', error: down.message, cause: down })
      .mockResolvedValue({ status: 'completed', runId: 'r', durationMs: 5 });

    const [result] = await refreshInsightsWorker([{ id: 'job', data: {} }]);

    expect(result.failures).toEqual([expect.objectContaining({ code: 'DATABASE_UNAVAILABLE', message: "The database couldn't be reached." })]);
    expect(JSON.stringify(result)).not.toContain('10.0.0.5');
  });

  it('logs a failing experience once, with the error itself so its stack is kept', async () => {
    const timeout = new Error('model timeout');
    runAnalyticsProcessing
      .mockResolvedValueOnce({ status: 'completed', runId: 'r0', durationMs: 5 })
      .mockResolvedValueOnce({ status: 'failed', runId: 'r1', error: timeout.message, cause: timeout })
      .mockResolvedValueOnce({ status: 'completed', runId: 'r2', durationMs: 5 });

    await refreshInsightsWorker([{ id: 'job', data: {} }]);

    expect(reported(logs)).toEqual([
      expect.objectContaining({ level: 'error', message: 'Insights refresh failed', context: expect.objectContaining({ experienceId: 'exp-a', runId: 'r1', err: timeout }) }),
    ]);
  });

  it('fails the job when nothing could be refreshed, so it is retried', async () => {
    runAnalyticsProcessing.mockResolvedValue({ status: 'failed', runId: 'r1', error: 'model timeout', cause: new Error('model timeout') });

    await expect(refreshInsightsWorker([{ id: 'job', data: {} }])).rejects.toThrow(`Insights refresh failed: ${INTERNAL_MESSAGE}`);
  });

  it('fails the job with a plain message and the ids, not the SQL, in what the jobs page shows', async () => {
    const failed = failedQuery();
    runAnalyticsProcessing.mockResolvedValue({ status: 'failed', runId: 'r1', error: failed.message, cause: failed });

    const thrown = await refreshInsightsWorker([{ id: 'job', data: {} }]).catch((e: unknown) => e);

    // What pg-boss stores as the failed job's output (serialize-error), and the jobs page
    // shows: the error's own fields, its message, stack and cause
    const error = thrown as Error & Record<string, unknown>;
    const output: Record<string, unknown> = { ...error, name: error.name, message: error.message, stack: error.stack, cause: error.cause };
    expect(JSON.stringify(output)).not.toMatch(/select|admin_chat_sessions/);
    expect(output).toMatchObject({ runId: 'r1', requestId: expect.any(String) });
    // The log keeps the error itself, under the same request id
    expect(reported(logs)[0].context).toMatchObject({ requestId: output.requestId, err: failed });
  });

  describe('when the analytics database is down before any run starts', () => {
    // What pg-boss stores as the failed job's output (serialize-error)
    const stored = (thrown: unknown) => {
      const error = thrown as Error & Record<string, unknown>;
      return { ...error, name: error.name, message: error.message, stack: error.stack, cause: error.cause } as Record<string, unknown>;
    };
    const down = () => new DrizzleQueryError('insert into "analytics_processing_runs" ("status") values ($1)', ['running'],
      Object.assign(new Error('connect ECONNREFUSED 10.0.0.5:5432'), { code: 'ECONNREFUSED' }));

    it('fails the job with the explanation and request id, not the SQL or the address, logged once', async () => {
      const failed = down();
      runAnalyticsProcessing.mockRejectedValue(failed);

      const thrown = await refreshInsightsWorker([{ id: 'job', data: { experienceId: 'exp-a' } }]).catch((e: unknown) => e);

      const output = stored(thrown);
      expect(JSON.stringify(output)).not.toMatch(/insert into|10\.0\.0\.5/);
      expect(output.message).toBe("Insights refresh failed: The database couldn't be reached.");
      expect(reported(logs)).toEqual([expect.objectContaining({ level: 'error', context: expect.objectContaining({ requestId: output.requestId, err: failed }) })]);
    });

    it('does the same when listing the active experiences fails', async () => {
      const failed = down();
      listRecentlyActiveExperienceIds.mockRejectedValue(failed);

      const thrown = await refreshInsightsWorker([{ id: 'job', data: {} }]).catch((e: unknown) => e);

      const output = stored(thrown);
      expect(JSON.stringify(output)).not.toMatch(/insert into|10\.0\.0\.5/);
      expect(output).toMatchObject({ requestId: expect.any(String) });
      expect(reported(logs)).toEqual([expect.objectContaining({ level: 'error', context: expect.objectContaining({ err: failed }) })]);
    });
  });

  it('says analytics isn\'t set up when there is no analytics database', async () => {
    const { SetupRequiredError } = await import('@/shared/errors/app-error');
    // What runAnalyticsProcessing returns without ANALYTICS_POSTGRES_URL
    runAnalyticsProcessing.mockResolvedValue({ status: 'failed', runId: '', error: 'Analytics DB not configured',
      cause: new SetupRequiredError("Analytics isn't set up: set ANALYTICS_POSTGRES_URL to the analytics database") });

    await expect(refreshInsightsWorker([{ id: 'job', data: { experienceId: 'exp-a' } }])).rejects.toThrow(/ANALYTICS_POSTGRES_URL/);
  });
});
