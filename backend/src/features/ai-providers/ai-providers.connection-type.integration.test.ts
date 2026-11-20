// src/features/ai-providers/ai-providers.connection-type.integration.test.ts

/**
 * An AI provider has any name the admin chooses and a connection type (the API it speaks)
 * that picks the adapter: several OpenAI-compatible providers side by side, an Ollama one under
 * any name, models discovered from either, and a gateway's Retry-After honoured. Real routes,
 * provider service, AI service and adapters on an in-memory Postgres (PGlite); two local HTTP
 * servers stand in for an OpenAI-compatible gateway and for Ollama.
 */

import http from 'node:http';
import type { AddressInfo } from 'node:net';

import { NextRequest } from 'next/server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

let testDb: AppTestDb;
vi.mock('@/db/index', () => ({ get db() { return testDb.db; } }));
vi.mock('@/features/auth/auth.api.handlers', async () => (await import('@/shared/test/access-stub')).signedInAuth);
vi.mock('@/features/access/access.service', async () => (await import('@/shared/test/access-stub')).accessService);
vi.mock('@/features/ai-service/ai-service.analytics', () => ({ trackUsage: vi.fn(), updateRealtimeMetrics: vi.fn() }));

import * as discoverRoute from '@/app/api/ai-providers/[id]/discover-models/route';
import * as modelRoute from '@/app/api/ai-provider-models/[id]/route';
import * as providerRoute from '@/app/api/ai-providers/[id]/route';
import * as testConnectionRoute from '@/app/api/ai-providers/[id]/test-connection/route';
import * as providersRoute from '@/app/api/ai-providers/route';
import { generateText, streamChat } from '@/features/ai-service/ai-service.service';
import { checkAIProvidersHealth } from '@/features/health/health.service';
import { sql } from 'drizzle-orm';

import { createAppTestDb, type AppTestDb } from '@/shared/test/app-test-db';

// ── Stand-ins ────────────────────────────────────────────────────────────────

type Seen = { at: number; path: string; auth?: string };
const gateway = {
  seen: [] as Seen[],
  models: [] as Array<Record<string, unknown>>,
  /** Answers to /v1/chat/completions, in order; empty means a normal answer */
  answers: [] as Array<{ status: number; retryAfter?: string }>,
  /** Whether /v1/embeddings answers (it tells an embedding model's dimensions) */
  embeddings: true,
};
/** An answer /v1/models gives instead of the list, when set */
let oddAnswer: unknown = null;
const ollama = {
  seen: [] as Seen[],
  tags: [] as Array<Record<string, unknown>>,
  /** /api/show answers by model name (model_info); unset names get a 404 */
  show: {} as Record<string, Record<string, unknown>>,
  /** Answers to /api/generate, in order; empty means a normal answer */
  answers: [] as Array<{ status: number; retryAfter?: string }>,
};
let gatewayUrl = '';
let ollamaUrl = '';
let gatewayServer: http.Server;
let ollamaServer: http.Server;
/** Redirects every request to the catcher; the half-redirector lists models itself but redirects /embeddings */
let redirectorServer: http.Server;
let halfRedirectorServer: http.Server;
let catcherServer: http.Server;
let redirectorUrl = '';
let halfRedirectorUrl = '';
let catcherReached: Array<{ method?: string; url?: string; auth?: string }> = [];
let redirectsMade = 0;

const chatAnswer = JSON.stringify({
  choices: [{ message: { role: 'assistant', content: 'Hi from the gateway' }, finish_reason: 'stop' }],
  usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
});

