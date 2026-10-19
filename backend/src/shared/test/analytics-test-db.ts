// src/shared/test/analytics-test-db.ts

/**
 * An in-memory analytics database for integration tests: real Postgres (PGlite)
 * with the analytics migrations applied, so queries run as they do in production.
 *
 * Hand it to the code under test through the analytics database accessor:
 *
 *   let testDb: AnalyticsTestDb;
 *   vi.mock('@/features/analytics/analytics-db', () => ({ getAnalyticsDb: async () => testDb.db }));
 *   beforeAll(async () => { testDb = await createAnalyticsTestDb(); });
 *
 * Mock the accessor rather than '@/db/index': when two calls dynamically import
 * a mocked module at the same time, vitest (4.1) gives the second one the real
 * module.
 */

import path from 'path';

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

const MIGRATIONS = path.resolve(__dirname, '../../../db/drizzle-analytics');

export type AnalyticsTestDb = Awaited<ReturnType<typeof createAnalyticsTestDb>>;

export async function createAnalyticsTestDb() {
  const client = new PGlite();
  const db = drizzle(client);
  await migrate(db, { migrationsFolder: MIGRATIONS });
  return {
    db,
    /** Empty every analytics table, keeping the schema. */
    async reset() {
      const { rows } = await client.query<{ tablename: string }>(
        `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '__drizzle_migrations'`,
      );
      if (rows.length > 0) {
        await client.exec(`TRUNCATE ${rows.map((r) => `"${r.tablename}"`).join(', ')}`);
      }
    },
    close: () => client.close(),
  };
}
