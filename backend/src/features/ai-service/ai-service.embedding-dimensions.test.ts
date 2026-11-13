// src/features/ai-service/ai-service.embedding-dimensions.test.ts

/**
 * The vector size a caller expects is sent to a model that can shorten its vectors, so
 * models that return longer ones (qwen3-embedding:4b gives 2560) fit an index mapped for
 * fewer (1536). A model that is not marked as able to shorten gets no size.
 * Runs the real AI service and both adapters; only the network is faked.
 * The last tests call a real local Ollama and run only with OLLAMA_LIVE=1.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { embedBatch } from '@/features/embedding/embedding.service';
import { reported, type LogLine } from '@/shared/test/log-recorder';

const logs = vi.hoisted(() => [] as LogLine[]);
vi.mock('@/shared/logger/logger', async () => (await import('@/shared/test/log-recorder')).recordingLogger(logs));
vi.mock('./ai-service.analytics', () => ({ trackUsage: vi.fn(), updateRealtimeMetrics: vi.fn() }));

/** The model row the AI service resolves: the registered size, and whether it can shorten vectors */
const model = vi.hoisted(() => ({ modelKey: 'qwen3-embedding:4b', dimensions: 1536 as number | null, canShortenVectors: true }));
vi.mock('@/features/ai-providers/ai-providers.service', () => ({
  getProviderConfigById: async () => ({ id: 'prov-1', providerKey: 'ollama', isEnabled: true, baseUrl: 'http://model.test', settings: {} }),
  getModelById: async () => ({ id: 7, capabilities: {}, ...model }),
  getProviderByKey: vi.fn(),
  getResolvedDefaults: async () => ({ embedding: { providerId: 'prov-1', modelId: 7 } }),
}));

import { OllamaAdapter } from './adapters/ollama.adapter';
import { OpenAIAdapter } from './adapters/openai.adapter';
import { generateEmbeddings } from './ai-service.service';

const config = { baseUrl: 'http://model.test', apiKey: '', modelKey: 'qwen3-embedding:4b', timeout: 5000, settings: {}, capabilities: {} };
const vectorOf = (size: number) => Array.from({ length: size }, () => 0.1);
const server = (name: string) => ({ ...config, baseUrl: `http://${name}.test` });

type Body = { model: string; input: string[]; dimensions?: number };
type Style = 'openai' | 'ollama';

/** A server answering with vectors of the size asked for (or `own`); the bodies it was sent */
function fakeServer(style: Style, own = 2560, refuse?: (body: Body) => Response | undefined) {
  const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string) as Body;
    const refused = refuse?.(body);
    if (refused) return refused;
    const size = body.dimensions ?? own;
    return style === 'openai'
      ? new Response(JSON.stringify({ data: body.input.map((_, index) => ({ index, embedding: vectorOf(size) })), usage: { prompt_tokens: 1, total_tokens: 1 } }))
      : new Response(JSON.stringify({ model: body.model, embeddings: body.input.map(() => vectorOf(size)) }));
  });
  vi.stubGlobal('fetch', fetchMock);
  return () => fetchMock.mock.calls.map(([, init]) => JSON.parse(init.body as string) as Body);
}

const adapters = { openai: () => new OpenAIAdapter(), ollama: () => new OllamaAdapter() };

beforeEach(() => {
  logs.length = 0;
  model.modelKey = 'qwen3-embedding:4b';
  model.dimensions = 1536;
  model.canShortenVectors = true;
});
afterEach(() => vi.unstubAllGlobals());

describe.each(['openai', 'ollama'] as const)('the %s adapter embedding request', (style) => {
  it('sends the expected dimensions when the caller gives them', async () => {
    const sent = fakeServer(style);
    const result = await adapters[style]().generateEmbeddings({ texts: ['a', 'b'], dimensions: 1536 }, config);
    expect(sent()[0]).toMatchObject({ model: 'qwen3-embedding:4b', input: ['a', 'b'], dimensions: 1536 });
    expect(result.dimensions).toBe(1536);
  });

  it('leaves dimensions out when the caller gives none', async () => {
    const sent = fakeServer(style);
    await adapters[style]().generateEmbeddings({ texts: ['a'] }, config);
    expect(sent()[0]).not.toHaveProperty('dimensions');
  });
});

