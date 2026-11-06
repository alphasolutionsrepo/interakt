// src/features/jobs/handlers/refresh-insights.handler.ts

import type { RefreshInsightsPayload } from '../job-queues';

import { describeUnloggedError } from '@/shared/api/response';
import { createLogger } from '@/shared/logger/logger';

const logger = createLogger('job-refresh-insights');

/** Experiences with activity in this many days get their insights refreshed. */
const ACTIVE_WITHIN_DAYS = 30;

/**
 * Worker for the `refresh-insights` queue.
 *
 * pg-boss batches jobs to a worker, so we receive an array. For this queue each
 * job is an independent insights recompute; we run them sequentially to avoid
 * piling several multi-LLM-call pipelines onto the server at once.
 *
 * A job with an experienceId refreshes that experience. A job without one (the
 * nightly schedule) refreshes the all-experiences view and then every experience
 * with recent activity, so each experience's "What needs attention" list stays
 * current.
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
  const { listRecentlyActiveExperienceIds } = await import(
    '@/features/analytics/analytics-insights.service'
  );

  const results = [];
  for (const job of jobs) {
    const { experienceId, triggeredBy } = job.data ?? {};
    const scopes: Array<string | undefined> = experienceId
      ? [experienceId]
      : [undefined, ...(await listRecentlyActiveExperienceIds(ACTIVE_WITHIN_DAYS))];

    logger.info('Refreshing AI insights', { jobId: job.id, experienceId, scopes: scopes.length });

    const runs = [];
    const failures = [];
    for (const scope of scopes) {
      const result = await runAnalyticsProcessing({
        experienceId: scope,
        triggeredBy: triggeredBy ?? 'scheduler',
      });
      if (result.status === 'failed') {
        // The output shows the explanation, or a plain message, and the ids that find the
        // error in the log; its own text (often SQL) stays in the log and the run history
        const { code, message, requestId } = describeUnloggedError(result.cause).body;
        logger.error('Insights refresh failed', { jobId: job.id, experienceId: scope, runId: result.runId, requestId, err: result.cause });
        failures.push({ experienceId: scope ?? null, runId: result.runId, code, message, requestId });
      } else {
        runs.push({ experienceId: scope ?? null, runId: result.runId, durationMs: result.durationMs });
      }
    }

    // Throwing marks the job failed and lets pg-boss retry it. Only do that when
    // nothing succeeded: a retry reprocesses every scope, so one failing
    // experience shouldn't redo the others. Partial failures are in the output.
    // pg-boss stores the thrown error, its cause included, as the job's output, which the
    // jobs page shows: so it carries the plain message and the ids, not the cause.
    if (runs.length === 0 && failures.length > 0) {
      const { message, runId, requestId } = failures[0];
      throw Object.assign(new Error(`Insights refresh failed: ${message}`), { runId, requestId });
    }

    logger.info('Insights refresh complete', { jobId: job.id, refreshed: runs.length, failed: failures.length });
    results.push({ jobId: job.id, runs, failures });
  }

  return results;
}
