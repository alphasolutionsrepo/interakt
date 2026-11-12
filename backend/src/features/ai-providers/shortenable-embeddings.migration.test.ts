// src/features/ai-providers/shortenable-embeddings.migration.test.ts

/**
 * Migration 0039 marks the existing embedding models of the known families as able to shorten
 * their vectors, so an upgrade does not change how they work. It must pick the same models the
 * code picks for a new one. Runs the migration file on a real Postgres (PGlite).
 */

import { readFileSync } from 'fs';
import path from 'path';

import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { canShortenVectorsByDefault } from './shortenable-embeddings';

const MIGRATION = readFileSync(path.join(__dirname, '../../../db/drizzle/0039_model_can_shorten_vectors.sql'), 'utf8');

const MODELS: Array<[key: string, type: string]> = [
  ['qwen3-embedding:4b', 'embedding'],
  ['library/qwen3-embedding:4b', 'embedding'],
  ['Qwen3-Embedding', 'embedding'],
  ['nomic-embed-text', 'embedding'],
  ['nomic-embed-text:v1.5', 'embedding'],
  ['text-embedding-3-small', 'embedding'],
  ['openai/text-embedding-3-large', 'embedding'],
  ['mxbai-embed-large', 'embedding'],
  ['text-embedding-ada-002', 'embedding'],
  ['qwen3-embedding-extra', 'embedding'],
  ['qwen3-embedding:4b', 'chat'],
];

let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE TABLE ai_provider_models (id serial PRIMARY KEY, model_key varchar(100) NOT NULL, model_type text NOT NULL)`);
  for (const [key, type] of MODELS) {
    await db.query('INSERT INTO ai_provider_models (model_key, model_type) VALUES ($1, $2)', [key, type]);
  }
  await db.exec(MIGRATION.replaceAll('--> statement-breakpoint', ''));
});

afterAll(async () => {
  await db.close();
});

describe('migration 0039', () => {
  it.each(MODELS)('marks %s (%s) as the code marks a new one', async (key, type) => {
    const { rows } = await db.query<{ can_shorten_vectors: boolean }>(
      'SELECT can_shorten_vectors FROM ai_provider_models WHERE model_key = $1 AND model_type = $2', [key, type],
    );
    expect(rows[0].can_shorten_vectors).toBe(canShortenVectorsByDefault(key, type));
  });
});
