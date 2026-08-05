// src/features/jobs/index.ts

/**
 * Background Jobs feature
 *
 * Postgres-backed job engine (pg-boss) for scheduled and on-demand long-running
 * work, with a native admin UI. See jobs.boot.ts for the engine lifecycle and
 * job-queues.ts for the queue registry.
 */

export { startJobs, ensureJobsStarted, getBoss, isJobsReady } from './jobs.boot';
export { QUEUE, type QueueName } from './job-queues';
export { JOB_TYPES, getJobType, isRegisteredQueue, type JobTypeDef } from './job-registry';
export * from './jobs.types';
