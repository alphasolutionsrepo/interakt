// src/shared/seeders/ai-providers/seed-connection-type.test.ts

/**
 * A fresh install's seeded providers speak the right API: the seeded Ollama provider through
 * the Ollama adapter, OpenAI through the OpenAI-compatible one. Real seeder on PGlite.
 */

import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createAppTestDb, type AppTestDb } from '@/shared/test/app-test-db';

let testDb: AppTestDb;
vi.mock('@/db/index', () => ({ get db() { return testDb.db; } }));

import { AI_PROVIDER_SEEDS } from './ai-providers.seeds';

import { createProviderFromSeed } from './index';

beforeAll(async () => { testDb = await createAppTestDb(); }, 60_000);
afterAll(() => testDb.close());

describe('seeded providers', () => {
  it('get the connection type their API needs', async () => {
    for (const seed of AI_PROVIDER_SEEDS) await createProviderFromSeed(seed);
    const { rows } = (await testDb.db.execute(sql`SELECT provider_key, connection_type FROM ai_providers`)) as unknown as {
      rows: Array<{ provider_key: string; connection_type: string }>;
    };
    expect(Object.fromEntries(rows.map((r) => [r.provider_key, r.connection_type]))).toEqual({
      ollama: 'ollama', openai: 'openai_compatible',
    });
  });
});
