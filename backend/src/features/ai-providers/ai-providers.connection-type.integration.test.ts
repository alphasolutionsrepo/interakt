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
import * as providerRoute from '@/app/api/ai-providers/[id]/route';
import * as testConnectionRoute from '@/app/api/ai-providers/[id]/test-connection/route';
import * as providersRoute from '@/app/api/ai-providers/route';
import { generateText } from '@/features/ai-service/ai-service.service';
import { createAppTestDb, type AppTestDb } from '@/shared/test/app-test-db';

// ── Stand-ins ────────────────────────────────────────────────────────────────

type Seen = { at: number; path: string; auth?: string };
const gateway = {
  seen: [] as Seen[],
  models: [] as Array<Record<string, unknown>>,
  /** Answers to /v1/chat/completions, in order; empty means a normal answer */
  answers: [] as Array<{ status: number; retryAfter?: string }>,
};
const ollama = { seen: [] as Seen[] };
let gatewayUrl = '';
let ollamaUrl = '';
let gatewayServer: http.Server;
let ollamaServer: http.Server;

const chatAnswer = JSON.stringify({
  choices: [{ message: { role: 'assistant', content: 'Hi from the gateway' }, finish_reason: 'stop' }],
  usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
});

const listen = (server: http.Server) => new Promise<string>((resolve) =>
  server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`)));

beforeAll(async () => {
  testDb = await createAppTestDb();
  gatewayServer = http.createServer((req, res) => {
    gateway.seen.push({ at: Date.now(), path: req.url ?? '', auth: req.headers.authorization });
    if (req.headers.authorization !== 'Bearer gw-key') { res.writeHead(401); return res.end('{"error":{"message":"bad key"}}'); }
    if (req.url === '/v1/models') return res.end(JSON.stringify({ object: 'list', data: gateway.models }));
    if (req.url === '/v1/chat/completions') {
      const next = gateway.answers.shift();
      if (next && next.status !== 200) {
        res.writeHead(next.status, next.retryAfter ? { 'retry-after': next.retryAfter } : {});
        return res.end('{"error":{"message":"rate limited"}}');
      }
      return res.end(chatAnswer);
    }
    res.writeHead(404); res.end();
  });
  ollamaServer = http.createServer((req, res) => {
    ollama.seen.push({ at: Date.now(), path: req.url ?? '' });
    if (req.url === '/api/generate') return res.end('{"response":"Hi from Ollama","done":true,"prompt_eval_count":1,"eval_count":1}');
    if (req.url === '/api/tags') return res.end(JSON.stringify({ models: [] }));
    res.writeHead(404); res.end();
  });
  gatewayUrl = `${await listen(gatewayServer)}/v1`;
  ollamaUrl = await listen(ollamaServer);
}, 60_000);

afterAll(async () => { gatewayServer.close(); ollamaServer.close(); await testDb.close(); });
beforeEach(() => { gateway.seen = []; gateway.answers = []; ollama.seen = []; });

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
    expect(Object.fromEntries(models.map((m: { modelKey: string; modelType: string; capabilities: Record<string, unknown> }) =>
      [m.modelKey, { type: m.modelType, contextWindow: m.capabilities.contextWindow }]))).toEqual({
      'campus-chat': { type: 'chat', contextWindow: 32768 },
      'campus-embed': { type: 'embedding', contextWindow: undefined },
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
      (await import('drizzle-orm')).sql`INSERT INTO ai_provider_models (provider_id, model_key, display_name, model_type) VALUES (${data.id}, 'qwen3.5:9b', 'Qwen', 'chat') RETURNING id`,
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
