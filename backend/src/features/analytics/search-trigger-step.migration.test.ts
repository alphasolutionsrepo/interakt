// src/features/analytics/search-trigger-step.migration.test.ts

/**
 * Searches stored as 'system' before each search recorded its step are relabelled by the
 * migration that adds the step: with an experience they came from the List Values tool in a
 * chat, without one from a search experience's query understanding.
 */

import { readFileSync } from 'fs';
import path from 'path';

import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { searchEvents } from '@/db/analytics-schema';
import { createAnalyticsTestDb, type AnalyticsTestDb } from '@/shared/test/analytics-test-db';

const MIGRATION = path.resolve(__dirname, '../../../db/drizzle-analytics/0009_slimy_iron_patriot.sql');

let testDb: AnalyticsTestDb;
beforeAll(async () => {
  testDb = await createAnalyticsTestDb();
});
afterAll(async () => {
  await testDb.close();
});

function oldSearch(triggerType: string, experienceId: string | null) {
  return {
    requestId: crypto.randomUUID(), source: 'api', triggerType, searchType: 'lexical', indexIds: ['idx'], experienceId,
    queryText: '*', queryNormalized: '*', queryLength: 1, queryWordCount: 1, totalResults: 0, resultsReturned: 0,
    durationMs: 5, success: true,
  };
}

describe('relabelling old system searches', () => {
  it('names the tool or AI step that ran each one, and leaves other searches alone', async () => {
    const chat = crypto.randomUUID();
    await testDb.db.insert(searchEvents).values([oldSearch('system', chat), oldSearch('system', null), oldSearch('user', null)]);

    // The relabelling statements, as the migration runs them (the column is already there)
    const statements = readFileSync(MIGRATION, 'utf8').split('--> statement-breakpoint').map((s) => s.trim());
    for (const statement of statements.filter((s) => s.includes('UPDATE'))) {
      await testDb.db.execute(sql.raw(statement));
    }

    const rows = await testDb.db
      .select({ experienceId: searchEvents.experienceId, triggerType: searchEvents.triggerType, triggerStep: searchEvents.triggerStep })
      .from(searchEvents);
    expect(rows).toEqual(expect.arrayContaining([
      { experienceId: chat, triggerType: 'ai_tool', triggerStep: 'enumerate' },
      { experienceId: null, triggerType: 'ai_step', triggerStep: 'query_interpretation' },
      { experienceId: null, triggerType: 'user', triggerStep: null },
    ]));
    expect(await testDb.db.select().from(searchEvents).where(eq(searchEvents.triggerType, 'system'))).toEqual([]);
  });
});
