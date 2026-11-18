// src/features/ai-providers/model-hidden-by-discovery.migration.test.ts

/**
 * The migration that marks models hidden by discovery: before it, only Ollama had discovery,
 * and it hid any model Ollama didn't list (seeded ones too) and switched it back on when listed
 * again. So Ollama's models that are off are marked and keep coming back; nothing else is. Runs the
 * real migrations on an in-memory Postgres (PGlite), the new one after rows exist.
 */

import fs from 'fs';
import path from 'path';

import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const MIGRATIONS = path.resolve(__dirname, '../../../db/drizzle');
const NEW = '0042_model_hidden_by_discovery';

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
  await client.exec(`INSERT INTO ai_providers (provider_key, display_name, provider_type, auth_type, base_url, connection_type) VALUES
    ('ollama', 'Ollama', 'local', 'none', 'http://localhost:11434', 'ollama'),
    ('gateway', 'Gateway', 'cloud', 'api_key', 'https://ai.example.edu/v1', 'openai_compatible')`);
  await client.exec(`INSERT INTO ai_provider_models (provider_id, model_key, display_name, model_type, is_available, is_discovered)
    SELECT id, k.key, k.key, 'chat', k.available, k.discovered FROM ai_providers p,
    (VALUES ('pulled-then-removed', false, true), ('still-pulled', true, true), ('seeded-off', false, false)) AS k(key, available, discovered)
    WHERE p.provider_key = 'ollama'`);
  await client.exec(`INSERT INTO ai_provider_models (provider_id, model_key, display_name, model_type, is_available, is_discovered)
    SELECT id, 'gateway-off', 'gateway-off', 'chat', false, true FROM ai_providers WHERE provider_key = 'gateway'`);
  await client.exec(sqlOf(NEW));
}, 60_000);

afterAll(() => client.close());

describe('models saved before the hidden-by-discovery marker', () => {
  it("are marked when they are Ollama's and off, seeded ones too, as Ollama's discovery treated them", async () => {
    const { rows } = await client.query<{ model_key: string; hidden_by_discovery: boolean }>(
      'SELECT model_key, hidden_by_discovery FROM ai_provider_models ORDER BY model_key');
    expect(Object.fromEntries(rows.map((r) => [r.model_key, r.hidden_by_discovery]))).toEqual({
      'gateway-off': false, 'pulled-then-removed': true, 'seeded-off': true, 'still-pulled': false,
    });
  });
});
