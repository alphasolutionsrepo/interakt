// src/features/jobs/job-queues.ts

/**
 * Queue registry
 *
 * Single source of truth for every background queue the platform knows about.
 * Adding a queue here (plus a handler in ./handlers) is all it takes to make it
 * bootable, schedulable, and visible in the admin UI.
 */

/** Postgres schema pg-boss owns. It creates/manages these tables itself. */
export const JOBS_SCHEMA = 'pgboss';

/** Canonical queue names. Use these constants everywhere instead of literals. */
export const QUEUE = {
  /** Recompute analytics AI insights (wraps the analytics processing pipeline). */
  REFRESH_INSIGHTS: 'refresh-insights',
} as const;

export type QueueName = (typeof QUEUE)[keyof typeof QUEUE];

/** Payload for {@link QUEUE.REFRESH_INSIGHTS}. */
export interface RefreshInsightsPayload {
  /** Limit processing to one experience; omit to process all active ones. */
  experienceId?: string;
  /** Who/what enqueued this run — surfaced in the analytics run record. */
  triggeredBy?: string;
}

// The set of job types that actually boot lives in ./job-registry.ts (it also
// carries the workers + UI metadata). This file holds only the plain name
// constants/types, so it stays safe to import from anywhere.
