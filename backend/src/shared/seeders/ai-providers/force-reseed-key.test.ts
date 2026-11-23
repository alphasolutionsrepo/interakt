// src/shared/seeders/ai-providers/force-reseed-key.test.ts

/**
 * Re-seeding providers in force mode deletes and recreates them: a provider's own key secret
 * (made from a key entered on it) goes with it, unless something else uses that secret; a
 * secret the admin chose stays. Real seeder and vault on PGlite.
 */

import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createAppTestDb, type AppTestDb } from '@/shared/test/app-test-db';

let testDb: AppTestDb;
vi.mock('@/db/index', () => ({ get db() { return testDb.db; } }));

import { seedAIProviders } from './index';

import * as secretsRepository from '@/features/secrets/secrets.repository';
import { createSecret } from '@/features/secrets/secrets.service';

beforeAll(async () => { vi.stubEnv('SECRETS_ENCRYPTION_KEY', 'b'.repeat(64)); testDb = await createAppTestDb(); }, 60_000);
afterAll(() => testDb.close());

const secretNames = async () =>
  ((await testDb.db.execute(sql`SELECT name FROM secrets ORDER BY name`)).rows as Array<{ name: string }>).map((r) => r.name);

describe('force re-seeding providers', () => {
  it('deletes a provider\'s own key secret with it, and keeps a chosen one', async () => {
    await seedAIProviders({ keys: ['openai', 'ollama'] });
    await createSecret({ name: 'ai_provider_openai', value: 'own-key' });
    await createSecret({ name: 'chosen_key', value: 'chosen' });
    await testDb.db.execute(sql`UPDATE ai_providers SET api_key_secret = 'ai_provider_openai', api_key_secret_managed = true WHERE provider_key = 'openai'`);
    await testDb.db.execute(sql`UPDATE ai_providers SET auth_type = 'api_key', api_key_secret = 'chosen_key', api_key_secret_managed = false WHERE provider_key = 'ollama'`);

    await seedAIProviders({ keys: ['openai', 'ollama'], force: true });

    expect(await secretNames()).toEqual(['chosen_key']);
  });

  it('keeps the provider when deleting its own secret fails: both go or neither', async () => {
    await seedAIProviders({ keys: ['openai'], force: true });
    await createSecret({ name: 'ai_provider_openai', value: 'own-key' });
    await testDb.db.execute(sql`UPDATE ai_providers SET api_key_secret = 'ai_provider_openai', api_key_secret_managed = true WHERE provider_key = 'openai'`);
    const before = (await testDb.db.execute(sql`SELECT id FROM ai_providers WHERE provider_key = 'openai'`)).rows[0];

    const find = vi.spyOn(secretsRepository, 'findSecretReferences').mockRejectedValueOnce(new Error('lookup down'));
    try {
      await seedAIProviders({ keys: ['openai'], force: true });
    } finally {
      find.mockRestore();
    }

    expect((await testDb.db.execute(sql`SELECT id FROM ai_providers WHERE provider_key = 'openai'`)).rows[0]).toEqual(before);
    expect(await secretNames()).toContain('ai_provider_openai');
  });
});
