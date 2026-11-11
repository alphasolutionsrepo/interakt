// src/features/ai-service/ai-service.embedding-dimensions.test.ts

/**
 * The vector size a caller expects is sent to Ollama, so models that return longer
 * vectors (qwen3-embedding:4b gives 2560) fit an index mapped for fewer (1536).
 * Runs the real AI service and Ollama adapter; only the network is faked.
 * The last test calls a real local Ollama and runs only with OLLAMA_LIVE=1.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./ai-service.analytics', () => ({ trackUsage: vi.fn(), updateRealtimeMetrics: vi.fn() }));
vi.mock('@/features/ai-providers/ai-providers.service', () => ({
  getProviderConfigById: async () => ({ id: 'prov-1', providerKey: 'ollama', isEnabled: true, baseUrl: 'http://model.test', settings: {} }),
  getModelById: async () => ({ id: 7, modelKey: 'qwen3-embedding:4b', capabilities: {} }),
  getProviderByKey: vi.fn(),
  getResolvedDefaults: vi.fn(),
}));

import { OllamaAdapter } from './adapters/ollama.adapter';
import { generateEmbeddings } from './ai-service.service';

const config = { baseUrl: 'http://model.test', apiKey: '', modelKey: 'qwen3-embedding:4b', timeout: 5000, settings: {}, capabilities: {} };
const vectorOf = (size: number) => Array.from({ length: size }, () => 0.1);

/** Ollama answering /api/embed with vectors of the size asked for (or 2560); the bodies it was sent */
function fakeOllama() {
  const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string);
    const size = body.dimensions ?? 2560;
    return new Response(JSON.stringify({ model: body.model, embeddings: body.input.map(() => vectorOf(size)) }));
  });
  vi.stubGlobal('fetch', fetchMock);
  return () => fetchMock.mock.calls.map(([, init]) => JSON.parse(init.body as string));
}

afterEach(() => vi.unstubAllGlobals());

describe('the Ollama adapter embedding request', () => {
  it('sends the expected dimensions when the caller gives them', async () => {
    const sent = fakeOllama();
    const result = await new OllamaAdapter().generateEmbeddings({ texts: ['a', 'b'], dimensions: 1536 }, config);
    expect(sent()).toEqual([{ model: 'qwen3-embedding:4b', input: ['a', 'b'], dimensions: 1536 }]);
    expect(result.dimensions).toBe(1536);
  });

  it('leaves dimensions out when the caller gives none', async () => {
    const sent = fakeOllama();
    await new OllamaAdapter().generateEmbeddings({ texts: ['a'] }, config);
    expect(sent()[0]).not.toHaveProperty('dimensions');
  });
});

describe('generateEmbeddings in the AI service', () => {
  it('passes the expected dimensions on to every batch sent to Ollama', async () => {
    const sent = fakeOllama();
    const result = await generateEmbeddings(['a', 'b', 'c'], {
      providerId: 'prov-1', modelId: 7, feature: 'document_indexing', dimensions: 1536, batchSize: 2,
    });
    expect(sent().map((body) => body.dimensions)).toEqual([1536, 1536]);
    expect(result.embeddings.every((e) => e.vector.length === 1536)).toBe(true);
  });

  it('sends no dimensions when none are expected', async () => {
    const sent = fakeOllama();
    await generateEmbeddings(['a'], { providerId: 'prov-1', modelId: 7, feature: 'search_query' });
    expect(sent()[0]).not.toHaveProperty('dimensions');
  });
});

describe.skipIf(!process.env.OLLAMA_LIVE)('a real local Ollama', () => {
  it('returns 1536 numbers from qwen3-embedding:4b when asked for 1536', async () => {
    const live = { ...config, baseUrl: 'http://localhost:11434', timeout: 120000 };
    const result = await new OllamaAdapter().generateEmbeddings({ texts: ['hello'], dimensions: 1536 }, live);
    expect(result.embeddings[0]).toHaveLength(1536);
  });
});