describe.each(['openai', 'ollama'] as const)('a model that refuses the requested vector size (%s)', (style) => {
  // The model's own size is 768; it refuses a size it can't give, in whatever shape the server uses
  const refuses = (response: () => Response) => (body: Body) => ('dimensions' in body ? response() : undefined);
  const sizes = (sent: () => Body[]) => sent().map((body) => 'dimensions' in body);
  // How each API style words its error: OpenAI nests the message, Ollama gives the text
  const errorText = (message: string) => (style === 'openai' ? { message } : message);

  it.each([
    ['a JSON error body', () => new Response(JSON.stringify({ error: { message: 'This model does not support specifying dimensions' } }), { status: 400 })],
    ['a 422', () => new Response(JSON.stringify({ detail: 'unprocessable' }), { status: 422 })],
    ['a plain text 400', () => new Response('bad request', { status: 400 })],
  ])('is asked again once without dimensions when refused with %s', async (_, response) => {
    const sent = fakeServer(style, 768, refuses(response));
    const result = await adapters[style]().generateEmbeddings({ texts: ['a'], dimensions: 768 }, server(`refuses-${style}-${_}`));
    // The retry returns the model's own size, which is what was asked for here
    expect(sizes(sent)).toEqual([true, false]);
    expect(result.embeddings[0]).toHaveLength(768);
  });

  it('is not asked again when no dimensions were sent', async () => {
    const fetchMock = vi.fn(async () => new Response('bad request', { status: 400 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(adapters[style]().generateEmbeddings({ texts: ['a'] }, server(`no-dims-${style}`))).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('throws the refusal, not wrong-size vectors, when the retry still does not give the size asked for', async () => {
    const sent = fakeServer(style, 2560, refuses(() => new Response(JSON.stringify({ error: errorText('dimensions not supported here') }), { status: 400 })));
    await expect(adapters[style]().generateEmbeddings({ texts: ['a'], dimensions: 1536 }, server(`mismatch-${style}`)))
      .rejects.toThrow(/dimensions not supported here|HTTP 400/);
    expect(sizes(sent)).toEqual([true, false]);
  });

  it('is sent no dimensions on later calls, and warned about once', async () => {
    const sent = fakeServer(style, 768, refuses(() => new Response('bad request', { status: 400 })));
    const target = server(`remembered-${style}`);
    for (let call = 0; call < 3; call++) {
      await adapters[style]().generateEmbeddings({ texts: ['a'], dimensions: 768 }, target);
    }
    expect(sizes(sent)).toEqual([true, false, false, false]);
    expect(reported(logs).filter((line) => /refused the requested embedding size/.test(line.message))).toHaveLength(1);
  });

  it('after a refusal still throws the refusal for a size the model cannot give, on later calls too', async () => {
    fakeServer(style, 768, refuses(() => new Response(JSON.stringify({ error: errorText('no dimensions here') }), { status: 400 })));
    const target = server(`later-mismatch-${style}`);
    await adapters[style]().generateEmbeddings({ texts: ['a'], dimensions: 768 }, target);
    await expect(adapters[style]().generateEmbeddings({ texts: ['a'], dimensions: 1536 }, target)).rejects.toThrow();
  });
});

describe.each(['openai', 'ollama'] as const)('what a refusal teaches about a model (%s)', (style) => {
  const bad = () => new Response('bad request', { status: 400 });
  const sizes = (sent: () => Body[]) => sent().map((body) => 'dimensions' in body);

  it('is not remembered after an unrelated 400: the next call still sends the size', async () => {
    let broken = true;
    const sent = fakeServer(style, 768, () => (broken ? bad() : undefined));
    const target = server(`unrelated-${style}`);
    await expect(adapters[style]().generateEmbeddings({ texts: ['a'], dimensions: 768 }, target)).rejects.toThrow();
    broken = false;
    await adapters[style]().generateEmbeddings({ texts: ['a'], dimensions: 768 }, target);
    expect(sizes(sent)).toEqual([true, false, true]);
  });

  it('is not remembered when the retry without a size fails too, and that error is thrown', async () => {
    fakeServer(style, 768, (body) => ('dimensions' in body ? bad() : new Response('model not found', { status: 404 })));
    const target = server(`retry-fails-${style}`);
    await expect(adapters[style]().generateEmbeddings({ texts: ['a'], dimensions: 768 }, target)).rejects.toThrow(/404|not found/);
    const again = fakeServer(style, 768);
    await adapters[style]().generateEmbeddings({ texts: ['a'], dimensions: 768 }, target);
    expect(sizes(again)).toEqual([true]);
  });

  it('refusing one size does not stop other sizes being sent', async () => {
    const sent = fakeServer(style, 768, (body) => (body.dimensions === 1536 ? bad() : undefined));
    const target = server(`per-size-${style}`);
    // 1536 is refused, and the model's own 768 comes back instead: the refusal is thrown, nothing is remembered
    await expect(adapters[style]().generateEmbeddings({ texts: ['a'], dimensions: 1536 }, target)).rejects.toThrow();
    const result = await adapters[style]().generateEmbeddings({ texts: ['a'], dimensions: 768 }, target);
    expect(sent().at(-1)?.dimensions).toBe(768);
    expect(result.embeddings[0]).toHaveLength(768);
  });

  it('remembers a refused size only per size: after 768 is refused and answered, 1024 is still tried', async () => {
    const sent = fakeServer(style, 768, (body) => (body.dimensions === 768 ? bad() : undefined));
    const target = server(`per-size-2-${style}`);
    await adapters[style]().generateEmbeddings({ texts: ['a'], dimensions: 768 }, target);
    await adapters[style]().generateEmbeddings({ texts: ['a'], dimensions: 768 }, target);
    await adapters[style]().generateEmbeddings({ texts: ['a'], dimensions: 1024 }, target);
    expect(sent().map((body) => body.dimensions)).toEqual([768, undefined, undefined, 1024]);
  });
});

describe('the AI service and a refusal that ends in a throw', () => {
  it('does not record it: a later call to the same model still sends the size', async () => {
    model.modelKey = 'throwing-model';
    model.dimensions = 1536;
    let broken = true;
    const sent = fakeServer('ollama', 2560, () => (broken ? new Response('bad request', { status: 400 }) : undefined));
    await expect(generateEmbeddings(['a'], { providerId: 'prov-1', modelId: 7, feature: 'search_query' })).rejects.toThrow();
    broken = false;
    await generateEmbeddings(['a'], { providerId: 'prov-1', modelId: 7, feature: 'search_query' });
    expect(sent().at(-1)?.dimensions).toBe(1536);
  });
});

describe('the Ollama older embeddings endpoint', () => {
  it('warns once per model that it cannot take a vector size', async () => {
    const fetchMock = vi.fn(async (url: string) => url.endsWith('/api/embed')
      ? new Response('not found', { status: 404 })
      : new Response(JSON.stringify({ embedding: vectorOf(768) })));
    vi.stubGlobal('fetch', fetchMock);
    const target = server('legacy-ollama');
    await new OllamaAdapter().generateEmbeddings({ texts: ['a'], dimensions: 1536 }, target);
    await new OllamaAdapter().generateEmbeddings({ texts: ['a'], dimensions: 1536 }, target);
    expect(reported(logs).filter((line) => /older embeddings endpoint/.test(line.message))).toHaveLength(1);
  });
});

describe('a refusing model across batches', () => {
  it('is sent dimensions only the first time: 5 batches take 6 requests, not 10', async () => {
    const sent = fakeServer('ollama', 768, (body) => ('dimensions' in body ? new Response('bad request', { status: 400 }) : undefined));
    model.dimensions = 768;
    model.modelKey = 'refusing-model'; // a refusal is remembered per model, so this one is its own
    await generateEmbeddings(['a', 'b', 'c', 'd', 'e'], { providerId: 'prov-1', modelId: 7, feature: 'document_indexing', batchSize: 1 });
    expect(sent()).toHaveLength(6);
  });
});

describe('generateEmbeddings in the AI service', () => {
  it('passes the expected dimensions on to every batch of a model that can shorten its vectors', async () => {
    const sent = fakeServer('ollama');
    const result = await generateEmbeddings(['a', 'b', 'c'], {
      providerId: 'prov-1', modelId: 7, feature: 'document_indexing', dimensions: 1536, batchSize: 2,
    });
    expect(sent().map((body) => body.dimensions)).toEqual([1536, 1536]);
    expect(result.embeddings.every((e) => e.vector.length === 1536)).toBe(true);
  });

  it('sends no dimensions to a model that is not marked able to shorten, even when the caller passes one', async () => {
    model.canShortenVectors = false;
    const sent = fakeServer('ollama');
    const result = await generateEmbeddings(['a'], { providerId: 'prov-1', modelId: 7, feature: 'document_indexing', dimensions: 1536 });
    expect(sent()[0]).not.toHaveProperty('dimensions');
    // The wrong size is still reported, as before
    expect(result.embeddings[0].vector).toHaveLength(2560);
    expect(reported(logs).filter((line) => /dimensions mismatch/.test(line.message))).toHaveLength(1);
  });

  it.each([768, 1536, 2560])('sends 1536 on the knowledge base and memory path even when the model is registered at %s', async (registered) => {
    // embedBatch is what the knowledge base, session messages and memories call, with no size;
    // they store into vector(1536) columns
    model.dimensions = registered;
    const sent = fakeServer('ollama');
    const vectors = await embedBatch(['a', 'b'], { feature: 'knowledge_base' });
    expect(sent()[0].dimensions).toBe(1536);
    expect(vectors.every((vector) => vector?.length === 1536)).toBe(true);
  });

  it("uses the model's registered size for a caller of the AI service that gives none", async () => {
    model.dimensions = 2560;
    const sent = fakeServer('ollama');
    await generateEmbeddings(['a'], { providerId: 'prov-1', modelId: 7, feature: 'search_query' });
    expect(sent()[0].dimensions).toBe(2560);
  });

  it("lets the caller's size win over the model's registered size", async () => {
    const sent = fakeServer('ollama');
    await generateEmbeddings(['a'], { providerId: 'prov-1', modelId: 7, feature: 'search_query', dimensions: 1024 });
    expect(sent()[0].dimensions).toBe(1024);
  });

  it('sends no dimensions when the model has no registered size and the caller gives none', async () => {
    model.dimensions = null;
    const sent = fakeServer('ollama');
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
