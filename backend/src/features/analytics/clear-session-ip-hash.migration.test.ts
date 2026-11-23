// src/features/analytics/clear-session-ip-hash.migration.test.ts

/**
 * Sessions stored before analytics stopped keeping a client address lose the address hash they
 * were stored with; everything else on the session stays.
 */

import { readFileSync } from 'fs';
import path from 'path';

import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { analyticsSessions } from '@/db/analytics-schema';
import { createAnalyticsTestDb, type AnalyticsTestDb } from '@/shared/test/analytics-test-db';

const MIGRATION = path.resolve(__dirname, '../../../db/drizzle-analytics/0015_clear_session_ip_hash.sql');

let testDb: AnalyticsTestDb;
beforeAll(async () => {
  testDb = await createAnalyticsTestDb();
});
afterAll(async () => {
  await testDb.close();
});

describe('emptying address hashes stored before', () => {
  it('empties every ip_hash and keeps the rest of each session', async () => {
    await testDb.db.insert(analyticsSessions).values([
      { externalSessionId: 'with-hash', sessionType: 'chat', userAgent: 'TestBrowser/1.0', ipHash: '40d71a2d' },
      { externalSessionId: 'without-hash', sessionType: 'search_only' },
    ]);

    // The statements as the migration runs them (on a database already at the latest schema)
    const statements = readFileSync(MIGRATION, 'utf8').split('--> statement-breakpoint').map((s) => s.trim()).filter(Boolean);
    for (const statement of statements) await testDb.db.execute(sql.raw(statement));

    const rows = await testDb.db
      .select({ id: analyticsSessions.externalSessionId, ipHash: analyticsSessions.ipHash, userAgent: analyticsSessions.userAgent })
      .from(analyticsSessions);
    expect(rows).toEqual(expect.arrayContaining([
      { id: 'with-hash', ipHash: null, userAgent: 'TestBrowser/1.0' },
      { id: 'without-hash', ipHash: null, userAgent: null },
    ]));
  });
});
