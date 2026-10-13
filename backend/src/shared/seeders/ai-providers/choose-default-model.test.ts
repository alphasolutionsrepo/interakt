// src/shared/seeders/ai-providers/choose-default-model.test.ts

/**
 * First start trims the Ollama catalog to what's installed, so the seeded defaults
 * (e.g. llama3) may not be available. Defaults then fall back to an installed model.
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('@/db/index', () => ({ db: {} }));
vi.mock('@/features/ai-providers/ai-providers.service', () => ({ discoverOllamaModels: vi.fn() }));
vi.mock('../seed-registry.service', () => ({}));

import { chooseDefaultModel } from './index';

const model = (id: number, modelKey: string, modelType: string, isAvailable: boolean, sortOrder = 0) =>
  ({ id, modelKey, modelType, isAvailable, sortOrder });

describe('chooseDefaultModel', () => {
  const catalog = [
    model(1, 'llama3', 'chat', false, 0),
    model(2, 'qwen2.5:14b', 'chat', true, 100),
    model(3, 'gemma3:12b', 'chat', true, 100),
    model(4, 'nomic-embed-text:v1.5', 'embedding', false, 0),
    model(5, 'nomic-embed-text:latest', 'embedding', true, 100),
  ];

  it('keeps the seeded default when it is available', () => {
    const installed = catalog.map((m) => (m.id === 1 ? { ...m, isAvailable: true } : m));
    expect(chooseDefaultModel(installed, 'llama3', ['chat'])?.modelKey).toBe('llama3');
  });

  it('falls back to an installed model of the same kind', () => {
    expect(chooseDefaultModel(catalog, 'llama3', ['chat'])?.modelKey).toBe('qwen2.5:14b');
    expect(chooseDefaultModel(catalog, 'nomic-embed-text:v1.5', ['embedding'])?.modelKey).toBe('nomic-embed-text:latest');
  });

  it('keeps the seeded default when nothing of that kind is installed', () => {
    const noChat = catalog.filter((m) => m.modelType !== 'chat' || m.id === 1);
    expect(chooseDefaultModel(noChat, 'llama3', ['chat'])?.modelKey).toBe('llama3');
  });
});