const listen = (server: http.Server) => new Promise<string>((resolve) =>
  server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`)));

beforeAll(async () => {
  vi.stubEnv('SECRETS_ENCRYPTION_KEY', 'b'.repeat(64)); // provider keys are saved in the Secrets Vault
  testDb = await createAppTestDb();
  gatewayServer = http.createServer((req, res) => {
    gateway.seen.push({ at: Date.now(), path: req.url ?? '', auth: req.headers.authorization });
    if (req.headers.authorization !== 'Bearer gw-key') { res.writeHead(401); return res.end('{"error":{"message":"bad key"}}'); }
    if (req.url === '/v1/models') return res.end(JSON.stringify(oddAnswer ?? { object: 'list', data: gateway.models }));
    if (req.url === '/v1/embeddings') {
      if (!gateway.embeddings) { res.writeHead(503); return res.end('{}'); }
      return res.end(JSON.stringify({ data: [{ embedding: [0.1, 0.2, 0.3, 0.4] }] }));
    }
    if (req.url === '/v1/chat/completions') {
      let raw = '';
      req.on('data', (c) => { raw += c; });
      req.on('end', () => {
        const next = gateway.answers.shift();
        if (next && next.status !== 200) {
          res.writeHead(next.status, next.retryAfter ? { 'retry-after': next.retryAfter } : {});
          return res.end(JSON.stringify({ error: { message: next.status === 401 ? 'bad key' : 'rate limited' } }));
        }
        if (JSON.parse(raw || '{}').stream) {
          return res.end('data: {"choices":[{"delta":{"content":"Hi from the gateway"},"finish_reason":"stop"}],"usage":{"prompt_tokens":1,"completion_tokens":1,"total_tokens":2}}\n\ndata: [DONE]\n\n');
        }
        res.end(chatAnswer);
      });
      return;
    }
    res.writeHead(404); res.end();
  });
  ollamaServer = http.createServer((req, res) => {
    ollama.seen.push({ at: Date.now(), path: req.url ?? '', auth: req.headers.authorization });
    if (req.url === '/api/generate') {
      const next = ollama.answers.shift();
      if (next && next.status !== 200) {
        res.writeHead(next.status, next.retryAfter ? { 'retry-after': next.retryAfter } : {});
        return res.end('{"error":"too many requests"}');
      }
      return res.end('{"response":"Hi from Ollama","done":true,"prompt_eval_count":1,"eval_count":1}');
    }
    if (req.url === '/api/tags') return res.end(JSON.stringify({ models: ollama.tags }));
    if (req.url === '/api/show') {
      let raw = '';
      req.on('data', (c) => { raw += c; });
      req.on('end', () => {
        const info = ollama.show[JSON.parse(raw || '{}').model];
        if (!info) { res.writeHead(404); return res.end('{"error":"model not found"}'); }
        const { capabilities, ...modelInfo } = info as { capabilities?: unknown };
        res.end(JSON.stringify({ model_info: modelInfo, ...(capabilities !== undefined && { capabilities }) }));
      });
      return;
    }
    res.writeHead(404); res.end();
  });
  catcherServer = http.createServer((req, res) => {
    catcherReached.push({ method: req.method, url: req.url, auth: req.headers.authorization });
    res.end('{}');
  });
  const catcherUrl = await listen(catcherServer);
  redirectorServer = http.createServer((req, res) => {
    redirectsMade++;
    res.writeHead(307, { location: `${catcherUrl}${req.url}` });
    res.end();
  });
  halfRedirectorServer = http.createServer((req, res) => {
    if (req.url === '/v1/models') return res.end(JSON.stringify({ object: 'list', data: [{ id: 'campus-embed', object: 'model' }] }));
    if (req.url === '/api/tags') return res.end(JSON.stringify({ models: [{ name: 'campus-chat:latest', details: { parameter_size: '1B', quantization_level: 'Q4', family: 'llama' } }] }));
    redirectsMade++;
    res.writeHead(307, { location: `${catcherUrl}${req.url}` });
    res.end();
  });
  redirectorUrl = await listen(redirectorServer);
  halfRedirectorUrl = await listen(halfRedirectorServer);
  gatewayUrl = `${await listen(gatewayServer)}/v1`;
  ollamaUrl = await listen(ollamaServer);
}, 60_000);

afterAll(async () => { gatewayServer.close(); ollamaServer.close(); redirectorServer.close(); halfRedirectorServer.close(); catcherServer.close(); await testDb.close(); });
beforeEach(() => { gateway.seen = []; gateway.answers = []; gateway.embeddings = true; ollama.seen = []; ollama.answers = []; ollama.tags = []; ollama.show = {}; catcherReached = []; redirectsMade = 0; });

// ── Calls through the routes ─────────────────────────────────────────────────

let n = 0;
async function createProvider(body: Record<string, unknown>) {
  const res = await providersRoute.POST(new NextRequest('http://localhost/api/ai-providers', {
    method: 'POST',
    body: JSON.stringify({ displayName: `Provider ${++n}`, providerType: 'local', isEnabled: true, ...body }),
  }));
  return { status: res.status, data: (await res.json()).data };
}
const idParams = (id: string) => ({ params: Promise.resolve({ id }) });
async function updateProvider(id: string, body: Record<string, unknown>) {
  const res = await providerRoute.PUT(new NextRequest(`http://localhost/api/ai-providers/${id}`, { method: 'PUT', body: JSON.stringify(body) }), idParams(id));
  return { status: res.status, data: (await res.json()).data };
}
async function modelsOf(id: string): Promise<Array<{ id: number; modelKey: string; modelType: string; dimensions: number | null; isAvailable: boolean; capabilities: Record<string, unknown> }>> {
  const res = await providerRoute.GET(new NextRequest(`http://localhost/api/ai-providers/${id}?includeModels=true`), idParams(id));
  return (await res.json()).data.models;
}
const addModel = (providerId: string, modelKey: string, isDiscovered: boolean, capabilities: Record<string, unknown> = {}) =>
  testDb.db.execute(sql`INSERT INTO ai_provider_models (provider_id, model_key, display_name, model_type, is_discovered, capabilities)
    VALUES (${providerId}, ${modelKey}, ${modelKey}, 'chat', ${isDiscovered}, ${JSON.stringify(capabilities)}::json)`);
const post = (route: { POST: unknown }, id: string) =>
  (route.POST as (r: NextRequest, c: unknown) => Promise<Response>)(new NextRequest(`http://localhost/api/ai-providers/${id}/x`, { method: 'POST' }), idParams(id));

/** A gateway provider with one chat model, ready for the AI service. */
async function gatewayWithModel(providerKey: string) {
  gateway.models = [{ id: 'campus-chat', object: 'model', context_length: 32768 }];
  const { data: provider } = await createProvider({ providerKey, connectionType: 'openai_compatible', authType: 'api_key', apiKey: 'gw-key', baseUrl: gatewayUrl });
  await post(discoverRoute, provider.id);
  const res = await providerRoute.GET(new NextRequest(`http://localhost/api/ai-providers/${provider.id}?includeModels=true`), idParams(provider.id));
  const body = (await res.json()).data;
  const model = body.models.find((m: { modelKey: string }) => m.modelKey === 'campus-chat');
  return { providerId: provider.id as string, modelId: model.id as number };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('naming providers and choosing what they speak', () => {
  it('keeps several OpenAI-compatible providers side by side, each under its own name', async () => {
    const campus = await createProvider({ providerKey: 'campus-ai', connectionType: 'openai_compatible', authType: 'api_key', apiKey: 'k', baseUrl: gatewayUrl });
    const research = await createProvider({ providerKey: 'research-cluster', connectionType: 'openai_compatible', authType: 'none', baseUrl: 'https://research.example.edu/v1' });
    expect([campus.status, research.status]).toEqual([201, 201]);
    expect([campus.data.connectionType, research.data.connectionType]).toEqual(['openai_compatible', 'openai_compatible']);
  });

  it.each([
    ['ollama', 'ollama'],
    ['team-models', 'openai_compatible'],
  ])('gives a provider keyed %s, created without a connection type, %s', async (providerKey, expected) => {
    const { data } = await createProvider({ providerKey, authType: 'none', baseUrl: 'http://localhost:11434' });
    expect(data.connectionType).toBe(expected);
  });

  it('saves a changed connection type', async () => {
    const { data } = await createProvider({ providerKey: 'switching', connectionType: 'openai_compatible', authType: 'none', baseUrl: ollamaUrl });
    const res = await providerRoute.PUT(
      new NextRequest(`http://localhost/api/ai-providers/${data.id}`, { method: 'PUT', body: JSON.stringify({ connectionType: 'ollama' }) }),
      idParams(data.id),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).data.connectionType).toBe('ollama');
  });
});

