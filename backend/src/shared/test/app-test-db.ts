// src/shared/test/app-test-db.ts

/**
 * An in-memory main database for integration tests: real Postgres (PGlite) with the
 * main migrations applied, so repository queries run as they do in production.
 *
 * PGlite here has no pgvector, so embedding columns are stored as real[] and their
 * HNSW indexes are left out. Everything else is the migrations as they are.
 *
 *   let testDb: AppTestDb;
 *   vi.mock('@/db/index', () => ({ get db() { return testDb.db; } }));
 *   beforeAll(async () => { testDb = await createAppTestDb(); });
 */

import fs from 'fs';
import path from 'path';

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';

import * as schema from '../../../db/schema';

const MIGRATIONS = path.resolve(__dirname, '../../../db/drizzle');

export type AppTestDb = Awaited<ReturnType<typeof createAppTestDb>>;

export async function createAppTestDb() {
  const client = new PGlite();
  const journal = JSON.parse(fs.readFileSync(path.join(MIGRATIONS, 'meta/_journal.json'), 'utf8')) as { entries: Array<{ tag: string }> };
  for (const { tag } of journal.entries) {
    const sql = fs.readFileSync(path.join(MIGRATIONS, `${tag}.sql`), 'utf8')
      .replace(/\bvector\(\d+\)/g, 'real[]')
      .replace(/^CREATE INDEX[^;]*USING hnsw[^;]*;(--> statement-breakpoint)?$/gm, '');
    await client.exec(sql.replaceAll('--> statement-breakpoint', ''));
  }
  return {
    db: drizzle(client, { schema }),
    close: () => client.close(),
  };
}
