// src/features/ai-providers/ai-providers.vault-key.integration.test.ts

/**
 * An AI provider's API key lives in the Secrets Vault; the provider names the secret. Every
 * request that carries the key reads it from the vault at that moment: the AI service (text,
 * chat, stream, embeddings), Test Connection, Discover Models and the health check. A secret
 * that is gone or can't be decrypted is named to the admin, and the provider isn't called.
 * Real routes, services and repositories on an in-memory Postgres (PGlite); two local HTTP
 * servers stand in for an OpenAI-compatible gateway and for Ollama.
 */

import http from 'node:http';
import type { AddressInfo } from 'node:net';

import { sql } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';


let testDb: AppTestDb;
vi.mock('@/db/index', () => ({ get db() { return testDb.db; } }));
vi.mock('@/features/auth/auth.api.handlers', async () => (await import('@/shared/test/access-stub')).signedInAuth);
vi.mock('@/features/access/access.service', async () => (await import('@/shared/test/access-stub')).accessService);
vi.mock('@/features/ai-service/ai-service.analytics', () => ({ trackUsage: vi.fn(), updateRealtimeMetrics: vi.fn() }));

import * as discoverRoute from '@/app/api/ai-providers/[id]/discover-models/route';
import * as testConnectionRoute from '@/app/api/ai-providers/[id]/test-connection/route';
import { generateEmbeddings, generateText, streamChat } from '@/features/ai-service/ai-service.service';
import { checkAIProvidersHealth } from '@/features/health/health.service';
import { createSecret } from '@/features/secrets/secrets.service';
import { createAppTestDb, type AppTestDb } from '@/shared/test/app-test-db';

// ── Stand-ins ────────────────────────────────────────────────────────────────

const KEY = 'b'.repeat(64);
type Seen = { path: string; auth?: string };
const gateway = { seen: [] as Seen[] };
const ollama = { seen: [] as Seen[] };
let gatewayServer: http.Server;
let ollamaServer: http.Server;
let gatewayUrl = '';
let ollamaUrl = '';

