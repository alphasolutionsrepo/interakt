// src/features/ai-providers/ai-providers.discovery.test.ts

/**
 * Ollama model discovery: what Ollama reports as installed decides which models an
 * admin can pick, seeded catalog entries included, and discovered models get names
 * in the catalog's style.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('@/shared/cache/cache-manager', () => ({
  CacheManager: class {
    get() { return undefined; }
    set() {}
    delete() {}
  },
}));
vi.mock('./ai-providers.repository', () => ({
  getProviderById: vi.fn(async () => ({ id: 'p', providerKey: 'ollama', baseUrl: 'http://localhost:11434' })),
  listModelsByProvider: vi.fn(async () => [
    // Seeded, installed
    { id: 1, modelKey: 'qwen2.5:14b', isAvailable: true, isDiscovered: false },
    // Seeded, never installed
    { id: 2, modelKey: 'llama3:70b', isAvailable: true, isDiscovered: false },
    // Discovered earlier, since removed
    { id: 3, modelKey: 'qwen2.5:32b', isAvailable: true, isDiscovered: true },
    // Already hidden
    { id: 4, modelKey: 'mistral', isAvailable: false, isDiscovered: false },
    // Seeded without a tag; Ollama reports it as ":latest"
    { id: 5, modelKey: 'nomic-embed-text', isAvailable: true, isDiscovered: false },
  ]),
  updateModel: vi.fn(async () => ({})),
  createModel: vi.fn(async () => ({})),
  updateModelAvailability: vi.fn(async () => ({})),
}));

import * as repository from './ai-providers.repository';
import { discoverOllamaModels, formatModelDisplayName } from './ai-providers.service';

const installed = (name: string) => ({
  name,
  details: { parameter_size: '12B', quantization_level: 'Q4_K_M', family: 'gemma3', families: ['gemma3'] },
});

afterEach(() => vi.unstubAllGlobals());

describe('discoverOllamaModels', () => {
  it('hides every model Ollama does not report, seeded ones included', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      models: [installed('qwen2.5:14b'), installed('gemma3:12b'), installed('nomic-embed-text:latest')],
    }))));

    const result = await discoverOllamaModels('p');

    const hidden = vi.mocked(repository.updateModelAvailability).mock.calls.map(([id]) => id);
    expect(hidden.sort()).toEqual([2, 3]);
    // nomic-embed-text:latest is the seeded nomic-embed-text, not a new model
    expect(result).toMatchObject({ modelsFound: 3, modelsAdded: 1, modelsUpdated: 2, modelsRemoved: 2 });
    expect(repository.createModel).toHaveBeenCalledWith(expect.objectContaining({
      modelKey: 'gemma3:12b',
      displayName: 'Gemma 3 12B',
    }));
  });
});

describe('formatModelDisplayName', () => {
  it.each([
    ['gemma3:12b', 'Gemma 3 12B'],
    ['qwen2.5:14b', 'Qwen 2.5 14B'],
    ['nomic-embed-text:latest', 'Nomic Embed Text'],
    ['embeddinggemma:300m', 'Embeddinggemma 300M'],
    ['mistral', 'Mistral'],
  ])('%s → %s', (key, name) => {
    expect(formatModelDisplayName(key)).toBe(name);
  });
});
