// src/features/jobs/job-registry.ts

import 'server-only';

import { refreshInsightsWorker } from './handlers/refresh-insights.handler';
import { QUEUE } from './job-queues';

/**
 * Job-type registry — the single place that defines what background jobs exist.
 *
 * To add a new job type:
 *   1. Write a worker in ./handlers (an async fn taking an array of jobs).
 *   2. Add a queue name to QUEUE in ./job-queues.ts.
 *   3. Add one entry below.
 * Boot picks it up automatically (creates the queue + registers the worker), the
 * operator console lists it, and status/actions work with no further changes.
 */
export interface JobTypeDef {
  /** Queue name — must be unique. */
  queue: string;
  /** Human label shown in the operator console. */
  label: string;
  /** What the job does + what its payload looks like. */
  description: string;
  /** Example payload, prefilled in the "New Job" dialog. */
  payloadExample?: Record<string, unknown>;
  /** Worker invoked per batch of claimed jobs. */
  worker: (jobs: Array<{ id: string; data: never }>) => Promise<unknown>;
  /** Jobs processed per batch (default 1 — serialize heavy work). */
  batchSize?: number;
  /**
   * Schedule set once, the first time the jobs engine starts with this job type.
   * Changing or removing it in the operator console sticks: it is not set again.
   * Omit for jobs that only run on demand.
   */
  defaultSchedule?: { cron: string; timezone: string };
  /**
   * Queue settings, applied at every boot (existing queues are updated too). pg-boss
   * defaults are 15 minutes to expire and 2 retries, which suits short jobs only.
   */
  queueOptions?: { expireInSeconds?: number; retryLimit?: number };
}

/**
 * Nightly insights refresh, so "What needs attention" is current each morning.
 * INSIGHTS_REFRESH_CRON changes the time; set it to "off" to keep insights
 * on-demand only. INSIGHTS_REFRESH_TIMEZONE is an IANA zone (default UTC).
 */
function insightsRefreshSchedule(): JobTypeDef['defaultSchedule'] {
  const cron = process.env.INSIGHTS_REFRESH_CRON?.trim() || '0 2 * * *';
  if (cron.toLowerCase() === 'off') return undefined;
  return { cron, timezone: process.env.INSIGHTS_REFRESH_TIMEZONE?.trim() || 'UTC' };
}

export const JOB_TYPES: readonly JobTypeDef[] = [
  {
    queue: QUEUE.REFRESH_INSIGHTS,
    label: 'Refresh AI insights',
    description:
      'Recompute analytics AI insights. Omit experienceId to process all experiences combined, then each experience active in the last 30 days.',
    payloadExample: { experienceId: '' },
    worker: refreshInsightsWorker,
    batchSize: 1,
    defaultSchedule: insightsRefreshSchedule(),
    // One run covers every active experience, so it can take a while. Expiring it
    // mid-run and retrying would process (and pay for) the same work again; a run
    // that fails is picked up by the next night's.
    queueOptions: { expireInSeconds: 4 * 60 * 60, retryLimit: 0 },
  },
];

const BY_QUEUE = new Map(JOB_TYPES.map(t => [t.queue, t]));

export function getJobType(queue: string): JobTypeDef | undefined {
  return BY_QUEUE.get(queue);
}

export function isRegisteredQueue(queue: string): boolean {
  return BY_QUEUE.has(queue);
}
