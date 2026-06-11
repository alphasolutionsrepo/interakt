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
}

export const JOB_TYPES: readonly JobTypeDef[] = [
  {
    queue: QUEUE.REFRESH_INSIGHTS,
    label: 'Refresh AI insights',
    description:
      'Recompute analytics AI insights. Omit experienceId to process all active experiences.',
    payloadExample: { experienceId: '' },
    worker: refreshInsightsWorker,
    batchSize: 1,
  },
];

const BY_QUEUE = new Map(JOB_TYPES.map(t => [t.queue, t]));

export function getJobType(queue: string): JobTypeDef | undefined {
  return BY_QUEUE.get(queue);
}

export function isRegisteredQueue(queue: string): boolean {
  return BY_QUEUE.has(queue);
}
