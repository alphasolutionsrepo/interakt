// src/features/analytics/analytics-processing.failure.test.ts

/**
 * A processing run that fails is stored as failed with its message, and returns the error
 * itself without logging it: each caller logs it once, and the admin route answers without
 * its text. Runs on real Postgres (PGlite) with the spans table gone, so a query fails.
 */

import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { runAnalyticsProcessing } from './analytics-processing.service';

import { analyticsProcessingRuns } from '@/db/analytics-schema';
import { createAnalyticsTestDb, type AnalyticsTestDb } from '@/shared/test/analytics-test-db';
import { reported, type LogLine } from '@/shared/test/log-recorder';

const logs = vi.hoisted(() => [] as LogLine[]);
vi.mock('@/shared/logger/logger', async () => (await import('@/shared/test/log-recorder')).recordingLogger(logs));
let testDb: AnalyticsTestDb;
vi.mock('@/db/index', () => ({
  get analyticsDB() {
    return testDb.db;
  },
  db: {},
}));

beforeAll(async () => {
  testDb = await createAnalyticsTestDb();
  await testDb.db.execute(sql`DROP TABLE otel_spans`);
});
afterAll(async () => {
  await testDb.close();
});

describe('a processing run that fails', () => {
  it('returns the error as its cause, stores the run as failed, and logs nothing', async () => {
    const result = await runAnalyticsProcessing({ timeRanges: ['24h'] });

    expect(result).toMatchObject({ status: 'failed', error: expect.stringContaining('otel_spans') });
    expect(result.cause).toBeInstanceOf(Error);
    expect((result.cause as Error).message).toBe(result.error);
    const [run] = await testDb.db.select().from(analyticsProcessingRuns);
    expect(run).toMatchObject({ id: result.runId, status: 'failed', error: result.error });
    expect(reported(logs)).toEqual([]);
  });
});