describe('an OpenAI-compatible gateway under its own name', () => {
  it('passes the connection test by reading /v1/models with its key', async () => {
    const { data } = await createProvider({ providerKey: 'gw-test', connectionType: 'openai_compatible', authType: 'api_key', apiKey: 'gw-key', baseUrl: gatewayUrl });
    const res = await post(testConnectionRoute, data.id);
    expect((await res.json()).data).toMatchObject({ success: true });
    expect(gateway.seen).toEqual([expect.objectContaining({ path: '/v1/models', auth: 'Bearer gw-key' })]);
  });

  it('discovers its text and embedding models, with the context size it reports, and hides what it stops listing', async () => {
    gateway.models = [
      { id: 'campus-chat', object: 'model', context_length: 32768 },
      { id: 'campus-embed', object: 'model' },
      { id: 'whisper-large', object: 'model' },
    ];
    const { data } = await createProvider({ providerKey: 'gw-discover', connectionType: 'openai_compatible', authType: 'api_key', apiKey: 'gw-key', baseUrl: gatewayUrl });

    const first = (await (await post(discoverRoute, data.id)).json()).data;
    expect(first).toMatchObject({ modelsFound: 2, modelsAdded: 2 });
    const models = (await (await providerRoute.GET(new NextRequest(`http://localhost/api/ai-providers/${data.id}?includeModels=true`), idParams(data.id))).json()).data.models;
    expect(Object.fromEntries(models.map((m: { modelKey: string; modelType: string; dimensions: number | null; capabilities: Record<string, unknown> }) =>
      [m.modelKey, { type: m.modelType, contextWindow: m.capabilities.contextWindow, dimensions: m.dimensions }]))).toEqual({
      'campus-chat': { type: 'chat', contextWindow: 32768, dimensions: null },
      'campus-embed': { type: 'embedding', contextWindow: undefined, dimensions: 4 },
    });

    gateway.models = [{ id: 'campus-chat', object: 'model' }];
    expect((await (await post(discoverRoute, data.id)).json()).data).toMatchObject({ modelsFound: 1, modelsRemoved: 1 });
  });

  it('answers through the OpenAI-compatible adapter, with its key', async () => {
    const { providerId, modelId } = await gatewayWithModel('campus-chat-provider');
    const result = await generateText('Say hi', { providerId, modelId });
    expect(result.text).toBe('Hi from the gateway');
    expect(gateway.seen.at(-1)).toMatchObject({ path: '/v1/chat/completions', auth: 'Bearer gw-key' });
  });
});

describe('an Ollama provider under its own name', () => {
  it('answers through the Ollama adapter', async () => {
    const { data } = await createProvider({ providerKey: 'lab-models', connectionType: 'ollama', authType: 'none', baseUrl: ollamaUrl });
    const model = await testDb.db.execute(
      sql`INSERT INTO ai_provider_models (provider_id, model_key, display_name, model_type) VALUES (${data.id}, 'qwen3.5:9b', 'Qwen', 'chat') RETURNING id`,
    ) as unknown as { rows: Array<{ id: number }> };
    const result = await generateText('Say hi', { providerId: data.id, modelId: model.rows[0].id });
    expect(result.text).toBe('Hi from Ollama');
    expect(ollama.seen.map((s) => s.path)).toEqual(['/api/generate']);
  });
});

describe('a gateway that asks callers to wait (Retry-After)', () => {
  it('is tried again only after the wait it asked for', async () => {
    const { providerId, modelId } = await gatewayWithModel('waiting-gateway');
    gateway.seen = [];
    gateway.answers = [{ status: 429, retryAfter: '3' }];
    const result = await generateText('Say hi', { providerId, modelId });
    expect(result.text).toBe('Hi from the gateway');
    const [first, second] = gateway.seen.filter((s) => s.path === '/v1/chat/completions');
    expect(second.at - first.at).toBeGreaterThanOrEqual(2900);
  }, 20_000);

  it('is not tried again when it asks for longer than the longest retry wait', async () => {
    const { providerId, modelId } = await gatewayWithModel('busy-gateway');
    gateway.seen = [];
    gateway.answers = [{ status: 429, retryAfter: '120' }];
    await expect(generateText('Say hi', { providerId, modelId })).rejects.toThrow(/rate limited/);
    expect(gateway.seen.filter((s) => s.path === '/v1/chat/completions')).toHaveLength(1);
  });
});

describe('models a gateway stops listing, or lists under names that are not text models', () => {
  it('stay when added by hand or seeded, hide when an earlier discovery added them, and gain a reported context size', async () => {
    const { data } = await createProvider({ providerKey: 'gw-hide', connectionType: 'openai_compatible', authType: 'api_key', apiKey: 'gw-key', baseUrl: gatewayUrl });
    await addModel(data.id, 'my-fine-tune', false);
    await addModel(data.id, 'gone-model', true);
    await addModel(data.id, 'gpt-4o-audio-preview', false);
    await addModel(data.id, 'campus-chat', false);
    // Discovered earlier, still listed, with a name new models aren't added under
    await addModel(data.id, 'glm-ocr-chat', true);
    gateway.models = [{ id: 'campus-chat', context_length: 16384 }, { id: 'gpt-4o-audio-preview' }, { id: 'glm-ocr-chat' }];

    await post(discoverRoute, data.id);

    const byKey = Object.fromEntries((await modelsOf(data.id)).map((m) => [m.modelKey, m]));
    expect(byKey['my-fine-tune'].isAvailable).toBe(true);
    expect(byKey['gpt-4o-audio-preview'].isAvailable).toBe(true);
    expect(byKey['gone-model'].isAvailable).toBe(false);
    expect(byKey['glm-ocr-chat'].isAvailable).toBe(true);
    expect(byKey['campus-chat'].capabilities.contextWindow).toBe(16384);

    // Later the service stops listing the models added by hand: they stay all the same
    gateway.models = [{ id: 'campus-chat' }];
    await post(discoverRoute, data.id);
    const later = Object.fromEntries((await modelsOf(data.id)).map((m) => [m.modelKey, m.isAvailable]));
    expect(later).toMatchObject({ 'my-fine-tune': true, 'gpt-4o-audio-preview': true, 'campus-chat': true, 'glm-ocr-chat': false });
  });

  it('leave a listed model an admin switched off as it is, and say so', async () => {
    const { data } = await createProvider({ providerKey: 'gw-off', connectionType: 'openai_compatible', authType: 'api_key', apiKey: 'gw-key', baseUrl: gatewayUrl });
    gateway.models = [{ id: 'campus-chat' }, { id: 'big-expensive-model' }];
    await post(discoverRoute, data.id);
    await testDb.db.execute(sql`UPDATE ai_provider_models SET is_available = false WHERE provider_id = ${data.id} AND model_key = 'big-expensive-model'`);

    const result = (await (await post(discoverRoute, data.id)).json()).data;

    expect(result.leftOff).toEqual(['big-expensive-model']);
    const byKey = Object.fromEntries((await modelsOf(data.id)).map((m) => [m.modelKey, m.isAvailable]));
    expect(byKey).toMatchObject({ 'campus-chat': true, 'big-expensive-model': false });
  });

  it('leave an Ollama model an admin switched off as it is', async () => {
    ollama.tags = [{ name: 'qwen2.5:14b', details: { parameter_size: '14B', quantization_level: 'Q4', family: 'qwen2' } }];
    const { data } = await createProvider({ providerKey: 'lab-off', connectionType: 'ollama', authType: 'none', baseUrl: ollamaUrl });
    await post(discoverRoute, data.id);
    await testDb.db.execute(sql`UPDATE ai_provider_models SET is_available = false WHERE provider_id = ${data.id}`);

    expect((await (await post(discoverRoute, data.id)).json()).data.leftOff).toEqual(['qwen2.5:14b']);
    expect((await modelsOf(data.id))[0].isAvailable).toBe(false);
  });

  it.each([
    ['an empty list', { object: 'list', data: [] }, 200],
    ['an answer with no model list', { message: 'gateway restarting' }, 502],
  ])('hides nothing on %s', async (_case, answer, status) => {
    const { data } = await createProvider({ providerKey: `gw-odd-${++n}`, connectionType: 'openai_compatible', authType: 'api_key', apiKey: 'gw-key', baseUrl: gatewayUrl });
    gateway.models = [{ id: 'campus-chat' }];
    await post(discoverRoute, data.id);
    oddAnswer = answer;
    expect((await post(discoverRoute, data.id)).status).toBe(status);
    oddAnswer = null;
    expect((await modelsOf(data.id)).find((m) => m.modelKey === 'campus-chat')?.isAvailable).toBe(true);
  });
});

