// src/features/jobs/jobs.service.ts

import 'server-only';

import { sql } from 'drizzle-orm';

import { JOBS_SCHEMA, QUEUE, type QueueName } from './job-queues';
import { JOB_TYPES } from './job-registry';
import { getBoss } from './jobs.boot';
import type {
  JobAction,
  JobRecord,
  JobTypeInfo,
  ListJobsParams,
  QueueSummary,
  ScheduleRecord,
} from './jobs.types';

import { db } from '@/db/index';
import { createLogger } from '@/shared/logger/logger';

const logger = createLogger('jobs-service');

// ============================================================================
// READS
// ============================================================================

/**
 * List recent jobs across all states. pg-boss has no rich "list jobs by state"
 * API (findJobs filters by id/key only), so we read its partitioned `job` table
 * directly — exactly what the official dashboard does. Schema/columns are owned
 * by pg-boss; we only read.
 */
export async function listJobs(params: ListJobsParams = {}): Promise<JobRecord[]> {
  const limit = Math.min(Math.max(params.limit ?? 100, 1), 500);
  const table = sql.raw(`"${JOBS_SCHEMA}".job`);

  // Exclude pg-boss's internal maintenance queues (e.g. __pgboss__send-it).
  const conditions = [sql`strpos(name, '__pgboss__') = 0`];
  if (params.queue) conditions.push(sql`name = ${params.queue}`);
  if (params.state) conditions.push(sql`state = ${params.state}`);
  const where = sql.join(conditions, sql` AND `);

  const rows = (await db.execute(sql`
    SELECT id, name, state, data, output,
           retry_count, retry_limit,
           created_on, started_on, completed_on
    FROM ${table}
    WHERE ${where}
    ORDER BY created_on DESC
    LIMIT ${limit}
  `)) as unknown as Array<Record<string, unknown>>;

  return rows.map(toJobRecord);
}

/** Per-queue rollup with live state counts, for the overview cards. */
export async function getQueueSummaries(): Promise<QueueSummary[]> {
  const boss = getBoss();
  const queues = await boss.getQueues();
  return queues.map(q => ({
    name: q.name,
    queuedCount: q.queuedCount ?? 0,
    activeCount: q.activeCount ?? 0,
    deferredCount: q.deferredCount ?? 0,
    totalCount: q.totalCount ?? 0,
  }));
}

/** Registry metadata for the operator console's "New Job" dialog. */
export function getJobTypes(): JobTypeInfo[] {
  return JOB_TYPES.map(t => ({
    queue: t.queue,
    label: t.label,
    description: t.description,
    payloadExample: t.payloadExample ?? {},
  }));
}

/** All registered cron schedules. */
export async function getSchedules(): Promise<ScheduleRecord[]> {
  const boss = getBoss();
  const schedules = await boss.getSchedules();
  return schedules.map(s => ({
    name: s.name,
    cron: s.cron,
    timezone: s.timezone,
    data: s.data ?? null,
  }));
}

/**
 * Create or update the cron schedule for a job type. pg-boss upserts by
 * (queue, key); we use the default key, so each job type has one schedule that
 * this call replaces. Persisted in pg-boss's `schedule` table (survives
 * restarts). Throws on an invalid cron expression.
 */
export async function setSchedule(
  queue: string,
  cron: string,
  timezone?: string
): Promise<void> {
  assertValidCron(cron);
  const boss = getBoss();
  await boss.schedule(
    queue,
    cron,
    { triggeredBy: 'schedule' },
    timezone ? { tz: timezone } : undefined
  );
  logger.info('Schedule set', { queue, cron, timezone });
}

/** Remove the cron schedule for a job type (no-op if none exists). */
export async function removeSchedule(queue: string): Promise<void> {
  const boss = getBoss();
  await boss.unschedule(queue);
  logger.info('Schedule removed', { queue });
}

/** Minimal structural validation of a 5-field cron expression. */
function assertValidCron(cron: string): void {
  const fields = cron.trim().split(/\s+/);
  if (fields.length !== 5) {
    throw new Error('Cron must have 5 fields: minute hour day-of-month month day-of-week');
  }
  const ok = /^[\d*,\-/]+$/;
  if (!fields.every(f => ok.test(f))) {
    throw new Error('Cron contains invalid characters');
  }
}

/** A single job with full payload/output, or null if not found. */
export async function getJob(queue: string, id: string): Promise<JobRecord | null> {
  const boss = getBoss();
  // findJobs (not the deprecated getJobById) — filter by id within the queue.
  const [job] = await boss.findJobs(queue, { id });
  if (!job) return null;
  return {
    id: job.id,
    queue: job.name,
    state: job.state,
    data: job.data ?? null,
    output: job.output ?? null,
    retryCount: job.retryCount ?? 0,
    retryLimit: job.retryLimit ?? 0,
    createdOn: toISO(job.createdOn),
    startedOn: job.startedOn ? toISO(job.startedOn) : null,
    completedOn: job.completedOn ? toISO(job.completedOn) : null,
  };
}

// ============================================================================
// WRITES
// ============================================================================

/** Enqueue a job onto a queue. Returns the new job id (null if deduped away). */
export async function enqueue(
  queue: QueueName,
  data: Record<string, unknown> = {}
): Promise<string | null> {
  const boss = getBoss();
  const id = await boss.send(queue, data);
  logger.info('Job enqueued', { queue, id });
  return id;
}

/** Convenience wrapper used by the "Refresh insights now" admin action. */
export async function enqueueInsightsRefresh(
  experienceId?: string,
  triggeredBy = 'admin'
): Promise<string | null> {
  return enqueue(QUEUE.REFRESH_INSIGHTS, { experienceId, triggeredBy });
}

/** Apply a lifecycle action to a single job. */
export async function applyJobAction(
  queue: string,
  id: string,
  action: JobAction
): Promise<void> {
  const boss = getBoss();
  switch (action) {
    case 'cancel':
      await boss.cancel(queue, id);
      break;
    case 'resume':
      await boss.resume(queue, id);
      break;
    case 'retry':
      await boss.retry(queue, id);
      break;
    case 'delete':
      await boss.deleteJob(queue, id);
      break;
  }
  logger.info('Job action applied', { queue, id, action });
}

// ============================================================================
// HELPERS
// ============================================================================

function toJobRecord(row: Record<string, unknown>): JobRecord {
  return {
    id: String(row.id),
    queue: String(row.name),
    state: row.state as JobRecord['state'],
    data: row.data ?? null,
    output: row.output ?? null,
    retryCount: Number(row.retry_count ?? 0),
    retryLimit: Number(row.retry_limit ?? 0),
    createdOn: toISO(row.created_on),
    startedOn: row.started_on ? toISO(row.started_on) : null,
    completedOn: row.completed_on ? toISO(row.completed_on) : null,
  };
}

function toISO(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return new Date(value as string).toISOString();
}
