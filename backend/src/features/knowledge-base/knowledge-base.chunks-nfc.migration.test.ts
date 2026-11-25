// src/features/knowledge-base/knowledge-base.chunks-nfc.migration.test.ts

/**
 * Migration 0044: stored knowledge chunk text becomes composed (NFC), so keyword search can
 * compare the column directly. Rows already composed are left as they are.
 *
 * Runs the migration file on a real Postgres (PGlite).
 */

import { readFileSync } from 'fs';
import path from 'path';

import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const MIGRATION = readFileSync(path.join(__dirname, '../../../db/drizzle/0044_knowledge_chunks_nfc.sql'), 'utf8');

const COMPOSED = 'Gusseisentöpfe in drei Farben.'.normalize('NFC');
const DECOMPOSED = COMPOSED.normalize('NFD');
const OTHER_DECOMPOSED = 'Smørrebrød og crème brûlée'.normalize('NFD');
const PLAIN = 'Kaffeebecher aus Glas.';

const db = new PGlite();

const content = async (id: string) =>
  (await db.query<{ content: string }>('SELECT content FROM knowledge_chunks WHERE id = $1', [id])).rows[0].content;

beforeAll(async () => {
  await db.exec('CREATE TABLE knowledge_chunks (id text PRIMARY KEY, content text NOT NULL)');
  for (const [id, text] of [['nfd', DECOMPOSED], ['nfd2', OTHER_DECOMPOSED], ['nfc', COMPOSED], ['plain', PLAIN]]) {
    await db.query('INSERT INTO knowledge_chunks (id, content) VALUES ($1, $2)', [id, text]);
  }
  await db.exec(MIGRATION);
});

afterAll(async () => { await db.close(); });

describe('migration 0044', () => {
  it('runs on a UTF8 database', async () => {
    const { rows } = await db.query<{ enc: string }>(
      'SELECT pg_encoding_to_char(encoding) AS enc FROM pg_database WHERE datname = current_database()',
    );
    expect(rows[0].enc).toBe('UTF8');
  });

  it('composes rows stored with decomposed accents', async () => {
    expect(DECOMPOSED).not.toBe(COMPOSED);
    expect(await content('nfd')).toBe(COMPOSED);
    expect(await content('nfd2')).toBe(OTHER_DECOMPOSED.normalize('NFC'));
  });

  it('leaves rows that are already composed as they are', async () => {
    expect(await content('nfc')).toBe(COMPOSED);
    expect(await content('plain')).toBe(PLAIN);
  });

  it('is listed in the journal after 0043', () => {
    const journal = JSON.parse(readFileSync(path.join(__dirname, '../../../db/drizzle/meta/_journal.json'), 'utf8'));
    const tags = journal.entries.map((e: { tag: string }) => e.tag);
    expect(tags.at(-1)).toBe('0044_knowledge_chunks_nfc');
    expect(journal.entries.at(-1).when).toBeGreaterThan(journal.entries.at(-2).when);
  });
});
