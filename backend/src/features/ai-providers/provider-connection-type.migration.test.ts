// src/features/ai-providers/provider-connection-type.migration.test.ts

/**
 * The migration that adds connection types keeps every provider added before it working: the
 * one keyed "ollama" speaks Ollama, every other one OpenAI-compatible, as their keys decided.
 * Runs the real migrations on an in-memory Postgres (PGlite), the new one after rows exist.
 */

import fs from 'fs';
import path from 'path';

import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const MIGRATIONS = path.resolve(__dirname, '../../../db/drizzle');
const NEW = '0041_provider_connection_type';

const sqlOf = (tag: string) => fs.readFileSync(path.join(MIGRATIONS, `${tag}.sql`), 'utf8')
  .replace(/\bvector\(\d+\)/g, 'real[]')
  .replace(/^CREATE INDEX[^;]*USING hnsw[^;]*;(--> statement-breakpoint)?$/gm, '')
  .replaceAll('--> statement-breakpoint', '');

let client: PGlite;

beforeAll(async () => {
  client = new PGlite();
  const { entries } = JSON.parse(fs.readFileSync(path.join(MIGRATIONS, 'meta/_journal.json'), 'utf8')) as { entries: Array<{ tag: string }> };
  const before = entries.slice(0, entries.findIndex((e) => e.tag === NEW));
  for (const { tag } of before) await client.exec(sqlOf(tag));
  await client.exec(`INSERT INTO ai_providers (provider_key, display_name, provider_type, auth_type, base_url) VALUES
    ('ollama', 'Ollama', 'local', 'none', 'http://localhost:11434'),
    ('openai', 'OpenAI', 'cloud', 'api_key', 'https://api.openai.com/v1'),
    ('gateway', 'Gateway', 'cloud', 'api_key', 'https://ai.example.edu/v1')`);
  await client.exec(sqlOf(NEW));
}, 60_000);

afterAll(() => client.close());

describe('providers added before connection types', () => {
  it('speak what their key chose: Ollama for "ollama", OpenAI-compatible for the rest', async () => {
    const { rows } = await client.query<{ provider_key: string; connection_type: string }>(
      'SELECT provider_key, connection_type FROM ai_providers ORDER BY provider_key');
    expect(Object.fromEntries(rows.map((r) => [r.provider_key, r.connection_type]))).toEqual({
      gateway: 'openai_compatible', ollama: 'ollama', openai: 'openai_compatible',
    });
  });
});
