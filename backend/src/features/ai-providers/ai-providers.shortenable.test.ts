// src/features/ai-providers/ai-providers.shortenable.test.ts

/**
 * Only embedding models marked as able to shorten their vectors are sent a vector size.
 * A new model of a known family starts marked; the admin's choice wins when one is given.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/cache/cache-manager', () => ({
  CacheManager: class {
    get() { return undefined; }
    set() {}
    delete() {}
  },
}));
vi.mock('./ai-providers.repository', () => ({
  getProviderById: vi.fn(async () => ({ id: 'p', providerKey: 'ollama', baseUrl: 'http://localhost:11434' })),
  modelKeyExists: vi.fn(async () => false),
  listModelsByProvider: vi.fn(async () => []),
  getModelById: vi.fn(async () => ({ id: 7, providerId: 'p', modelKey: 'qwen3-embedding:4b', modelType: 'embedding' })),
  updateModel: vi.fn(async (_id: number, row: Record<string, unknown>) => ({ id: 7, providerId: 'p', ...row })),
  updateModelAvailability: vi.fn(async () => ({})),
  createModel: vi.fn(async (row: Record<string, unknown>) => ({ id: 1, ...row })),
}));

import * as repository from './ai-providers.repository';
import { createModel, discoverOllamaModels, updateModel } from './ai-providers.service';
import { canShortenVectorsByDefault } from './shortenable-embeddings';

const created = () => vi.mocked(repository.createModel).mock.lastCall?.[0];
const input = (modelKey: string, extra: Record<string, unknown> = {}) => ({
  providerId: '00000000-0000-4000-8000-000000000001', modelKey, displayName: modelKey, modelType: 'embedding' as const,
  dimensions: 1536, capabilities: {}, isAvailable: true, isDiscovered: false, sortOrder: 0, ...extra,
});

afterEach(() => {
  vi.mocked(repository.createModel).mockClear();
  vi.unstubAllGlobals();
});

describe('the families marked as able to shorten their vectors', () => {
  it.each(['qwen3-embedding:4b', 'qwen3-embedding', 'nomic-embed-text', 'nomic-embed-text:v1.5', 'text-embedding-3-small', 'openai/text-embedding-3-large'])(
    '%s is marked', (key) => expect(canShortenVectorsByDefault(key, 'embedding')).toBe(true),
  );

  it.each(['mxbai-embed-large', 'all-minilm', 'text-embedding-ada-002', 'embeddinggemma-2:latest'])(
    '%s is not', (key) => expect(canShortenVectorsByDefault(key, 'embedding')).toBe(false),
  );

  it('never marks a model that is not an embedding model', () => {
    expect(canShortenVectorsByDefault('qwen3-embedding:4b', 'chat')).toBe(false);
  });
});

describe('a model created by an admin', () => {
  it('is marked when it is of a known family', async () => {
    await createModel(input('qwen3-embedding:4b') as never);
    expect(created()).toMatchObject({ canShortenVectors: true });
  });

  it('is not marked when it is of another family', async () => {
    await createModel(input('mxbai-embed-large') as never);
    expect(created()).toMatchObject({ canShortenVectors: false });
  });

  it("keeps the admin's choice over the family", async () => {
    await createModel(input('qwen3-embedding:4b', { canShortenVectors: false }) as never);
    expect(created()).toMatchObject({ canShortenVectors: false });
  });
});

describe('a model found by Ollama discovery', () => {
  it('is marked when it is of a known family', async () => {
    const installed = (name: string) => ({ name, details: { parameter_size: '4B', quantization_level: 'Q4', family: 'qwen3', families: ['qwen3'] } });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ models: [installed('qwen3-embedding:4b')] }))));

    await discoverOllamaModels('p');

    expect(created()).toMatchObject({ modelKey: 'qwen3-embedding:4b', canShortenVectors: true });
  });
});

describe('a model changed by an admin', () => {
  it('saves the shorten choice', async () => {
    await updateModel(7, { canShortenVectors: false } as never);
    expect(vi.mocked(repository.updateModel)).toHaveBeenLastCalledWith(7, { canShortenVectors: false });
  });

  it('leaves the choice alone when the change is about something else', async () => {
    await updateModel(7, { displayName: 'Qwen' } as never);
    expect(vi.mocked(repository.updateModel)).toHaveBeenLastCalledWith(7, { displayName: 'Qwen' });
  });
});