const listen = (server: http.Server) => new Promise<string>((resolve) =>
  server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`)));

beforeAll(async () => {
  vi.stubEnv('SECRETS_ENCRYPTION_KEY', KEY);
  testDb = await createAppTestDb();
  gatewayServer = http.createServer((req, res) => {
    gateway.seen.push({ path: req.url ?? '', auth: req.headers.authorization });
    if (req.headers.authorization !== 'Bearer vault-key') { res.writeHead(401); return res.end('{"error":{"message":"bad key"}}'); }
    if (req.url === '/v1/models') return res.end(JSON.stringify({ object: 'list', data: [{ id: 'campus-chat', object: 'model' }, { id: 'campus-embed', object: 'model' }] }));
    if (req.url === '/v1/embeddings') return res.end(JSON.stringify({ data: [{ embedding: [0.1, 0.2, 0.3, 0.4] }], usage: { prompt_tokens: 1, total_tokens: 1 } }));
    if (req.url === '/v1/chat/completions') {
      let raw = '';
      req.on('data', (c) => { raw += c; });
      req.on('end', () => {
        if (JSON.parse(raw || '{}').stream) {
          return res.end('data: {"choices":[{"delta":{"content":"Hi from the gateway"},"finish_reason":"stop"}],"usage":{"prompt_tokens":1,"completion_tokens":1,"total_tokens":2}}\n\ndata: [DONE]\n\n');
        }
        res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'Hi from the gateway' }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }));
      });
      return;
    }
    res.writeHead(404); res.end();
  });
  ollamaServer = http.createServer((req, res) => {
    ollama.seen.push({ path: req.url ?? '', auth: req.headers.authorization });
    if (req.headers.authorization !== 'Bearer vault-key') { res.writeHead(401); return res.end('{"error":"unauthorized"}'); }
    if (req.url === '/api/tags') return res.end(JSON.stringify({ models: [{ name: 'campus-chat:latest', details: { family: 'llama' }, capabilities: ['completion'] }] }));
    if (req.url === '/api/show') return res.end(JSON.stringify({ model_info: { 'llama.context_length': 8192 }, capabilities: ['completion'] }));
    res.writeHead(404); res.end();
  });
  gatewayUrl = `${await listen(gatewayServer)}/v1`;
  ollamaUrl = await listen(ollamaServer);
}, 60_000);

afterAll(async () => { gatewayServer.close(); ollamaServer.close(); await testDb.close(); });
beforeEach(() => { gateway.seen = []; ollama.seen = []; });
afterEach(() => { vi.stubEnv('SECRETS_ENCRYPTION_KEY', KEY); });

// ── Helpers ──────────────────────────────────────────────────────────────────

let n = 0;
const idParams = (id: string) => ({ params: Promise.resolve({ id }) });
const post = (route: { POST: unknown }, id: string) =>
  (route.POST as (r: NextRequest, c: unknown) => Promise<Response>)(new NextRequest(`http://localhost/api/ai-providers/${id}/x`, { method: 'POST' }), idParams(id));

/** A provider whose key is the named vault secret, with one chat and one embedding model */
async function providerWithSecret(secret: string | null, options: { connectionType?: 'openai_compatible' | 'ollama'; apiKey?: string } = {}) {
  const key = `vault-provider-${++n}`;
  const connectionType = options.connectionType ?? 'openai_compatible';
  const baseUrl = connectionType === 'ollama' ? ollamaUrl : gatewayUrl;
  const row = (await testDb.db.execute(sql`INSERT INTO ai_providers (provider_key, display_name, provider_type, connection_type, auth_type, base_url, api_key, api_key_secret, is_enabled)
    VALUES (${key}, ${`Campus gateway ${n}`}, 'local', ${connectionType}, 'api_key', ${baseUrl}, ${options.apiKey ?? null}, ${secret}, true) RETURNING id`)).rows[0] as { id: string };
  const chat = (await testDb.db.execute(sql`INSERT INTO ai_provider_models (provider_id, model_key, display_name, model_type, is_available)
    VALUES (${row.id}, 'campus-chat', 'Campus chat', 'chat', true) RETURNING id`)).rows[0] as { id: number };
  const embed = (await testDb.db.execute(sql`INSERT INTO ai_provider_models (provider_id, model_key, display_name, model_type, is_available, dimensions)
    VALUES (${row.id}, 'campus-embed', 'Campus embed', 'embedding', true, 4) RETURNING id`)).rows[0] as { id: number };
  return { providerId: row.id, providerKey: key, chatModelId: chat.id, embedModelId: embed.id };
}
const read = async (stream: AsyncIterable<{ content: string }>) => { let text = ''; for await (const c of stream) text += c.content; return text; };
const healthOf = async (providerKey: string) =>
  ((await checkAIProvidersHealth()).details!.providers as Array<{ key: string; healthy: boolean; message: string }>).find((p) => p.key === providerKey);

// ── Tests ────────────────────────────────────────────────────────────────────

describe('a provider whose API key is a vault secret', () => {
  it('sends the secret\'s value on every kind of request', async () => {
    await createSecret({ name: `campus_key_${n + 1}`, value: 'vault-key' });
    const p = await providerWithSecret(`campus_key_${n + 1}`);

    expect((await generateText('Say hi', { providerId: p.providerId, modelId: p.chatModelId })).text).toBe('Hi from the gateway');
    expect(await read(streamChat([{ role: 'user', content: 'Say hi' }], { providerId: p.providerId, modelId: p.chatModelId }))).toBe('Hi from the gateway');
    await generateEmbeddings(['a text'], { providerId: p.providerId, modelId: p.embedModelId, feature: 'search_query' });
    expect((await (await post(testConnectionRoute, p.providerId)).json()).data).toMatchObject({ success: true });
    expect((await post(discoverRoute, p.providerId)).status).toBe(200);
    expect(await healthOf(p.providerKey)).toMatchObject({ healthy: true });

    expect(gateway.seen.length).toBeGreaterThanOrEqual(6);
    expect(gateway.seen.every((r) => r.auth === 'Bearer vault-key')).toBe(true);
  });

  it('sends it to Ollama behind a proxy that checks keys: Test Connection and Discover Models (model details too)', async () => {
    await createSecret({ name: `ollama_key_${n + 1}`, value: 'vault-key' });
    const p = await providerWithSecret(`ollama_key_${n + 1}`, { connectionType: 'ollama' });

    expect((await (await post(testConnectionRoute, p.providerId)).json()).data).toMatchObject({ success: true });
    expect((await post(discoverRoute, p.providerId)).status).toBe(200);
    expect(ollama.seen.map((r) => r.path)).toEqual(expect.arrayContaining(['/api/tags', '/api/show']));
    expect(ollama.seen.every((r) => r.auth === 'Bearer vault-key')).toBe(true);
  });

  it('uses a key saved on the provider before keys moved to the vault, until startup moves it', async () => {
    const p = await providerWithSecret(null, { apiKey: 'vault-key' });
    expect((await generateText('Say hi', { providerId: p.providerId, modelId: p.chatModelId })).text).toBe('Hi from the gateway');
    expect(gateway.seen.at(-1)).toMatchObject({ auth: 'Bearer vault-key' });
  });

  it('reads the secret at each request: a new value in the vault is sent on the next one', async () => {
    const name = `rotated_key_${n + 1}`;
    await createSecret({ name, value: 'old-key' });
    const p = await providerWithSecret(name);
    await expect(generateText('Say hi', { providerId: p.providerId, modelId: p.chatModelId })).rejects.toThrow();
    expect(gateway.seen.at(-1)).toMatchObject({ auth: 'Bearer old-key' });

    const { updateSecret, listSecrets } = await import('@/features/secrets/secrets.service');
    const [secret] = await listSecrets(name);
    await updateSecret(secret.id, { value: 'vault-key' });
    expect((await generateText('Say hi', { providerId: p.providerId, modelId: p.chatModelId })).text).toBe('Hi from the gateway');
  });
});

describe.each([
  ['is gone from the vault', 'missing', "which doesn't exist"],
  ['can\'t be decrypted (the encryption key changed)', 'unreadable', "can't be decrypted with this server's encryption key"],
] as const)('a provider whose key secret %s', (_label, kind, says) => {
  async function brokenProvider() {
    const name = `broken_key_${n + 1}`;
    if (kind === 'unreadable') {
      vi.stubEnv('SECRETS_ENCRYPTION_KEY', 'c'.repeat(64));
      await createSecret({ name, value: 'vault-key' });
      vi.stubEnv('SECRETS_ENCRYPTION_KEY', KEY);
    }
    return providerWithSecret(name);
  }

  it('names the secret and what to do on every path an admin sees, and calls nothing', async () => {
    const p = await brokenProvider();
    const message = expect.stringMatching(new RegExp(`"Campus gateway \\d+".*"broken_key_\\d+".*${says.replace(/[()]/g, '\\$&')}`));

    await expect(generateText('Say hi', { providerId: p.providerId, modelId: p.chatModelId })).rejects.toMatchObject({ code: 'PROVIDER_KEY_UNAVAILABLE', message });
    await expect(read(streamChat([{ role: 'user', content: 'Say hi' }], { providerId: p.providerId, modelId: p.chatModelId }))).rejects.toMatchObject({ code: 'PROVIDER_KEY_UNAVAILABLE' });
    await expect(generateEmbeddings(['a text'], { providerId: p.providerId, modelId: p.embedModelId, feature: 'search_query' })).rejects.toMatchObject({ code: 'PROVIDER_KEY_UNAVAILABLE' });

    expect((await (await post(testConnectionRoute, p.providerId)).json()).data).toMatchObject({ success: false, message });
    const status = (await testDb.db.execute(sql`SELECT last_connection_status FROM ai_providers WHERE id = ${p.providerId}`)).rows[0] as { last_connection_status: string };
    expect(status.last_connection_status).toMatch(/^error: /);

    const discovery = await post(discoverRoute, p.providerId);
    expect(discovery.status).toBe(400);
    expect(await discovery.json()).toMatchObject({ code: 'PROVIDER_KEY_UNAVAILABLE', message });

    expect(gateway.seen).toEqual([]);
  });

  it('shows on the health check, without the secret\'s name or the encryption key (every signed-in user sees health)', async () => {
    const p = await brokenProvider();
    const health = await healthOf(p.providerKey);
    expect(health).toMatchObject({ healthy: false, message: 'API key unavailable: see the AI Providers page' });
    expect(JSON.stringify(health)).not.toMatch(/broken_key|SECRETS_ENCRYPTION_KEY/);
    // Not called for it (the gateway answers other tests' providers here)
    expect(health).toMatchObject({ responseTimeMs: 0 });
  });
});
