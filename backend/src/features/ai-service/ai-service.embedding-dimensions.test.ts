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
import { OpenAIAdapter } from './adapters/openai.adapter';
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

/** An OpenAI-compatible server answering /embeddings with vectors of the size asked for (or 2560); the bodies it was sent */
function fakeOpenAICompatible() {
  const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string);
    const size = body.dimensions ?? 2560;
    return new Response(JSON.stringify({
      data: body.input.map((_: string, index: number) => ({ index, embedding: vectorOf(size) })),
      usage: { prompt_tokens: 1, total_tokens: 1 },
    }));
  });
  vi.stubGlobal('fetch', fetchMock);
  return () => fetchMock.mock.calls.map(([, init]) => JSON.parse(init.body as string));
}

describe('the OpenAI-compatible adapter embedding request', () => {
  it('sends the expected dimensions when the caller gives them', async () => {
    const sent = fakeOpenAICompatible();
    const result = await new OpenAIAdapter().generateEmbeddings({ texts: ['a', 'b'], dimensions: 1536 }, config);
    expect(sent()[0]).toMatchObject({ model: 'qwen3-embedding:4b', input: ['a', 'b'], dimensions: 1536 });
    expect(result.dimensions).toBe(1536);
  });

  it('leaves dimensions out when the caller gives none', async () => {
    const sent = fakeOpenAICompatible();
    await new OpenAIAdapter().generateEmbeddings({ texts: ['a'] }, config);
    expect(sent()[0]).not.toHaveProperty('dimensions');
  });
});

describe('a model that refuses the requested vector size', () => {
  const refusal = (message: string) => () => new Response(JSON.stringify({ error: { message } }), { status: 400 });
  /** The server answers `first` to a request carrying dimensions and a vector otherwise; the bodies it was sent */
  function refusingServer(first: () => Response, shape: 'openai' | 'ollama') {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      if ('dimensions' in body) return first();
      return shape === 'openai'
        ? new Response(JSON.stringify({ data: [{ index: 0, embedding: vectorOf(1536) }], usage: { prompt_tokens: 1, total_tokens: 1 } }))
        : new Response(JSON.stringify({ model: body.model, embeddings: [vectorOf(768)] }));
    });
    vi.stubGlobal('fetch', fetchMock);
    return () => fetchMock.mock.calls.map(([, init]) => JSON.parse(init.body as string));
  }
  const refusedDimensions = 'This model does not support specifying dimensions';

  it('is asked again once without dimensions, and answers (OpenAI-compatible)', async () => {
    const sent = refusingServer(refusal(refusedDimensions), 'openai');
    const result = await new OpenAIAdapter().generateEmbeddings({ texts: ['a'], dimensions: 1536 }, { ...config, baseUrl: 'http://ada-server.test' });
    expect(sent().map((body) => 'dimensions' in body)).toEqual([true, false]);
    expect(result.embeddings[0]).toHaveLength(1536);
  });

  it('is asked again once without dimensions, and answers (Ollama)', async () => {
    const sent = refusingServer(() => new Response(JSON.stringify({ error: 'dimensions 4096 exceeds embedding length 768' }), { status: 400 }), 'ollama');
    const result = await new OllamaAdapter().generateEmbeddings({ texts: ['a'], dimensions: 4096 }, { ...config, baseUrl: 'http://small-model.test' });
    expect(sent().map((body) => 'dimensions' in body)).toEqual([true, false]);
    expect(result.embeddings[0]).toHaveLength(768);
  });

  it('passes on a 400 about something else without asking again', async () => {
    const sent = refusingServer(refusal('input is too long'), 'openai');
    await expect(new OpenAIAdapter().generateEmbeddings({ texts: ['a'], dimensions: 1536 }, { ...config, baseUrl: 'http://other-server.test' }))
      .rejects.toThrow(/too long/);
    expect(sent()).toHaveLength(1);
  });

  it('does not ask again when no dimensions were sent', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ error: { message: refusedDimensions } }), { status: 400 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(new OpenAIAdapter().generateEmbeddings({ texts: ['a'] }, { ...config, baseUrl: 'http://no-dims.test' })).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
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

  it("returns 1536 numbers through Ollama's OpenAI-compatible /v1 endpoint", async () => {
    const live = { ...config, baseUrl: 'http://localhost:11434/v1', apiKey: 'none', timeout: 120000 };
    const result = await new OpenAIAdapter().generateEmbeddings({ texts: ['hello'], dimensions: 1536 }, live);
    expect(result.embeddings[0]).toHaveLength(1536);
  });
});