describe('a cloud provider\'s new embedding model', () => {
  it('is added without a paid embedding call, and the admin is told to set its dimensions', async () => {
    gateway.models = [{ id: 'cloud-embed' }];
    const { data } = await createProvider({ providerKey: 'gw-cloud', providerType: 'cloud', connectionType: 'openai_compatible', authType: 'api_key', apiKey: 'gw-key', baseUrl: gatewayUrl });
    const result = (await (await post(discoverRoute, data.id)).json()).data;
    expect(result).toMatchObject({ modelsAdded: 1, needsSetup: ['cloud-embed: set its dimensions on the model'] });
    expect(gateway.seen.filter((x) => x.path === '/v1/embeddings')).toEqual([]);
  });
});

describe('a discovery where one model cannot be saved', () => {
  it('saves the others and answers both the model it could not save and the ones that need setup', async () => {
    const tooLong = `org/${'x'.repeat(120)}`; // longer than a model key can be
    gateway.models = [{ id: 'cloud-chat' }, { id: tooLong }, { id: 'cloud-embed-2' }];
    const { data } = await createProvider({ providerKey: 'gw-one-fails', providerType: 'cloud', connectionType: 'openai_compatible', authType: 'api_key', apiKey: 'gw-key', baseUrl: gatewayUrl });

    const result = (await (await post(discoverRoute, data.id)).json()).data;
    expect(result).toMatchObject({ success: false, modelsAdded: 2, needsSetup: ['cloud-embed-2: set its dimensions on the model'] });
    expect(result.errors).toEqual([expect.stringContaining(`Failed to process model ${tooLong}`)]);
  });
});

describe('an embedding model whose dimensions the service will not tell', () => {
  it('is added, and the admin is told to set its dimensions', async () => {
    gateway.models = [{ id: 'campus-embed' }];
    gateway.embeddings = false;
    const { data } = await createProvider({ providerKey: 'gw-dims', connectionType: 'openai_compatible', authType: 'api_key', apiKey: 'gw-key', baseUrl: gatewayUrl });
    const result = (await (await post(discoverRoute, data.id)).json()).data;
    expect(result).toMatchObject({ success: true, modelsAdded: 1, needsSetup: ['campus-embed: set its dimensions on the model'] });
  });
});

describe("an Ollama provider under its own name: connection test and discovery", () => {
  it('reads Ollama\'s installed models', async () => {
    ollama.tags = [{ name: 'qwen2.5:14b', details: { parameter_size: '14B', quantization_level: 'Q4', family: 'qwen2' } }];
    const { data } = await createProvider({ providerKey: 'lab-discover', connectionType: 'ollama', authType: 'none', baseUrl: ollamaUrl });
    expect((await (await post(testConnectionRoute, data.id)).json()).data).toMatchObject({ success: true });
    expect((await (await post(discoverRoute, data.id)).json()).data).toMatchObject({ modelsFound: 1, modelsAdded: 1 });
    // The connection test, then discovery: the list, and the model's details
    expect(ollama.seen.map((x) => x.path)).toEqual(['/api/tags', '/api/tags', '/api/show']);
    expect(ollama.seen.map((x) => x.auth)).toEqual([undefined, undefined, undefined]);
  });

  it('sends its API key, when it has one (an Ollama behind a proxy that checks keys)', async () => {
    ollama.tags = [{ name: 'qwen2.5:14b', details: { parameter_size: '14B', quantization_level: 'Q4', family: 'qwen2' } }];
    const { data } = await createProvider({ providerKey: 'lab-keyed', connectionType: 'ollama', authType: 'api_key', apiKey: 'ol-key', baseUrl: ollamaUrl });
    await post(testConnectionRoute, data.id);
    await post(discoverRoute, data.id);
    const model = (await modelsOf(data.id))[0];
    await generateText('Say hi', { providerId: data.id, modelId: model.id });

    expect(ollama.seen.map((x) => x.path)).toEqual(expect.arrayContaining(['/api/tags', '/api/generate']));
    expect(ollama.seen.every((x) => x.auth === 'Bearer ol-key')).toBe(true);
  });
});

