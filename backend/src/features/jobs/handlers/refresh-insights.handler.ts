// src/features/jobs/handlers/refresh-insights.handler.ts

import type { RefreshInsightsPayload } from '../job-queues';

import { createLogger } from '@/shared/logger/logger';

const logger = createLogger('job-refresh-insights');

/**
 * Worker for the `refresh-insights` queue.
 *
 * pg-boss batches jobs to a worker, so we receive an array. For this queue each
 * job is an independent insights recompute; we run them sequentially to avoid
 * piling several multi-LLM-call pipelines onto the server at once.
 *
 * The returned value becomes the job's `output`, visible in the admin UI.
 */
export async function refreshInsightsWorker(
  jobs: Array<{ id: string; data: RefreshInsightsPayload }>
) {
  // Imported lazily so the analytics feature (and its DB clients) only load
  // when a job actually runs, not at module-eval time.
  const { runAnalyticsProcessing } = await import(
    '@/features/analytics/analytics-processing.service'
  );

  const results = [];
  for (const job of jobs) {
    const { experienceId, triggeredBy } = job.data ?? {};
    logger.info('Refreshing AI insights', { jobId: job.id, experienceId });

    const result = await runAnalyticsProcessing({
      experienceId,
      triggeredBy: triggeredBy ?? 'scheduler',
    });

    if (result.status === 'failed') {
      // Throwing marks the job failed and lets pg-boss apply its retry policy.
      logger.error('Insights refresh failed', {
        jobId: job.id,
        error: result.error,
      });
      throw new Error(result.error ?? 'Insights refresh failed');
    }

    logger.info('Insights refresh complete', {
      jobId: job.id,
      runId: result.runId,
      durationMs: result.durationMs,
    });
    results.push({ jobId: job.id, runId: result.runId });
  }

  return results;
}
