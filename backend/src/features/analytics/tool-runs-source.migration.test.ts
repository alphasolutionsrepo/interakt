// src/features/analytics/tool-runs-source.migration.test.ts

/**
 * Tool runs store their source in a column, like searches and AI usage. Runs stored before kept
 * it in metadata; the migration copies it over, and runs without one stay live ('api').
 */

import { readFileSync } from 'fs';
import path from 'path';

import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { aiToolExecutions } from '@/db/analytics-schema';
import { createAnalyticsTestDb, type AnalyticsTestDb } from '@/shared/test/analytics-test-db';

const MIGRATION = path.resolve(__dirname, '../../../db/drizzle-analytics/0011_tool_runs_source.sql');

let testDb: AnalyticsTestDb;
beforeAll(async () => {
  testDb = await createAnalyticsTestDb();
});
afterAll(async () => {
  await testDb.close();
});

const stored = (toolName: string, metadata: Record<string, unknown> | null) => ({
  aiRequestId: crypto.randomUUID(), toolName, toolCategory: 'retrieval', durationMs: 5, success: true, metadata,
});

describe('stored tool runs', () => {
  it('take the source they kept in metadata; runs without one stay live', async () => {
    await testDb.db.insert(aiToolExecutions).values([
      stored('tested', { source: 'admin_test' }),
      stored('played', { source: 'playground' }),
      stored('live', { source: 'api' }),
      stored('older', { experienceId: 'e1' }),
      stored('bare', null),
    ]);

    // The column itself is added by the test database's migrations; run the copy
    const backfill = readFileSync(MIGRATION, 'utf8').split('--> statement-breakpoint').map((s) => s.trim()).filter((s) => s.startsWith('UPDATE'));
    expect(backfill).toHaveLength(1);
    await testDb.db.execute(sql.raw(backfill[0]));

    const rows = await testDb.db.select({ name: aiToolExecutions.toolName, source: aiToolExecutions.source }).from(aiToolExecutions);
    expect(Object.fromEntries(rows.map((r) => [r.name, r.source]))).toEqual({
      tested: 'admin_test', played: 'playground', live: 'api', older: 'api', bare: 'api',
    });
  });
});
