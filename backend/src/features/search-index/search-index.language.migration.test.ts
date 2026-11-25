// src/features/search-index/search-index.language.migration.test.ts

/**
 * Migration 0044: Azure AI Search indexes ran on the standard analyzer whatever their
 * language said, so their stored language becomes 'standard'. Elasticsearch indexes, which
 * did use their language, are untouched.
 *
 * Runs the migration file on a real Postgres (PGlite).
 */

import { readFileSync } from 'fs';
import path from 'path';

import { PGlite } from '@electric-sql/pglite';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { searchIndex } from '@/db/schema';
import { createAppTestDb, type AppTestDb } from '@/shared/test/app-test-db';

const MIGRATION = readFileSync(path.join(__dirname, '../../../db/drizzle/0044_azure_index_language_standard.sql'), 'utf8');

const db = new PGlite();

const language = async (name: string) =>
  (await db.query<{ language: string }>('SELECT language FROM search_index WHERE name = $1', [name])).rows[0].language;

beforeAll(async () => {
  await db.exec(`
    CREATE TABLE search_index (name text PRIMARY KEY, search_provider varchar(30) NOT NULL DEFAULT 'elasticsearch', language varchar(20) NOT NULL DEFAULT 'english');
    INSERT INTO search_index (name, search_provider, language) VALUES
      ('azure_english', 'azure-ai-search', 'english'),
      ('azure_french', 'azure-ai-search', 'french'),
      ('es_english', 'elasticsearch', 'english'),
      ('es_danish', 'elasticsearch', 'danish');
  `);
  await db.exec(MIGRATION);
});

afterAll(async () => { await db.close(); });

describe('migration 0044', () => {
  it('moves every Azure index to the standard language', async () => {
    expect(await language('azure_english')).toBe('standard');
    expect(await language('azure_french')).toBe('standard');
  });

  it('leaves Elasticsearch indexes as they are', async () => {
    expect(await language('es_english')).toBe('english');
    expect(await language('es_danish')).toBe('danish');
  });

  it('is listed in the journal after 0043', () => {
    const journal = JSON.parse(readFileSync(path.join(__dirname, '../../../db/drizzle/meta/_journal.json'), 'utf8'));
    const tags = journal.entries.map((e: { tag: string }) => e.tag);
    expect(tags.at(-1)).toBe('0044_azure_index_language_standard');
    expect(journal.entries.at(-1).when).toBeGreaterThan(journal.entries.at(-2).when);
  });
});

describe('migration 0044 on the real schema', () => {
  let app: AppTestDb;
  beforeAll(async () => { app = await createAppTestDb(); }, 60_000);
  afterAll(async () => { await app.close(); });

  it('moves Azure rows to standard and leaves Elasticsearch rows alone', async () => {
    const base = { searchType: 'lexical' as const, indexingStrategy: 'on_upload' as const };
    await app.db.insert(searchIndex).values([
      { ...base, name: 'azure_shop', displayName: 'Azure shop', searchProvider: 'azure-ai-search', language: 'french' },
      { ...base, name: 'es_shop', displayName: 'ES shop', searchProvider: 'elasticsearch', language: 'danish' },
    ]);
    // The app schema is already at 0044 (azure rows inserted after it keep their value): run the file again
    await app.db.execute(sql.raw(MIGRATION));
    const language = async (name: string) => (await app.db.select().from(searchIndex).where(eq(searchIndex.name, name)))[0].language;
    expect(await language('azure_shop')).toBe('standard');
    expect(await language('es_shop')).toBe('danish');
  });
});