describe("a provider's API key", () => {
  it('is kept when the provider is edited without typing it', async () => {
    const { data } = await createProvider({ providerKey: 'keep-key', connectionType: 'openai_compatible', authType: 'api_key', apiKey: 'gw-key', baseUrl: gatewayUrl });
    const { status, data: updated } = await updateProvider(data.id, { displayName: 'Renamed', apiKey: '' });
    expect(status).toBe(200);
    expect(updated.hasApiKey).toBe(true);
  });

  it('must be typed again when the base URL moves to another server, and is never sent there', async () => {
    const { data } = await createProvider({ providerKey: 'move-key', connectionType: 'openai_compatible', authType: 'api_key', apiKey: 'gw-key', baseUrl: gatewayUrl });
    const moved = await updateProvider(data.id, { baseUrl: `${ollamaUrl}/v1`, apiKey: '' });
    expect(moved.status).toBe(400);
    await post(testConnectionRoute, data.id);
    expect(ollama.seen).toEqual([]);
    expect((await updateProvider(data.id, { baseUrl: `${ollamaUrl}/v1`, apiKey: 'new-key' })).status).toBe(200);
  });

  it('can be added when an Ollama provider without authentication is edited into an OpenAI-compatible one, and is sent', async () => {
    const { data } = await createProvider({ providerKey: 'was-ollama', connectionType: 'ollama', authType: 'none', baseUrl: ollamaUrl });
    gateway.models = [{ id: 'campus-chat', object: 'model' }];

    // Everything the edit form sends
    const { status, data: updated } = await updateProvider(data.id, {
      providerKey: 'was-ollama', displayName: 'Campus gateway', description: '', providerType: 'local',
      connectionType: 'openai_compatible', authType: 'api_key', baseUrl: gatewayUrl, apiKey: 'gw-key', isEnabled: true,
    });
    expect(status).toBe(200);
    expect(updated).toMatchObject({ connectionType: 'openai_compatible', authType: 'api_key', hasApiKey: true });

    await post(discoverRoute, data.id);
    const model = (await modelsOf(data.id)).find((m) => m.modelKey === 'campus-chat');
    expect((await generateText('Say hi', { providerId: data.id, modelId: model!.id })).text).toBe('Hi from the gateway');
    expect(gateway.seen.at(-1)).toMatchObject({ path: '/v1/chat/completions', auth: 'Bearer gw-key' });
  });

  it('is removed when authentication is set to none, so no request carries it', async () => {
    const { data } = await createProvider({ providerKey: 'drop-key', connectionType: 'openai_compatible', authType: 'api_key', apiKey: 'gw-key', baseUrl: gatewayUrl });

    // Moving to another server at the same time needs no key: there is none to send
    const { status, data: updated } = await updateProvider(data.id, { authType: 'none', baseUrl: `${ollamaUrl}/v1`, apiKey: '' });
    expect(status).toBe(200);
    expect(updated).toMatchObject({ authType: 'none', hasApiKey: false });

    await post(testConnectionRoute, data.id);
    expect(ollama.seen.map((s) => s.path)).toEqual(['/v1/models']);
    expect(ollama.seen[0].auth).toBeUndefined();
  });

  it('can be left for later when authentication becomes API key: the connection test asks for it', async () => {
    const { data } = await createProvider({ providerKey: 'key-later', connectionType: 'ollama', authType: 'none', baseUrl: ollamaUrl });
    const { status, data: updated } = await updateProvider(data.id, { connectionType: 'openai_compatible', authType: 'api_key', baseUrl: gatewayUrl, apiKey: '' });
    expect(status).toBe(200);
    expect(updated).toMatchObject({ authType: 'api_key', hasApiKey: false });

    const test = (await (await post(testConnectionRoute, data.id)).json()).data;
    expect(test).toMatchObject({ success: false, message: expect.stringMatching(/API key is required/) });
    expect(gateway.seen).toEqual([]);
  });

  it('is not saved when one is typed with authentication set to none', async () => {
    const { data } = await createProvider({ providerKey: 'typed-none', connectionType: 'openai_compatible', authType: 'api_key', apiKey: 'gw-key', baseUrl: gatewayUrl });
    const { status, data: updated } = await updateProvider(data.id, { authType: 'none', apiKey: 'typed-key' });
    expect(status).toBe(200);
    expect(updated).toMatchObject({ authType: 'none', hasApiKey: false });
  });

  it('stays for a new path on the same server', async () => {
    const { data } = await createProvider({ providerKey: 'same-server', connectionType: 'openai_compatible', authType: 'api_key', apiKey: 'gw-key', baseUrl: gatewayUrl });
    const { status, data: updated } = await updateProvider(data.id, { baseUrl: gatewayUrl.replace(/\/v1$/, '/v2'), apiKey: '' });
    expect(status).toBe(200);
    expect(updated.hasApiKey).toBe(true);
  });
});

describe("a failing gateway's errors", () => {
  it("name the provider, not the API it speaks", async () => {
    const { providerId, modelId } = await gatewayWithModel('named-failure');
    gateway.answers = [{ status: 401 }];
    await expect(generateText('Say hi', { providerId, modelId })).rejects.toMatchObject({ providerKey: 'named-failure' });
  });
});

describe('Retry-After on a stream and on Ollama', () => {
  const read = async (stream: AsyncIterable<{ content: string }>) => { let text = ''; for await (const c of stream) text += c.content; return text; };

  it('a stream waits as long as the gateway asked before its retry', async () => {
    const { providerId, modelId } = await gatewayWithModel('stream-wait');
    gateway.seen = [];
    gateway.answers = [{ status: 429, retryAfter: '3' }];
    expect(await read(streamChat([{ role: 'user', content: 'Say hi' }], { providerId, modelId }))).toBe('Hi from the gateway');
    const [first, second] = gateway.seen.filter((x) => x.path === '/v1/chat/completions');
    expect(second.at - first.at).toBeGreaterThanOrEqual(2900);
  }, 20_000);

  it('a stream is not retried when the gateway asks for longer than the longest retry wait', async () => {
    const { providerId, modelId } = await gatewayWithModel('stream-busy');
    gateway.seen = [];
    gateway.answers = [{ status: 429, retryAfter: '120' }];
    await expect(read(streamChat([{ role: 'user', content: 'Say hi' }], { providerId, modelId }))).rejects.toThrow(/rate limited/);
    expect(gateway.seen.filter((x) => x.path === '/v1/chat/completions')).toHaveLength(1);
  });

  it('a stream waiting for its retry ends at once when the caller cancels, with no retry', async () => {
    const { providerId, modelId } = await gatewayWithModel('stream-cancel');
    gateway.seen = [];
    gateway.answers = [{ status: 429, retryAfter: '20' }];
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 300);
    const started = Date.now();
    expect(await read(streamChat([{ role: 'user', content: 'Say hi' }], { providerId, modelId, signal: controller.signal }))).toBe('');
    expect(Date.now() - started).toBeLessThan(5000);
    expect(gateway.seen.filter((x) => x.path === '/v1/chat/completions')).toHaveLength(1);
  }, 20_000);

  it('Ollama is tried again after the wait it asked for', async () => {
    const { data } = await createProvider({ providerKey: 'lab-busy', connectionType: 'ollama', authType: 'none', baseUrl: ollamaUrl });
    const model = (await testDb.db.execute(sql`INSERT INTO ai_provider_models (provider_id, model_key, display_name, model_type) VALUES (${data.id}, 'qwen2.5:14b', 'Qwen', 'chat') RETURNING id`)) as unknown as { rows: Array<{ id: number }> };
    ollama.answers = [{ status: 429, retryAfter: '3' }];
    expect((await generateText('Say hi', { providerId: data.id, modelId: model.rows[0].id })).text).toBe('Hi from Ollama');
    const [first, second] = ollama.seen.filter((x) => x.path === '/api/generate');
    expect(second.at - first.at).toBeGreaterThanOrEqual(2900);
  }, 20_000);
});

