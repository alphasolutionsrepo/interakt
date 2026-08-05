// src/features/jobs/jobs.boot.ts

import 'server-only';

import { PgBoss } from 'pg-boss';

import { JOBS_SCHEMA } from './job-queues';
import { JOB_TYPES } from './job-registry';

import { databaseConfig } from '@/config';
import { createLogger } from '@/shared/logger/logger';

const logger = createLogger('jobs');

/**
 * Why globalThis instead of a plain module-level `let`:
 *
 * Next.js can evaluate this module in more than one bundle — `instrumentation.ts`
 * runs in one module graph, the API route handlers may get another, and dev HMR
 * adds more. Each copy would otherwise have its own `boss = null`, so a route
 * handler would report "engine not running" even though instrumentation booted
 * it. Pinning the instance to globalThis makes every copy share the one engine.
 */
interface JobsGlobal {
  boss: PgBoss | null;
  startPromise: Promise<PgBoss | null> | null;
  hooksRegistered: boolean;
}

const globalRef = globalThis as typeof globalThis & { __interaktJobs?: JobsGlobal };
globalRef.__interaktJobs ??= { boss: null, startPromise: null, hooksRegistered: false };
const store = globalRef.__interaktJobs;

/** True once the engine has successfully started. */
export function isJobsReady(): boolean {
  return store.boss !== null;
}

/**
 * Get the running pg-boss instance. Throws if the engine isn't up — prefer
 * {@link ensureJobsStarted} in request handlers so a cold first request boots it
 * rather than 503-ing.
 */
export function getBoss(): PgBoss {
  if (!store.boss) {
    throw new Error(
      'Background jobs engine is not running (set ENABLE_JOBS and ensure Postgres is reachable)'
    );
  }
  return store.boss;
}

/**
 * Ensure pg-boss is started: create the schema/tables, register queues +
 * workers, and wire any cron schedules. Idempotent and memoized — concurrent or
 * repeated calls share one start. Returns the instance, or null when disabled
 * (ENABLE_JOBS=false) or misconfigured (no DB URL), so callers degrade to 503
 * rather than crash.
 */
export async function ensureJobsStarted(): Promise<PgBoss | null> {
  if (store.boss) return store.boss;
  if (store.startPromise) return store.startPromise;

  if (process.env.ENABLE_JOBS === 'false') {
    logger.info('Background jobs disabled (ENABLE_JOBS=false)');
    return null;
  }

  const connectionString = databaseConfig.connection.url;
  if (!connectionString) {
    logger.warn('Background jobs not started: no Postgres connection string');
    return null;
  }

  store.startPromise = (async () => {
    const instance = new PgBoss({ connectionString, schema: JOBS_SCHEMA });

    instance.on('error', err => logger.error('pg-boss error', err as Error));

    await instance.start();

    // Register every job type from the registry: create its queue (must exist
    // before send/work/schedule in pg-boss v10+) and attach its worker.
    // Cron schedules are NOT set here — they're managed at runtime from the UI
    // and persisted in pg-boss's own `schedule` table, so they survive restarts.
    for (const type of JOB_TYPES) {
      await instance.createQueue(type.queue);
      await instance.work(type.queue, { batchSize: type.batchSize ?? 1 }, type.worker);
    }

    store.boss = instance;
    logger.info('Background jobs engine started', {
      schema: JOBS_SCHEMA,
      queues: JOB_TYPES.map(t => t.queue),
    });

    registerShutdownHooks(instance);
    return instance;
  })();

  try {
    return await store.startPromise;
  } catch (err) {
    logger.error('Failed to start background jobs engine', err as Error);
    store.boss = null;
    return null;
  } finally {
    store.startPromise = null;
  }
}

/** Boot hook for instrumentation.ts. Fire-and-forget; errors are logged inside. */
export async function startJobs(): Promise<void> {
  await ensureJobsStarted();
}

function registerShutdownHooks(instance: PgBoss) {
  if (store.hooksRegistered) return;
  store.hooksRegistered = true;
  const stop = async () => {
    try {
      await instance.stop({ graceful: true });
      logger.info('Background jobs engine stopped');
    } catch {
      // best-effort on shutdown
    }
  };
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
}
