// src/features/jobs/jobs.types.ts

/**
 * Background Jobs — shared types
 *
 * The job engine is pg-boss (Postgres-backed). These types describe the
 * admin-facing shape of jobs/queues/schedules, decoupled from pg-boss internals
 * so the UI never imports pg-boss directly.
 */

/** Lifecycle states a pg-boss job can be in. */
export type JobState =
  | 'created'
  | 'retry'
  | 'active'
  | 'completed'
  | 'cancelled'
  | 'failed';

/** A single job row, flattened for the admin UI. */
export interface JobRecord {
  id: string;
  /** Queue name the job belongs to. */
  queue: string;
  state: JobState;
  /** Job payload (what the handler receives). */
  data: unknown;
  /** Handler output / error details once the job has run. */
  output: unknown;
  retryCount: number;
  retryLimit: number;
  createdOn: string;
  startedOn: string | null;
  completedOn: string | null;
}

/** Per-queue rollup with live state counts. */
export interface QueueSummary {
  name: string;
  /** Jobs waiting to run (created + retry). */
  queuedCount: number;
  /** Jobs currently executing. */
  activeCount: number;
  /** Jobs scheduled for the future (deferred). */
  deferredCount: number;
  totalCount: number;
}

/** A registered cron schedule. */
export interface ScheduleRecord {
  name: string;
  cron: string;
  timezone: string;
  data: unknown;
}

/** Registry metadata for one job type, sent to the operator console. */
export interface JobTypeInfo {
  queue: string;
  label: string;
  description: string;
  /** Example payload, prefilled in the "New Job" dialog. */
  payloadExample: Record<string, unknown>;
}

/** Actions the admin UI can perform on an individual job. */
export type JobAction = 'cancel' | 'resume' | 'retry' | 'delete';

/** Filters accepted by the job list endpoint. */
export interface ListJobsParams {
  queue?: string;
  state?: JobState;
  limit?: number;
}
