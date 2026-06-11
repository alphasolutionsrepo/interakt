// src/features/jobs/jobs.api.handlers.ts

/**
 * Background Jobs API Handlers
 *
 * Thin handlers over jobs.service. Every endpoint is session-protected by
 * middleware; we additionally assert a user id so actions are attributable.
 */

import { NextRequest } from 'next/server';

import { isRegisteredQueue } from './job-registry';
import { ensureJobsStarted } from './jobs.boot';
import * as service from './jobs.service';
import type { JobAction, JobState } from './jobs.types';

import { apiResponse } from '@/shared/api/response';
import { createLogger } from '@/shared/logger/logger';
import { getCurrentUserId } from '@/shared/utils/auth-utils';

const logger = createLogger('jobs-handlers');

const JOB_ACTIONS: readonly JobAction[] = ['cancel', 'resume', 'retry', 'delete'];

/**
 * Shared guard: require a session, and lazily ensure the jobs engine is up. The
 * ensure call is memoized, so the first request after a cold start boots the
 * engine instead of 503-ing on a not-yet-ready singleton.
 */
async function requireReady() {
  const userId = await getCurrentUserId();
  if (!userId) return { error: apiResponse.unauthorized('You must be logged in') };
  const boss = await ensureJobsStarted();
  if (!boss) {
    return {
      error: apiResponse.error('Background jobs engine is not running', 503),
    };
  }
  return { userId };
}

// ============================================================================
// GET /api/jobs — list recent jobs
// ============================================================================

export async function handleListJobs(request: NextRequest) {
  try {
    const guard = await requireReady();
    if (guard.error) return guard.error;

    const { searchParams } = new URL(request.url);
    const limitParam = searchParams.get('limit');
    const jobs = await service.listJobs({
      queue: searchParams.get('queue') ?? undefined,
      state: (searchParams.get('state') as JobState) ?? undefined,
      limit: limitParam ? parseInt(limitParam, 10) : undefined,
    });
    return apiResponse.success(jobs);
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to list jobs', err);
    return apiResponse.error(err);
  }
}

// ============================================================================
// POST /api/jobs — enqueue a job (operator action)
// ============================================================================

export async function handleEnqueueJob(request: NextRequest) {
  try {
    const guard = await requireReady();
    if (guard.error) return guard.error;

    const body = (await request.json().catch(() => ({}))) as {
      queue?: string;
      data?: Record<string, unknown>;
    };
    if (!body.queue) return apiResponse.badRequest('queue is required');
    if (!isRegisteredQueue(body.queue)) {
      return apiResponse.badRequest(`Unknown queue: ${body.queue}`);
    }
    if (body.data != null && (typeof body.data !== 'object' || Array.isArray(body.data))) {
      return apiResponse.badRequest('data must be a JSON object');
    }

    // Default triggeredBy for attribution, but let an explicit payload override.
    const id = await service.enqueue(body.queue as never, {
      triggeredBy: 'admin',
      ...(body.data ?? {}),
    });
    return apiResponse.success({ id }, 201);
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to enqueue job', err);
    return apiResponse.error(err);
  }
}

// ============================================================================
// GET /api/jobs/types — registered job types (for the New Job dialog)
// ============================================================================

export async function handleGetJobTypes() {
  try {
    const guard = await requireReady();
    if (guard.error) return guard.error;
    return apiResponse.success(service.getJobTypes());
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to get job types', err);
    return apiResponse.error(err);
  }
}

// ============================================================================
// GET /api/jobs/queues — queue summaries with state counts
// ============================================================================

export async function handleGetQueues() {
  try {
    const guard = await requireReady();
    if (guard.error) return guard.error;
    return apiResponse.success(await service.getQueueSummaries());
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to get queues', err);
    return apiResponse.error(err);
  }
}

// ============================================================================
// GET /api/jobs/schedules — registered cron schedules
// ============================================================================

export async function handleGetSchedules() {
  try {
    const guard = await requireReady();
    if (guard.error) return guard.error;
    return apiResponse.success(await service.getSchedules());
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to get schedules', err);
    return apiResponse.error(err);
  }
}

// ============================================================================
// POST /api/jobs/schedules — create/update a job type's cron schedule
// ============================================================================

export async function handleSetSchedule(request: NextRequest) {
  try {
    const guard = await requireReady();
    if (guard.error) return guard.error;

    const body = (await request.json().catch(() => ({}))) as {
      queue?: string;
      cron?: string;
      timezone?: string;
    };
    if (!body.queue || !isRegisteredQueue(body.queue)) {
      return apiResponse.badRequest(`Unknown or missing queue: ${body.queue}`);
    }
    if (!body.cron) return apiResponse.badRequest('cron is required');

    try {
      await service.setSchedule(body.queue, body.cron, body.timezone);
    } catch (e) {
      // Invalid cron is a client error, not a 500.
      return apiResponse.badRequest((e as Error).message);
    }
    return apiResponse.success({ ok: true });
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to set schedule', err);
    return apiResponse.error(err);
  }
}

// ============================================================================
// DELETE /api/jobs/schedules/[queue] — remove a job type's cron schedule
// ============================================================================

export async function handleDeleteSchedule(queue: string) {
  try {
    const guard = await requireReady();
    if (guard.error) return guard.error;
    if (!isRegisteredQueue(queue)) {
      return apiResponse.badRequest(`Unknown queue: ${queue}`);
    }
    await service.removeSchedule(queue);
    return apiResponse.success({ ok: true });
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to delete schedule', err);
    return apiResponse.error(err);
  }
}

// ============================================================================
// GET /api/jobs/[queue]/[id] — job detail
// ============================================================================

export async function handleGetJob(queue: string, id: string) {
  try {
    const guard = await requireReady();
    if (guard.error) return guard.error;
    const job = await service.getJob(queue, id);
    if (!job) return apiResponse.notFound('Job not found');
    return apiResponse.success(job);
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to get job', err);
    return apiResponse.error(err);
  }
}

// ============================================================================
// POST /api/jobs/[queue]/[id] — apply lifecycle action
// ============================================================================

export async function handleJobAction(queue: string, id: string, request: NextRequest) {
  try {
    const guard = await requireReady();
    if (guard.error) return guard.error;

    const body = (await request.json().catch(() => ({}))) as { action?: string };
    if (!body.action || !JOB_ACTIONS.includes(body.action as JobAction)) {
      return apiResponse.badRequest(
        `action must be one of: ${JOB_ACTIONS.join(', ')}`
      );
    }
    await service.applyJobAction(queue, id, body.action as JobAction);
    return apiResponse.success({ ok: true });
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to apply job action', err);
    return apiResponse.error(err);
  }
}