describe('the health check of providers under their own names', () => {
  it('asks each provider the way its connection type answers, with its key', async () => {
    ollama.tags = [];
    await createProvider({ providerKey: 'health-gw', connectionType: 'openai_compatible', authType: 'api_key', apiKey: 'gw-key', baseUrl: gatewayUrl });
    await createProvider({ providerKey: 'health-lab', connectionType: 'ollama', authType: 'api_key', apiKey: 'ol-key', baseUrl: ollamaUrl });
    // Named openai but on another server: that server is checked, not OpenAI's status page
    await createProvider({ providerKey: 'openai', connectionType: 'openai_compatible', authType: 'api_key', apiKey: 'gw-key', baseUrl: gatewayUrl });

    const health = await checkAIProvidersHealth();
    const byKey = Object.fromEntries((health.details!.providers as Array<{ key: string; healthy: boolean; endpointTested: string }>).map((p) => [p.key, p]));

    expect(byKey['health-gw']).toMatchObject({ healthy: true, endpointTested: `${gatewayUrl}/models` });
    expect(byKey['health-lab']).toMatchObject({ healthy: true, endpointTested: `${ollamaUrl}/api/tags` });
    expect(byKey.openai).toMatchObject({ healthy: true, endpointTested: `${gatewayUrl}/models` });
    // Other providers saved by earlier tests are checked too; these two carry their keys
    expect(gateway.seen.filter((x) => x.path === '/v1/models').some((x) => x.auth === 'Bearer gw-key')).toBe(true);
    expect(ollama.seen.filter((x) => x.path === '/api/tags').some((x) => x.auth === 'Bearer ol-key')).toBe(true);
  });
});

describe('a provider whose address redirects to another server', () => {
  const failureOf = async (route: { POST: unknown }, id: string) => (await (await post(route, id)).json());

  it.each([
    ['an OpenAI-compatible gateway', 'openai_compatible', '/v1'],
    ['an Ollama provider', 'ollama', ''],
  ])('fails the connection test for %s and sends nothing to the other server', async (_name, connectionType, path) => {
    const { data } = await createProvider({ providerKey: `redir-test-${connectionType}`, connectionType, authType: 'api_key', apiKey: 'provider-key', baseUrl: `${redirectorUrl}${path}` });
    const body = await failureOf(testConnectionRoute, data.id);
    // The refusal is the answer, though it is longer than the stored status holds
    expect(body.data).toMatchObject({ success: false, message: expect.stringMatching(/redirected to another server/) });
    const saved = (await (await providerRoute.GET(new NextRequest(`http://localhost/api/ai-providers/${data.id}`), idParams(data.id))).json()).data;
    expect(saved.lastConnectionStatus).toMatch(/^error: The server redirected to another server.{0,80}…$/);
    expect(redirectsMade).toBe(1);
    expect(catcherReached).toEqual([]);
  });

  it.each([
    ['an OpenAI-compatible gateway', 'openai_compatible', '/v1'],
    ['an Ollama provider', 'ollama', ''],
  ])('fails Discover Models for %s and sends nothing to the other server', async (_name, connectionType, path) => {
    const { data } = await createProvider({ providerKey: `redir-discover-${connectionType}`, connectionType, authType: 'api_key', apiKey: 'provider-key', baseUrl: `${redirectorUrl}${path}` });
    const res = await post(discoverRoute, data.id);
    // The admin is told the provider failed, and why: the server it redirected to
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ code: 'UPSTREAM_ERROR', details: { message: expect.stringMatching(/redirected to another server \(127\.0\.0\.1:\d+\)/) } });
    expect(redirectsMade).toBe(1);
    expect(catcherReached).toEqual([]);
    expect(await modelsOf(data.id)).toEqual([]);
  });

  it('does not send the embeddings dimension probe (its key and text) to another server', async () => {
    const { data } = await createProvider({ providerKey: 'redir-embed', connectionType: 'openai_compatible', authType: 'api_key', apiKey: 'provider-key', baseUrl: `${halfRedirectorUrl}/v1` });
    const result = (await (await post(discoverRoute, data.id)).json()).data;
    // The model is still added, its dimensions left for the admin to set
    expect(result).toMatchObject({ modelsAdded: 1, needsSetup: ['campus-embed: set its dimensions on the model'] });
    expect(redirectsMade).toBe(1);
    expect(catcherReached).toEqual([]);
  });

  it("does not send Ollama's model details request (with its key) to another server", async () => {
    const { data } = await createProvider({ providerKey: 'redir-show', connectionType: 'ollama', authType: 'api_key', apiKey: 'provider-key', baseUrl: halfRedirectorUrl });
    const result = (await (await post(discoverRoute, data.id)).json()).data;
    // The model is still added from the list, without the details
    expect(result).toMatchObject({ modelsAdded: 1 });
    expect(redirectsMade).toBe(1);
    expect(catcherReached).toEqual([]);
  });
});

