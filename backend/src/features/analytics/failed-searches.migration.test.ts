// src/features/analytics/failed-searches.migration.test.ts

/**
 * A failed search is recorded as failed, not as one that found nothing. Stored failed searches
 * were marked zero-result; the migration clears that, so old and new rows agree.
 */

import { readFileSync } from 'fs';
import path from 'path';

import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { searchEvents } from '@/db/analytics-schema';
import { createAnalyticsTestDb, type AnalyticsTestDb } from '@/shared/test/analytics-test-db';

const MIGRATION = path.resolve(__dirname, '../../../db/drizzle-analytics/0010_failed_searches_not_zero_result.sql');

let testDb: AnalyticsTestDb;
beforeAll(async () => {
  testDb = await createAnalyticsTestDb();
});
afterAll(async () => {
  await testDb.close();
});

const stored = (queryText: string, success: boolean, totalResults: number) => ({
  requestId: crypto.randomUUID(), source: 'api', triggerType: 'user', searchType: 'lexical', indexIds: ['idx'],
  queryText, queryNormalized: queryText, queryLength: queryText.length, queryWordCount: 1,
  totalResults, resultsReturned: totalResults, isZeroResult: totalResults === 0, durationMs: 5, success,
});

describe('stored failed searches', () => {
  it('are no longer marked as having found nothing; real zero-result searches stay', async () => {
    await testDb.db.insert(searchEvents).values([stored('failed', false, 0), stored('nothing', true, 0), stored('found', true, 3)]);

    await testDb.db.execute(sql.raw(readFileSync(MIGRATION, 'utf8')));

    const rows = await testDb.db.select({ q: searchEvents.queryText, zero: searchEvents.isZeroResult }).from(searchEvents);
    expect(Object.fromEntries(rows.map((r) => [r.q, r.zero]))).toEqual({ failed: false, nothing: true, found: false });
  });
});
