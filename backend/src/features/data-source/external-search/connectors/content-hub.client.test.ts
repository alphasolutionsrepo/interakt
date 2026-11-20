// src/features/data-source/external-search/connectors/content-hub.client.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/shared/http/same-server-fetch', () => ({
  fetchOnSameServer: vi.fn(),
  connectFailure: (service: string, error: unknown) => `Cannot reach ${service}: ${(error as Error).message}`,
}));


import type { ExternalConnection } from '../external-search.types';
import { ExternalSearchError } from '../external-search.types';

import {
  contentHubRequest,
  contentHubSettings,
  getContentHubToken,
  resetContentHubTokens,
  searchAfter,
} from './content-hub.client';

import { fetchOnSameServer } from '@/shared/http/same-server-fetch';

const fetchMock = vi.mocked(fetchOnSameServer);

function connection(overrides: Partial<ExternalConnection> = {}): ExternalConnection {
  return {
    provider: 'content-hub',
    endpoint: 'https://tenant.example/',
    indexName: 'M.Asset',
    apiKey: 'client-secret',
    authType: 'oauth_client_credentials',
    providerSettings: { clientId: 'interakt' },
    ...overrides,
  };
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const TOKEN = json(200, { access_token: 'tok-1', expires_in: 3600, token_type: 'bearer' });

beforeEach(() => {
  fetchMock.mockReset();
  resetContentHubTokens();
});

describe('contentHubSettings', () => {
  it('maps the connection: URL is the host, index name is the definition, culture defaults', () => {
    const s = contentHubSettings(connection());
    expect(s).toMatchObject({ host: 'https://tenant.example', definition: 'M.Asset', clientId: 'interakt', secret: 'client-secret', culture: 'en-US' });
    expect(contentHubSettings(connection({ providerSettings: { clientId: ' a ', culture: 'da-DK' } })).culture).toBe('da-DK');
    expect(contentHubSettings(connection({ providerSettings: { clientId: ' a ' } })).clientId).toBe('a');
  });
});

describe('getContentHubToken', () => {
  it('mints a client-credentials token once and caches it per host and client', async () => {
    fetchMock.mockResolvedValueOnce(TOKEN.clone());
    const settings = contentHubSettings(connection());
    expect(await getContentHubToken(settings)).toBe('tok-1');
    expect(await getContentHubToken(settings)).toBe('tok-1');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://tenant.example/oauth/token');
    expect(init.method).toBe('POST');
    expect(String(init.body)).toBe('grant_type=client_credentials&client_id=interakt&client_secret=client-secret');
  });

  it('shares one mint between concurrent callers', async () => {
    fetchMock.mockImplementationOnce(async () => TOKEN.clone());
    const settings = contentHubSettings(connection());
    const [a, b] = await Promise.all([getContentHubToken(settings), getContentHubToken(settings)]);
    expect(a).toBe('tok-1');
    expect(b).toBe('tok-1');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('uses the secret itself as the bearer token for authType bearer', async () => {
    expect(await getContentHubToken(contentHubSettings(connection({ authType: 'bearer', apiKey: 'pre-minted' })))).toBe('pre-minted');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('explains a refused client and a missing client id', async () => {
    fetchMock.mockResolvedValueOnce(json(400, { error: 'invalid_client' }));
    await expect(getContentHubToken(contentHubSettings(connection()))).rejects.toThrow(/client id and secret/);
    await expect(getContentHubToken(contentHubSettings(connection({ providerSettings: {} })))).rejects.toThrow(/client id is missing/);
    await expect(getContentHubToken(contentHubSettings(connection({ authType: 'api_key' })))).rejects.toThrow(/OAuth client credentials or a bearer token/);
  });
});

describe('contentHubRequest', () => {
  it('sends the bearer token and parses JSON', async () => {
    fetchMock.mockResolvedValueOnce(TOKEN.clone()).mockResolvedValueOnce(json(200, { name: 'M.Asset' }));
    const { json: body } = await contentHubRequest<{ name: string }>(contentHubSettings(connection()), '/api/entitydefinitions/M.Asset');
    expect(body.name).toBe('M.Asset');
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe('https://tenant.example/api/entitydefinitions/M.Asset');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok-1');
  });

  it('drops the cached token and retries once on 401', async () => {
    fetchMock
      .mockResolvedValueOnce(TOKEN.clone())
      .mockResolvedValueOnce(json(401, {}))
      .mockResolvedValueOnce(json(200, { access_token: 'tok-2', expires_in: 3600 }))
      .mockResolvedValueOnce(json(200, { ok: true }));
    const { json: body } = await contentHubRequest<{ ok: boolean }>(contentHubSettings(connection()), '/api/x');
    expect(body.ok).toBe(true);
    expect((fetchMock.mock.calls[3][1].headers as Record<string, string>).Authorization).toBe('Bearer tok-2');
  });

  it('explains permission, missing definition and rate-limit failures with the status', async () => {
    const settings = contentHubSettings(connection());
    fetchMock.mockResolvedValueOnce(TOKEN.clone()).mockResolvedValueOnce(json(403, {}));
    await expect(contentHubRequest(settings, '/api/x')).rejects.toMatchObject({ status: 403, message: /lacks permission/ });
    fetchMock.mockResolvedValueOnce(json(404, {}));
    await expect(contentHubRequest(settings, '/api/entitydefinitions/Nope')).rejects.toMatchObject({ status: 404, message: /entity definition name/ });
    fetchMock.mockResolvedValueOnce(json(429, {}));
    await expect(contentHubRequest(settings, '/api/x')).rejects.toMatchObject({ status: 429, message: /rate limit/ });
  });

  it('reports a non-JSON answer', async () => {
    fetchMock.mockResolvedValueOnce(TOKEN.clone()).mockResolvedValueOnce(new Response('<html>', { status: 200 }));
    const err = await contentHubRequest(contentHubSettings(connection()), '/api/x').catch((e) => e);
    expect(err).toBeInstanceOf(ExternalSearchError);
    expect(err.message).toMatch(/non-JSON/);
  });
});

describe('searchAfter', () => {
  it('posts to the V2 endpoint and maps the page', async () => {
    fetchMock.mockResolvedValueOnce(TOKEN.clone()).mockResolvedValueOnce(json(200, { items: [{ id: 1 }], total_items: 42, last_hit_data: ['a'] }));
    const page = await searchAfter(contentHubSettings(connection()), { filter: { type: 'DefinitionName', name: 'M.Asset' }, take: 1 });
    expect(page).toMatchObject({ items: [{ id: 1 }], total: 42, lastHitData: ['a'] });
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe('https://tenant.example/api/entities/searchafter');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['X-ApiVersion']).toBe('2');
    expect(JSON.parse(String(init.body))).toMatchObject({ filter: { type: 'DefinitionName', name: 'M.Asset' }, take: 1, renditions: ['None'] });
  });
});