describe('models discovery hid, and models an admin switched off (review 17 Nov)', () => {
  const listedOn = async (id: string) => Object.fromEntries((await modelsOf(id)).map((m) => [m.modelKey, m.isAvailable]));
  const switchModel = (modelId: number, isAvailable: boolean) =>
    modelRoute.PUT(new NextRequest(`http://localhost/api/ai-provider-models/${modelId}`, { method: 'PUT', body: JSON.stringify({ isAvailable }) }),
      { params: Promise.resolve({ id: String(modelId) }) });

  it('come back when the service lists them again, when discovery hid them', async () => {
    const { data } = await createProvider({ providerKey: 'gw-comeback', connectionType: 'openai_compatible', authType: 'api_key', apiKey: 'gw-key', baseUrl: gatewayUrl });
    gateway.models = [{ id: 'campus-chat' }, { id: 'campus-chat-2' }];
    await post(discoverRoute, data.id);
    gateway.models = [{ id: 'campus-chat' }];
    await post(discoverRoute, data.id);
    expect(await listedOn(data.id)).toMatchObject({ 'campus-chat-2': false });

    gateway.models = [{ id: 'campus-chat' }, { id: 'campus-chat-2' }];
    const result = (await (await post(discoverRoute, data.id)).json()).data;
    expect(await listedOn(data.id)).toMatchObject({ 'campus-chat': true, 'campus-chat-2': true });
    expect(result.leftOff).toEqual([]);
  });

  it('stay off when an admin switched them off, even after discovery had hidden them', async () => {
    const { data } = await createProvider({ providerKey: 'gw-admin-off', connectionType: 'openai_compatible', authType: 'api_key', apiKey: 'gw-key', baseUrl: gatewayUrl });
    gateway.models = [{ id: 'campus-chat' }, { id: 'campus-chat-2' }];
    await post(discoverRoute, data.id);
    gateway.models = [{ id: 'campus-chat' }];
    await post(discoverRoute, data.id);
    const hidden = (await modelsOf(data.id)).find((m) => m.modelKey === 'campus-chat-2')!;
    // The admin turns it on and off again by hand: now it is the admin's choice
    expect((await switchModel(hidden.id, true)).status).toBe(200);
    expect((await switchModel(hidden.id, false)).status).toBe(200);

    gateway.models = [{ id: 'campus-chat' }, { id: 'campus-chat-2' }];
    const result = (await (await post(discoverRoute, data.id)).json()).data;
    expect(await listedOn(data.id)).toMatchObject({ 'campus-chat-2': false });
    expect(result.leftOff).toEqual(['campus-chat-2']);
  });

  it('still come back after an edit that leaves them switched off (the form sends every field)', async () => {
    const { data } = await createProvider({ providerKey: 'gw-edit-hidden', connectionType: 'openai_compatible', authType: 'api_key', apiKey: 'gw-key', baseUrl: gatewayUrl });
    gateway.models = [{ id: 'campus-chat' }, { id: 'campus-chat-2' }];
    await post(discoverRoute, data.id);
    gateway.models = [{ id: 'campus-chat' }];
    await post(discoverRoute, data.id);
    const hidden = (await modelsOf(data.id)).find((m) => m.modelKey === 'campus-chat-2')!;
    const edit = await modelRoute.PUT(new NextRequest(`http://localhost/api/ai-provider-models/${hidden.id}`, { method: 'PUT', body: JSON.stringify({ displayName: 'Campus chat 2', isAvailable: false }) }),
      { params: Promise.resolve({ id: String(hidden.id) }) });
    expect(edit.status).toBe(200);

    gateway.models = [{ id: 'campus-chat' }, { id: 'campus-chat-2' }];
    await post(discoverRoute, data.id);
    expect(await listedOn(data.id)).toMatchObject({ 'campus-chat-2': true });
  });

  it('are not hidden when Ollama lists nothing (no model pulled yet)', async () => {
    ollama.tags = [{ name: 'qwen2.5:14b', details: { parameter_size: '14B', quantization_level: 'Q4', family: 'qwen2' } }];
    const { data } = await createProvider({ providerKey: 'lab-empty', connectionType: 'ollama', authType: 'none', baseUrl: ollamaUrl });
    await post(discoverRoute, data.id);
    ollama.tags = [];
    const result = (await (await post(discoverRoute, data.id)).json()).data;
    expect(result.modelsRemoved).toBe(0);
    expect(await listedOn(data.id)).toMatchObject({ 'qwen2.5:14b': true });
  });

  it('come back for Ollama once pulled again, when discovery hid them', async () => {
    ollama.tags = [{ name: 'qwen2.5:14b', details: { parameter_size: '14B', quantization_level: 'Q4', family: 'qwen2' } }, { name: 'llama3:8b', details: { parameter_size: '8B', quantization_level: 'Q4', family: 'llama' } }];
    const { data } = await createProvider({ providerKey: 'lab-repull', connectionType: 'ollama', authType: 'none', baseUrl: ollamaUrl });
    await post(discoverRoute, data.id);
    ollama.tags = [ollama.tags[0]];
    await post(discoverRoute, data.id);
    expect(await listedOn(data.id)).toMatchObject({ 'llama3:8b': false });
    ollama.tags = [{ name: 'qwen2.5:14b', details: { parameter_size: '14B', quantization_level: 'Q4', family: 'qwen2' } }, { name: 'llama3:8b', details: { parameter_size: '8B', quantization_level: 'Q4', family: 'llama' } }];
    await post(discoverRoute, data.id);
    expect(await listedOn(data.id)).toMatchObject({ 'llama3:8b': true });
  });
});

describe('Discover Models on a cloud provider (review 17 Nov)', () => {
  it("skips models that can't chat, and adds the rest switched off for the admin to choose", async () => {
    const { data } = await createProvider({ providerKey: 'gw-cloud-chat', providerType: 'cloud', connectionType: 'openai_compatible', authType: 'api_key', apiKey: 'gw-key', baseUrl: gatewayUrl });
    gateway.models = [{ id: 'babbage-002' }, { id: 'davinci-002' }, { id: 'gpt-3.5-turbo-instruct' }, { id: 'o1-pro' }, { id: 'computer-use-preview' }, { id: 'campus-chat' }];
    const result = (await (await post(discoverRoute, data.id)).json()).data;
    expect((await modelsOf(data.id)).map((m) => [m.modelKey, m.isAvailable])).toEqual([['campus-chat', false]]);
    expect(result.addedOff).toEqual(['campus-chat']);

    // Next run: still off, and named as switched off, not as the admin's choice
    const next = (await (await post(discoverRoute, data.id)).json()).data;
    expect(next).toMatchObject({ addedOff: [], leftOff: ['campus-chat'] });
  });

  it('adds new models switched on for a self-hosted (Local) provider', async () => {
    const { data } = await createProvider({ providerKey: 'gw-local-chat', connectionType: 'openai_compatible', authType: 'api_key', apiKey: 'gw-key', baseUrl: gatewayUrl });
    gateway.models = [{ id: 'campus-chat' }];
    const result = (await (await post(discoverRoute, data.id)).json()).data;
    expect((await modelsOf(data.id))[0].isAvailable).toBe(true);
    expect(result.addedOff).toEqual([]);
  });
});

