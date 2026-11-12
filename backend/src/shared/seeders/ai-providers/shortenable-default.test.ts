// src/shared/seeders/ai-providers/shortenable-default.test.ts

/**
 * A provider created from the seed data marks its embedding models of the known families as
 * able to shorten their vectors, and no other model.
 */

import { describe, it, expect, vi } from 'vitest';

const inserted = vi.hoisted(() => ({ models: [] as Array<Record<string, unknown>> }));

vi.mock('@/db/index', () => {
  const insert = (table: { __name?: string }) => ({
    values: (rows: unknown) => {
      if (table.__name === 'models') {
        inserted.models = rows as Array<Record<string, unknown>>;
        return Promise.resolve();
      }
      return { returning: async () => [{ id: 'p1' }] };
    },
  });
  return { db: { insert } };
});
vi.mock('@/db/schema/ai-providers.schema', () => ({
  aiProviders: { __name: 'providers' },
  aiProviderModels: { __name: 'models' },
  systemDefaults: {},
}));
vi.mock('@/features/ai-providers/ai-providers.service', () => ({ discoverOllamaModels: vi.fn() }));
vi.mock('../seed-registry.service', () => ({}));

import { createProviderFromSeed, AI_PROVIDER_SEEDS } from './index';

describe('seeded provider models', () => {
  it('are marked as able to shorten only when they are embedding models of a known family', async () => {
    for (const seed of AI_PROVIDER_SEEDS) {
      await createProviderFromSeed(seed);
      for (const row of inserted.models) {
        const family = /^(qwen3-embedding|nomic-embed-text|text-embedding-3-)/.test(String(row.modelKey));
        expect(row.canShortenVectors, String(row.modelKey)).toBe(row.modelType === 'embedding' && family);
      }
    }
  });

  it('includes a marked model, so the check above is not empty', async () => {
    const marked: string[] = [];
    for (const seed of AI_PROVIDER_SEEDS) {
      await createProviderFromSeed(seed);
      marked.push(...inserted.models.filter((r) => r.canShortenVectors).map((r) => String(r.modelKey)));
    }
    expect(marked.length).toBeGreaterThan(0);
  });
});
