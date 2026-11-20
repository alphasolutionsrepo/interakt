// src/shared/seeders/demo/demo-provider-key.test.ts

/**
 * Demo setup (and Initial Setup, which runs it) saves the AI provider key it is given in the
 * Secrets Vault, like the provider form: the provider keeps only the secret's name. Without a
 * key it keeps the one already saved; with no usable encryption key it says what to set.
 * Real demo provider step, provider service and vault on PGlite.
 */

import { sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { createAppTestDb, type AppTestDb } from '@/shared/test/app-test-db';

let testDb: AppTestDb;
vi.mock('server-only', () => ({}));
vi.mock('@/db/index', () => ({ get db() { return testDb.db; } }));

import { seedProvider } from './demo.seeder';

import { decrypt } from '@/features/secrets/secrets.encryption';
import { seedAIProviders } from '@/shared/seeders/ai-providers';

const KEY = 'b'.repeat(64);
const openai = {
  key: 'openai', label: 'OpenAI', authType: 'api_key' as const, requiredModels: [], embeddingDimensions: 1536,
  defaults: { chatModel: 'gpt-4o-mini', textModel: 'gpt-4o-mini', embeddingModel: 'text-embedding-3-small' },
};

beforeAll(async () => {
  vi.stubEnv('SECRETS_ENCRYPTION_KEY', KEY);
  testDb = await createAppTestDb();
  await seedAIProviders({ keys: ['openai'] });
}, 60_000);
afterAll(() => testDb.close());
afterEach(() => { vi.stubEnv('SECRETS_ENCRYPTION_KEY', KEY); });

const saved = async () => {
  const provider = (await testDb.db.execute(sql`SELECT api_key, api_key_secret FROM ai_providers WHERE provider_key = 'openai'`)).rows[0] as { api_key: string | null; api_key_secret: string | null };
  const secret = provider.api_key_secret
    ? (await testDb.db.execute(sql`SELECT encrypted_value FROM secrets WHERE name = ${provider.api_key_secret}`)).rows[0] as { encrypted_value: string } | undefined
    : undefined;
  return { ...provider, value: secret ? decrypt(secret.encrypted_value) : undefined };
};

describe('the demo\'s AI provider step', () => {
  it('saves the key it is given in the vault, and keeps it when run again without one', async () => {
    await seedProvider(openai, { apiKey: 'demo-key' });
    expect(await saved()).toEqual({ api_key: null, api_key_secret: 'ai_provider_openai', value: 'demo-key' });

    await seedProvider(openai, {});
    expect(await saved()).toMatchObject({ api_key_secret: 'ai_provider_openai', value: 'demo-key' });
  });

  it('with no usable encryption key, says what to set and keeps the saved key', async () => {
    vi.stubEnv('SECRETS_ENCRYPTION_KEY', '');
    await expect(seedProvider(openai, { apiKey: 'other-key' })).rejects.toMatchObject({ code: 'ENCRYPTION_KEY_NOT_SET' });
    vi.stubEnv('SECRETS_ENCRYPTION_KEY', KEY);
    expect(await saved()).toMatchObject({ value: 'demo-key' });
  });
});
