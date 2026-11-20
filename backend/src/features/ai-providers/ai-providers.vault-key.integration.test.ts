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
import * as providerRoute from '@/app/api/ai-providers/[id]/route';
import * as testConnectionRoute from '@/app/api/ai-providers/[id]/test-connection/route';
import * as providersRoute from '@/app/api/ai-providers/route';
import { ADMIN_ROLE_ID, ALL_PERMISSIONS } from '@/features/access/permissions';
import { generateEmbeddings, generateText, streamChat } from '@/features/ai-service/ai-service.service';
import { moveProviderKeysToVault } from '@/features/ai-providers/provider-key-migration';
import { checkAIProvidersHealth } from '@/features/health/health.service';
import { decrypt } from '@/features/secrets/secrets.encryption';
import * as secretsRepository from '@/features/secrets/secrets.repository';
import { createSecret } from '@/features/secrets/secrets.service';
import { accessStub } from '@/shared/test/access-stub';
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
afterEach(() => { vi.stubEnv('SECRETS_ENCRYPTION_KEY', KEY); accessStub.reset(); });

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
    // A new embedding model (not saved yet) is what discovery probes
    await testDb.db.execute(sql`DELETE FROM ai_provider_models WHERE provider_id = ${p.providerId} AND model_key = 'campus-embed'`);
    const beforeDiscovery = gateway.seen.length;
    expect((await post(discoverRoute, p.providerId)).status).toBe(200);
    // Discovery asks a local provider's new embedding model for its vector size, with the key
    expect(gateway.seen.slice(beforeDiscovery).map((r) => r.path)).toEqual(expect.arrayContaining(['/v1/models', '/v1/embeddings']));
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
  ['is gone from the vault', 'missing', /which doesn't exist/],
  ['can\'t be decrypted (the encryption key changed)', 'unreadable', /can't be decrypted with this server's encryption key/],
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
    const message = expect.stringMatching(new RegExp(`"Campus gateway \\d+".*"broken_key_\\d+".*${says.source}`));

    await expect(generateText('Say hi', { providerId: p.providerId, modelId: p.chatModelId })).rejects.toMatchObject({ code: 'PROVIDER_KEY_UNAVAILABLE', message });
    await expect(read(streamChat([{ role: 'user', content: 'Say hi' }], { providerId: p.providerId, modelId: p.chatModelId }))).rejects.toMatchObject({ code: 'PROVIDER_KEY_UNAVAILABLE' });
    await expect(generateEmbeddings(['a text'], { providerId: p.providerId, modelId: p.embedModelId, feature: 'search_query' })).rejects.toMatchObject({ code: 'PROVIDER_KEY_UNAVAILABLE' });

    expect((await (await post(testConnectionRoute, p.providerId)).json()).data).toMatchObject({ success: false, message });
    const status = (await testDb.db.execute(sql`SELECT last_connection_status FROM ai_providers WHERE id = ${p.providerId}`)).rows[0] as { last_connection_status: string };
    // Every role that reads providers sees the stored status: it names nothing
    expect(status.last_connection_status).toBe('error: API key unavailable');

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

// ── Saving ───────────────────────────────────────────────────────────────────

describe('saving a provider\'s key', () => {
  const create = async (body: Record<string, unknown>) => {
    const res = await providersRoute.POST(new NextRequest('http://localhost/api/ai-providers', {
      method: 'POST',
      body: JSON.stringify({ displayName: `Saved ${++n}`, providerType: 'local', connectionType: 'openai_compatible', authType: 'api_key', baseUrl: gatewayUrl, isEnabled: true, ...body }),
    }));
    return { status: res.status, body: await res.json() };
  };
  const update = async (id: string, body: Record<string, unknown>) => {
    const res = await providerRoute.PUT(new NextRequest(`http://localhost/api/ai-providers/${id}`, { method: 'PUT', body: JSON.stringify(body) }), idParams(id));
    return { status: res.status, body: await res.json() };
  };
  const remove = async (id: string) =>
    (await providerRoute.DELETE(new NextRequest(`http://localhost/api/ai-providers/${id}`, { method: 'DELETE' }), idParams(id))).status;
  const row = async (id: string) =>
    (await testDb.db.execute(sql`SELECT api_key, api_key_secret, api_key_secret_managed FROM ai_providers WHERE id = ${id}`)).rows[0] as { api_key: string | null; api_key_secret: string | null; api_key_secret_managed: boolean } | undefined;
  const secretValue = async (name: string) => {
    const found = (await testDb.db.execute(sql`SELECT encrypted_value FROM secrets WHERE name = ${name}`)).rows[0] as { encrypted_value: string } | undefined;
    return found ? decrypt(found.encrypted_value) : undefined;
  };
  const chatModel = async (providerId: string) => ((await testDb.db.execute(sql`INSERT INTO ai_provider_models (provider_id, model_key, display_name, model_type, is_available)
    VALUES (${providerId}, 'campus-chat', 'Campus chat', 'chat', true) RETURNING id`)).rows[0] as { id: number }).id;

  it('stores a typed key in the vault as ai_provider_<key>, keeps only its name on the provider, and sends it', async () => {
    const { status, body } = await create({ providerKey: 'campus-gw-a', apiKey: 'vault-key' });
    expect(status).toBe(201);
    expect(body.data).toMatchObject({ hasApiKey: true, apiKeySecret: 'ai_provider_campus_gw_a', apiKeySecretManaged: true });
    expect(JSON.stringify(body)).not.toContain('vault-key');
    expect(await row(body.data.id)).toEqual({ api_key: null, api_key_secret: 'ai_provider_campus_gw_a', api_key_secret_managed: true });
    expect(await secretValue('ai_provider_campus_gw_a')).toBe('vault-key');

    const list = JSON.stringify(await (await providersRoute.GET(new NextRequest('http://localhost/api/ai-providers'))).json());
    expect(list).toContain('ai_provider_campus_gw_a');
    expect(list).not.toContain('vault-key');

    await generateText('Say hi', { providerId: body.data.id, modelId: await chatModel(body.data.id) });
    expect(gateway.seen.at(-1)).toMatchObject({ path: '/v1/chat/completions', auth: 'Bearer vault-key' });
  });

  it('takes the next free name when the vault already has one by that name, and leaves that secret alone', async () => {
    await createSecret({ name: 'ai_provider_campus_gw_b', value: 'someone-elses' });
    const { body } = await create({ providerKey: 'campus-gw-b', apiKey: 'vault-key' });
    expect(body.data.apiKeySecret).toBe('ai_provider_campus_gw_b_2');
    expect(await secretValue('ai_provider_campus_gw_b')).toBe('someone-elses');
    expect(await secretValue('ai_provider_campus_gw_b_2')).toBe('vault-key');
  });

  it('replaces the value of the provider\'s own secret when a new key is typed, without making another', async () => {
    const { body } = await create({ providerKey: 'campus-gw-c', apiKey: 'first-key' });
    const before = (await testDb.db.execute(sql`SELECT count(*)::int AS n FROM secrets`)).rows[0] as { n: number };
    const updated = await update(body.data.id, { apiKey: 'vault-key' });
    expect(updated.body.data).toMatchObject({ apiKeySecret: 'ai_provider_campus_gw_c', apiKeySecretManaged: true });
    expect(await secretValue('ai_provider_campus_gw_c')).toBe('vault-key');
    expect((await testDb.db.execute(sql`SELECT count(*)::int AS n FROM secrets`)).rows[0]).toEqual(before);
  });

  it('leaves the provider\'s own secret alone when another provider chose it, and puts a typed key in a new secret of its own', async () => {
    const owner = (await create({ providerKey: 'campus-gw-sh', apiKey: 'vault-key' })).body.data;
    const other = (await create({ providerKey: 'campus-gw-sh2', apiKeySecret: 'ai_provider_campus_gw_sh' })).body.data;

    const updated = await update(owner.id, { apiKey: 'new-key' });
    expect(updated.body.data).toMatchObject({ apiKeySecret: 'ai_provider_campus_gw_sh_2', apiKeySecretManaged: true });
    expect(await secretValue('ai_provider_campus_gw_sh')).toBe('vault-key');
    expect(await secretValue('ai_provider_campus_gw_sh_2')).toBe('new-key');
    expect(await row(other.id)).toMatchObject({ api_key_secret: 'ai_provider_campus_gw_sh', api_key_secret_managed: false });

    // The provider that chose it still reads the old value, and deleting the owner takes only its new secret
    await generateText('Say hi', { providerId: other.id, modelId: await chatModel(other.id) });
    expect(gateway.seen.at(-1)?.auth).toBe('Bearer vault-key');
    expect(await remove(owner.id)).toBe(200);
    expect(await secretValue('ai_provider_campus_gw_sh_2')).toBeUndefined();
    expect(await secretValue('ai_provider_campus_gw_sh')).toBe('vault-key');
  });

  it('leaves the provider\'s own secret alone when an MCP connection uses it', async () => {
    const owner = (await create({ providerKey: 'campus-gw-mcp', apiKey: 'first-key' })).body.data;
    await testDb.db.execute(sql`INSERT INTO mcp_connections (name, slug, server_url, auth_config)
      VALUES ('Remote', 'remote-vault-test', 'http://127.0.0.1:9/mcp', ${JSON.stringify({ type: 'bearer', secretRef: 'ai_provider_campus_gw_mcp' })}::jsonb)`);

    const updated = await update(owner.id, { apiKey: 'vault-key' });
    expect(updated.body.data.apiKeySecret).toBe('ai_provider_campus_gw_mcp_2');
    expect(await secretValue('ai_provider_campus_gw_mcp')).toBe('first-key');
    expect(await secretValue('ai_provider_campus_gw_mcp_2')).toBe('vault-key');
  });

  it('saves nothing when the lookup of what uses the own secret fails', async () => {
    const owner = (await create({ providerKey: 'campus-gw-lk', apiKey: 'first-key' })).body.data;
    const lookup = vi.spyOn(secretsRepository, 'findSecretReferences').mockRejectedValueOnce(new Error('lookup down'));
    const failed = await update(owner.id, { apiKey: 'vault-key' });
    lookup.mockRestore();
    expect(failed.status).toBeGreaterThanOrEqual(500);
    expect(await secretValue('ai_provider_campus_gw_lk')).toBe('first-key');
    expect(await row(owner.id)).toMatchObject({ api_key_secret: 'ai_provider_campus_gw_lk' });
  });

  it('keeps the key when the form sends an empty one, and on edits that leave it out', async () => {
    const { body } = await create({ providerKey: 'campus-gw-d', apiKey: 'vault-key' });
    await update(body.data.id, { apiKey: '', displayName: 'Renamed' });
    await update(body.data.id, { isEnabled: false });
    expect(await row(body.data.id)).toMatchObject({ api_key_secret: 'ai_provider_campus_gw_d', api_key_secret_managed: true });
    expect(await secretValue('ai_provider_campus_gw_d')).toBe('vault-key');
  });

  it('uses a chosen vault secret, and never deletes it; choosing one drops the provider\'s own secret when unused', async () => {
    await createSecret({ name: 'shared_gateway_key', value: 'vault-key' });
    const { body } = await create({ providerKey: 'campus-gw-e', apiKey: 'own-key' });
    expect(await secretValue('ai_provider_campus_gw_e')).toBe('own-key');

    const chosen = await update(body.data.id, { apiKeySecret: 'shared_gateway_key' });
    expect(chosen.body.data).toMatchObject({ hasApiKey: true, apiKeySecret: 'shared_gateway_key', apiKeySecretManaged: false });
    expect(await secretValue('ai_provider_campus_gw_e')).toBeUndefined();

    expect(await remove(body.data.id)).toBe(200);
    expect(await secretValue('shared_gateway_key')).toBe('vault-key');
  });

  it('keeps the provider\'s own secret its own when that secret is chosen again, so it still goes with the provider', async () => {
    const { body } = await create({ providerKey: 'campus-gw-own', apiKey: 'vault-key' });
    const again = await update(body.data.id, { baseUrl: 'https://elsewhere.example/v1', apiKeySecret: 'ai_provider_campus_gw_own' });
    expect(again.body.data).toMatchObject({ apiKeySecret: 'ai_provider_campus_gw_own', apiKeySecretManaged: true });
    expect(await remove(body.data.id)).toBe(200);
    expect(await secretValue('ai_provider_campus_gw_own')).toBeUndefined();
  });

  it('names the key\'s secret only to roles that view providers, not to those that only pick models', async () => {
    const { body } = await create({ providerKey: 'campus-gw-readers', apiKey: 'vault-key' });
    const listed = async () => ((await (await providersRoute.GET(new NextRequest('http://localhost/api/ai-providers'))).json()).data as Array<Record<string, unknown>>)
      .find((p) => p.id === body.data.id)!;
    expect((await listed()).apiKeySecret).toBe('ai_provider_campus_gw_readers');

    accessStub.access = {
      userId: 'picker', roleId: 'model-pickers', roleName: 'Model pickers', isAdmin: false,
      permissions: new Set(['playground:use'] as const),
    };
    const forPicker = await listed();
    expect(forPicker).toMatchObject({ hasApiKey: true });
    expect(forPicker).not.toHaveProperty('apiKeySecret');
    expect(JSON.stringify(forPicker)).not.toContain('ai_provider_campus_gw_readers');
  });

  it('refuses a secret the vault doesn\'t have, and a key and a secret together, saving nothing', async () => {
    const missing = await create({ providerKey: 'campus-gw-f', apiKeySecret: 'no_such_secret' });
    expect(missing.status).toBe(400);
    expect(missing.body).toMatchObject({ code: 'VALIDATION_ERROR', fields: [expect.objectContaining({ field: 'apiKeySecret' })] });
    const both = await create({ providerKey: 'campus-gw-f', apiKey: 'vault-key', apiKeySecret: 'shared_gateway_key' });
    expect(both.status).toBe(400);
    expect((await testDb.db.execute(sql`SELECT 1 FROM ai_providers WHERE provider_key = 'campus-gw-f'`)).rows).toHaveLength(0);
    expect(await secretValue('ai_provider_campus_gw_f')).toBeUndefined();
  });

  it('removes the key, and its own secret, when authentication is set to none or the key to null', async () => {
    const a = (await create({ providerKey: 'campus-gw-g', apiKey: 'vault-key' })).body.data;
    expect((await update(a.id, { authType: 'none', apiKey: 'ignored' })).body.data).toMatchObject({ hasApiKey: false, apiKeySecret: null });
    expect(await secretValue('ai_provider_campus_gw_g')).toBeUndefined();

    const b = (await create({ providerKey: 'campus-gw-h', apiKey: 'vault-key' })).body.data;
    expect((await update(b.id, { apiKey: null })).body.data).toMatchObject({ hasApiKey: false, apiKeySecret: null });
    expect(await secretValue('ai_provider_campus_gw_h')).toBeUndefined();
  });

  it('asks for the key, or its secret, again when the base URL moves to another server', async () => {
    await createSecret({ name: 'moving_key', value: 'vault-key' });
    for (const keyed of [{ apiKey: 'vault-key' }, { apiKeySecret: 'moving_key' }]) {
      const { body } = await create({ providerKey: `campus-gw-move-${++n}`, ...keyed });
      const moved = await update(body.data.id, { baseUrl: 'https://elsewhere.example/v1' });
      expect(moved.status).toBe(400);
      expect(moved.body.message).toMatch(/Enter the API key again, or choose its vault secret again/);
      expect((await update(body.data.id, { baseUrl: 'https://elsewhere.example/v1', ...keyed })).status).toBe(200);
      // Another path on the same server keeps it
      expect((await update(body.data.id, { baseUrl: 'https://elsewhere.example/v2' })).status).toBe(200);
    }
  });

  it('deletes the provider\'s own secret with it, unless something else uses that secret', async () => {
    const a = (await create({ providerKey: 'campus-gw-i', apiKey: 'vault-key' })).body.data;
    expect(await remove(a.id)).toBe(200);
    expect(await secretValue('ai_provider_campus_gw_i')).toBeUndefined();

    const b = (await create({ providerKey: 'campus-gw-j', apiKey: 'vault-key' })).body.data;
    await createSecret({ name: 'other_j', value: 'x' });
    const c = (await create({ providerKey: 'campus-gw-k', apiKeySecret: 'ai_provider_campus_gw_j' })).body.data;
    expect(c.apiKeySecret).toBe('ai_provider_campus_gw_j');
    expect(await remove(b.id)).toBe(200);
    expect(await secretValue('ai_provider_campus_gw_j')).toBe('vault-key');
  });

  it('with no usable encryption key, refuses a typed key with what to set, and writes nothing', async () => {
    const existing = (await create({ providerKey: 'campus-gw-l', apiKey: 'vault-key' })).body.data;
    vi.stubEnv('SECRETS_ENCRYPTION_KEY', '');
    const refused = await create({ providerKey: 'campus-gw-m', apiKey: 'vault-key' });
    expect(refused.status).toBe(500);
    expect(refused.body).toMatchObject({ code: 'ENCRYPTION_KEY_NOT_SET', hint: expect.stringContaining('SECRETS_ENCRYPTION_KEY') });
    expect((await testDb.db.execute(sql`SELECT 1 FROM ai_providers WHERE provider_key = 'campus-gw-m'`)).rows).toHaveLength(0);

    const refusedUpdate = await update(existing.id, { apiKey: 'new-key', displayName: 'Not renamed' });
    expect(refusedUpdate.status).toBe(500);
    expect((await testDb.db.execute(sql`SELECT display_name FROM ai_providers WHERE id = ${existing.id}`)).rows[0]).toEqual({ display_name: existing.displayName });

    // A provider without a key needs no encryption
    expect((await create({ providerKey: 'campus-gw-n', authType: 'none' })).status).toBe(201);
    vi.stubEnv('SECRETS_ENCRYPTION_KEY', KEY);
    expect(await secretValue('ai_provider_campus_gw_l')).toBe('vault-key');
  });

  it('writes the provider and its secret together: when the save fails, neither is kept', async () => {
    const realTransaction = testDb.db.transaction.bind(testDb.db);
    const spy = vi.spyOn(testDb.db, 'transaction').mockImplementation((async (work: (tx: unknown) => Promise<unknown>) =>
      realTransaction(async (tx) => { await work(tx); throw new Error('the database went away'); })) as never);
    try {
      expect((await create({ providerKey: 'campus-gw-o', apiKey: 'vault-key' })).status).toBe(500);
    } finally {
      spy.mockRestore();
    }
    expect((await testDb.db.execute(sql`SELECT 1 FROM ai_providers WHERE provider_key = 'campus-gw-o'`)).rows).toHaveLength(0);
    expect(await secretValue('ai_provider_campus_gw_o')).toBeUndefined();
  });

  it('lets only a role that can manage secrets choose a vault secret; a typed key needs no such role', async () => {
    await createSecret({ name: 'guarded_key', value: 'vault-key' });
    accessStub.access = {
      userId: 'manager', roleId: 'provider-managers', roleName: 'Provider managers', isAdmin: false,
      permissions: new Set(ALL_PERMISSIONS.filter((p) => p !== 'secrets:manage')),
    };
    const chosen = await create({ providerKey: 'campus-gw-p', apiKeySecret: 'guarded_key' });
    expect(chosen.status).toBe(403);
    const typed = await create({ providerKey: 'campus-gw-p', apiKey: 'their-own-key' });
    expect(typed.status).toBe(201);
    expect((await update(typed.body.data.id, { apiKeySecret: 'guarded_key' })).status).toBe(403);
    expect((await update(typed.body.data.id, { apiKey: 'another-own-key' })).status).toBe(200);
    expect(ADMIN_ROLE_ID).not.toBe('provider-managers');
  });
});

describe('editing a provider that already has a key', () => {
  const noSecretsRole = () => {
    accessStub.access = {
      userId: 'manager', roleId: 'provider-managers', roleName: 'Provider managers', isAdmin: false,
      permissions: new Set(ALL_PERMISSIONS.filter((p) => p !== 'secrets:manage')),
    };
  };
  const put = async (id: string, body: Record<string, unknown>) =>
    (await providerRoute.PUT(new NextRequest(`http://localhost/api/ai-providers/${id}`, { method: 'PUT', body: JSON.stringify(body) }), idParams(id))).status;
  const stored = async (id: string) =>
    (await testDb.db.execute(sql`SELECT display_name, connection_type, settings FROM ai_providers WHERE id = ${id}`)).rows[0];

  it('needs a role that can manage secrets when the provider keeps a chosen secret, whatever the edit changes', async () => {
    await createSecret({ name: 'edit_guard_key', value: 'vault-key' });
    const p = await providerWithSecret('edit_guard_key');
    const before = await stored(p.providerId);

    noSecretsRole();
    for (const edit of [{ connectionType: 'ollama' }, { settings: { temperature: 0.1 } }, { displayName: 'Renamed' }]) {
      expect(await put(p.providerId, edit)).toBe(403);
    }
    expect(await stored(p.providerId)).toEqual(before);

    accessStub.reset();
    expect(await put(p.providerId, { displayName: 'Renamed by admin' })).toBe(200);
  });

  it('needs no such role when the secret is the provider\'s own, made from a key typed on it', async () => {
    noSecretsRole();
    const res = await providersRoute.POST(new NextRequest('http://localhost/api/ai-providers', {
      method: 'POST',
      body: JSON.stringify({ displayName: 'Own key', providerKey: 'campus-gw-own-edit', providerType: 'local', connectionType: 'openai_compatible', authType: 'api_key', baseUrl: gatewayUrl, isEnabled: true, apiKey: 'vault-key' }),
    }));
    const id = (await res.json()).data.id as string;
    expect(await put(id, { displayName: 'Renamed', connectionType: 'ollama' })).toBe(200);
    expect(await stored(id)).toMatchObject({ display_name: 'Renamed', connection_type: 'ollama' });
  });

  it('still answers 404 for a provider that does not exist, to a role that cannot manage secrets', async () => {
    noSecretsRole();
    expect(await put('00000000-0000-4000-8000-000000000000', { displayName: 'Nobody' })).toBe(404);
  });
});

describe('the health check when a provider\'s secret can\'t be read at all', () => {
  it('marks that provider unhealthy and still answers, instead of failing the whole check', async () => {
    await createSecret({ name: `health_db_key_${n + 1}`, value: 'vault-key' });
    const p = await providerWithSecret(`health_db_key_${n + 1}`);
    const spy = vi.spyOn(testDb.db.query.secrets, 'findFirst').mockRejectedValue(new Error('connection reset'));
    try {
      expect(await healthOf(p.providerKey)).toMatchObject({ healthy: false, message: 'API key unavailable: see the AI Providers page', responseTimeMs: 0 });
    } finally {
      spy.mockRestore();
    }
  });
});

describe('the vault and the providers that use its secrets', () => {
  it('refuses to delete a secret a provider uses, naming the provider', async () => {
    const { listSecrets, deleteSecret } = await import('@/features/secrets/secrets.service');
    await createSecret({ name: 'in_use_by_provider', value: 'vault-key' });
    await providerWithSecret('in_use_by_provider');
    const [secret] = await listSecrets('in_use_by_provider');
    await expect(deleteSecret(secret.id)).rejects.toMatchObject({
      name: 'SecretInUseError',
      message: expect.stringMatching(/AI provider "Campus gateway \d+"/),
      references: [expect.objectContaining({ type: 'ai_provider' })],
    });
  });
});

describe('keys saved on providers before the vault held them, at startup', () => {
  const row = async (id: string) =>
    (await testDb.db.execute(sql`SELECT api_key, api_key_secret, api_key_secret_managed FROM ai_providers WHERE id = ${id}`)).rows[0];
  const secretValue = async (name: string) => {
    const found = (await testDb.db.execute(sql`SELECT encrypted_value FROM secrets WHERE name = ${name}`)).rows[0] as { encrypted_value: string } | undefined;
    return found ? decrypt(found.encrypted_value) : undefined;
  };
  /** Earlier tests' keys on rows are moved first, so a test's own counts are its own */
  beforeEach(async () => { await moveProviderKeysToVault(); });

  it('move into the vault as the provider\'s own secret once, and keep working', async () => {
    const p = await providerWithSecret(null, { apiKey: 'vault-key' });
    expect(await moveProviderKeysToVault()).toEqual({ moved: 1, left: 0 });
    const name = `ai_provider_${p.providerKey.replace(/-/g, '_')}`;
    expect(await row(p.providerId)).toEqual({ api_key: null, api_key_secret: name, api_key_secret_managed: true });
    expect(await secretValue(name)).toBe('vault-key');
    expect(await moveProviderKeysToVault()).toEqual({ moved: 0, left: 0 });

    expect((await generateText('Say hi', { providerId: p.providerId, modelId: p.chatModelId })).text).toBe('Hi from the gateway');
    expect(gateway.seen.at(-1)).toMatchObject({ auth: 'Bearer vault-key' });
  });

  it('take the next free name when the vault has one by that name already', async () => {
    const p = await providerWithSecret(null, { apiKey: 'vault-key' });
    const name = `ai_provider_${p.providerKey.replace(/-/g, '_')}`;
    await createSecret({ name, value: 'someone-elses' });
    await moveProviderKeysToVault();
    expect(await row(p.providerId)).toMatchObject({ api_key_secret: `${name}_2` });
    expect(await secretValue(name)).toBe('someone-elses');
  });

  it('only empty the old key when the provider already names a vault secret', async () => {
    await createSecret({ name: `kept_${n + 1}`, value: 'vault-key' });
    const p = await providerWithSecret(`kept_${n + 1}`, { apiKey: 'stale-key' });
    expect(await moveProviderKeysToVault()).toEqual({ moved: 1, left: 0 });
    expect(await row(p.providerId)).toEqual({ api_key: null, api_key_secret: `kept_${n}`, api_key_secret_managed: false });
  });

  it('stay on the provider, still working, when no encryption key is set; a warning is logged', async () => {
    const p = await providerWithSecret(null, { apiKey: 'vault-key' });
    vi.stubEnv('SECRETS_ENCRYPTION_KEY', '');
    expect(await moveProviderKeysToVault()).toEqual({ moved: 0, left: 1 });
    expect(await row(p.providerId)).toMatchObject({ api_key: 'vault-key', api_key_secret: null });
    expect((await generateText('Say hi', { providerId: p.providerId, modelId: p.chatModelId })).text).toBe('Hi from the gateway');
  });

  it('leave a key changed while startup ran to the change, with no secret made for the old one', async () => {
    const p = await providerWithSecret(null, { apiKey: 'vault-key' });
    const realTransaction = testDb.db.transaction.bind(testDb.db);
    const spy = vi.spyOn(testDb.db, 'transaction').mockImplementationOnce((async (work: (tx: unknown) => Promise<unknown>) => {
      // An admin saves a new key between startup reading the row and moving it
      await testDb.db.execute(sql`UPDATE ai_providers SET api_key = 'typed-meanwhile' WHERE id = ${p.providerId}`);
      return realTransaction(work as never);
    }) as never);
    try {
      expect(await moveProviderKeysToVault()).toEqual({ moved: 0, left: 0 });
    } finally {
      spy.mockRestore();
    }
    expect(await row(p.providerId)).toMatchObject({ api_key: 'typed-meanwhile', api_key_secret: null });
    expect(await secretValue(`ai_provider_${p.providerKey.replace(/-/g, '_')}`)).toBeUndefined();
    // The next start moves the new one
    expect(await moveProviderKeysToVault()).toEqual({ moved: 1, left: 0 });
  });

  it('count a key another instance starting at the same time moved first as nobody\'s failure', async () => {
    const p = await providerWithSecret(null, { apiKey: 'vault-key' });
    // The other instance took the secret's name between this one's check and its write
    const spy = vi.spyOn(testDb.db, 'transaction').mockImplementationOnce((async () => {
      throw Object.assign(new Error('duplicate key value violates unique constraint "secrets_name_unique"'), { code: '23505' });
    }) as never);
    try {
      expect(await moveProviderKeysToVault()).toEqual({ moved: 0, left: 0 });
    } finally {
      spy.mockRestore();
    }
    expect(await row(p.providerId)).toMatchObject({ api_key: 'vault-key' });
  });

  it('never stop the server: a database failure is logged and nothing changes', async () => {
    const p = await providerWithSecret(null, { apiKey: 'vault-key' });
    const spy = vi.spyOn(testDb.db, 'select').mockImplementation((() => { throw new Error('connection refused'); }) as never);
    try {
      await expect(moveProviderKeysToVault()).resolves.toEqual({ moved: 0, left: 0 });
    } finally {
      spy.mockRestore();
    }
    expect(await row(p.providerId)).toMatchObject({ api_key: 'vault-key' });
  });

  it('leave a key it could not move on the provider, still working', async () => {
    const p = await providerWithSecret(null, { apiKey: 'vault-key' });
    const spy = vi.spyOn(testDb.db, 'transaction').mockImplementationOnce((async () => { throw new Error('write refused'); }) as never);
    try {
      expect(await moveProviderKeysToVault()).toEqual({ moved: 0, left: 1 });
    } finally {
      spy.mockRestore();
    }
    expect(await row(p.providerId)).toMatchObject({ api_key: 'vault-key', api_key_secret: null });
  });
});