describe('a new provider with authentication set to None (review 17 Nov)', () => {
  it('saves no key, even when one was typed', async () => {
    const { status, data } = await createProvider({ providerKey: 'none-typed', connectionType: 'ollama', authType: 'none', apiKey: 'typed-key', baseUrl: ollamaUrl });
    expect(status).toBe(201);
    expect(data.hasApiKey).toBe(false);
  });
});

describe('Discover Models when the provider refuses or is down (review 17 Nov)', () => {
  it('says the provider rejected the key, not a generic failure', async () => {
    const { data } = await createProvider({ providerKey: 'gw-bad-key', connectionType: 'openai_compatible', authType: 'api_key', apiKey: 'wrong-key', baseUrl: gatewayUrl });
    const res = await post(discoverRoute, data.id);
    const body = await res.json();
    expect(res.status).toBe(502);
    expect(body).toMatchObject({ code: 'UPSTREAM_AUTH', error: 'gw-bad-key rejected the credentials.' });
  });

  it("passes on the provider's own 'not found' as its error, not as a missing provider", async () => {
    const notFound = http.createServer((_req, res) => { res.writeHead(404, { 'content-type': 'application/json' }); res.end('{"error":{"message":"the requested resource was not found"}}'); });
    const url = await listen(notFound);
    try {
      const { data } = await createProvider({ providerKey: 'gw-wrong-path', connectionType: 'openai_compatible', authType: 'api_key', apiKey: 'gw-key', baseUrl: `${url}/v1` });
      const res = await post(discoverRoute, data.id);
      expect(res.status).not.toBe(404);
      expect((await res.json()).code).toMatch(/^UPSTREAM_/);
    } finally {
      notFound.close();
    }
  });

  it("says the provider couldn't be reached when nothing answers", async () => {
    const closed = http.createServer();
    const url = await listen(closed);
    closed.close();
    const { data } = await createProvider({ providerKey: 'gw-down', connectionType: 'openai_compatible', authType: 'api_key', apiKey: 'gw-key', baseUrl: `${url}/v1` });
    const res = await post(discoverRoute, data.id);
    const body = await res.json();
    expect(res.status).toBe(503);
    expect(body).toMatchObject({ code: 'UPSTREAM_UNAVAILABLE', error: "gw-down couldn't be reached." });
  });
});

describe("discovery reads what the provider says about each model, before guessing from its name", () => {
  const details = { parameter_size: '4B', quantization_level: 'Q4', family: 'x' };
  const byKey = async (id: string) => Object.fromEntries((await modelsOf(id)).map((m) => [m.modelKey, m]));

  it("Ollama: type from its capabilities, context and vector size from /api/show", async () => {
    ollama.tags = [
      { name: 'house-chat:4b', details, capabilities: ['completion', 'tools'] },
      { name: 'house-vectors:1b', details, capabilities: ['embedding'] },
      { name: 'house-router:4b', details, capabilities: ['decision'] },
      // An older Ollama says nothing: the name still decides
      { name: 'nomic-embed-text:v1.5', details },
    ];
    ollama.show = {
      'house-chat:4b': { 'general.architecture': 'qwen2', 'qwen2.context_length': 32768, 'qwen2.embedding_length': 5120 },
      // A vision tower has its own embedding length: the model's own one is read
      'house-vectors:1b': { 'general.architecture': 'gemma3', 'gemma3.vision.embedding_length': 1152, 'gemma3.embedding_length': 768, 'gemma3.context_length': 2048 },
    };
    const { data } = await createProvider({ providerKey: 'lab-caps', connectionType: 'ollama', authType: 'none', baseUrl: ollamaUrl });
    await post(discoverRoute, data.id);
    const saved = await byKey(data.id);

    expect(Object.keys(saved).sort()).toEqual(['house-chat:4b', 'house-vectors:1b', 'nomic-embed-text:v1.5']);
    expect(saved['house-chat:4b']).toMatchObject({ modelType: 'chat', capabilities: expect.objectContaining({ contextWindow: 32768 }) });
    expect(saved['house-vectors:1b']).toMatchObject({ modelType: 'embedding', dimensions: 768 });
    expect(saved['nomic-embed-text:v1.5']).toMatchObject({ modelType: 'embedding', dimensions: 768 });
    // No embedding request was needed to learn a size
    expect(ollama.seen.some((x) => x.path.startsWith('/api/embed'))).toBe(false);
  });

  it('Ollama before capabilities were in its list: type from /api/show', async () => {
    ollama.tags = [{ name: 'house-vectors:1b', details }, { name: 'house-router:4b', details }];
    ollama.show = {
      'house-vectors:1b': { capabilities: ['embedding'], 'general.architecture': 'bert', 'bert.embedding_length': 384 },
      'house-router:4b': { capabilities: ['decision'] },
    };
    const { data } = await createProvider({ providerKey: 'lab-show-caps', connectionType: 'ollama', authType: 'none', baseUrl: ollamaUrl });
    await post(discoverRoute, data.id);
    const saved = await byKey(data.id);
    expect(Object.keys(saved)).toEqual(['house-vectors:1b']);
    expect(saved['house-vectors:1b']).toMatchObject({ modelType: 'embedding', dimensions: 384 });
  });

  it('OpenAI-compatible: type from the capabilities or output modalities the list carries', async () => {
    gateway.embeddings = false; // a size probe would fail: the list itself must decide the type
    gateway.models = [
      { id: 'house-vectors', capabilities: { embeddings: true } },
      { id: 'house-chat', capabilities: { embeddings: false, tools: true } },
      { id: 'ft-legacy', capabilities: { chat_completion: false, completion: true, embeddings: false } },
      { id: 'router/vectors-small', output_modalities: ['embeddings'] },
      { id: 'router/painter', output_modalities: ['image'] },
      { id: 'router/writer', output_modalities: ['text'], context_length: 65536 },
      { id: 'o3-pro' },
    ];
    const { data } = await createProvider({ providerKey: 'gw-caps', connectionType: 'openai_compatible', authType: 'api_key', apiKey: 'gw-key', baseUrl: gatewayUrl });
    await post(discoverRoute, data.id);
    const saved = await byKey(data.id);

    expect(Object.keys(saved).sort()).toEqual(['house-chat', 'house-vectors', 'router/vectors-small', 'router/writer']);
    expect(saved['house-vectors'].modelType).toBe('embedding');
    expect(saved['router/vectors-small'].modelType).toBe('embedding');
    expect(saved['house-chat'].modelType).toBe('chat');
    expect(saved['router/writer']).toMatchObject({ modelType: 'chat', capabilities: expect.objectContaining({ contextWindow: 65536 }) });
  });
});
