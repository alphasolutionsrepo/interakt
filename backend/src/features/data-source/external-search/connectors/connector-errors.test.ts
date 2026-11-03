// src/features/data-source/external-search/connectors/connector-errors.test.ts

/**
 * A failed engine call keeps what the engine said: which engine, and the HTTP status
 * when it answered. The error explanation reads them (bad credentials, unreachable,
 * a refused filter); a bare message would only say "unavailable".
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ExternalConnection, ExternalSearchConnector } from '../external-search.types';

import { azureAISearchConnector, elasticsearchConnector } from './search-engine.connectors';
import { sitecoreSearchConnector } from './sitecore-search.connector';

const connection = (provider: string): ExternalConnection => ({
  provider,
  endpoint: 'https://engine.example.com',
  indexName: 'shop',
  apiKey: 'key',
  authType: 'api_key',
  providerSettings: {},
});

const connectors: Array<{ name: string; connector: ExternalSearchConnector }> = [
  { name: 'Elasticsearch', connector: elasticsearchConnector },
  { name: 'Azure AI Search', connector: azureAISearchConnector },
  { name: 'Sitecore Search', connector: sitecoreSearchConnector },
];

const search = (connector: ExternalSearchConnector) =>
  connector.search(connection(connector.provider), { query: 'jeans', offset: 0, limit: 10 }, []);

afterEach(() => vi.unstubAllGlobals());

describe('a failed external search', () => {
  it.each(connectors)('$name keeps the engine and the HTTP status it answered with', async ({ name, connector }) => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: { message: 'bad key' } }), { status: 401 })));
    await expect(search(connector)).rejects.toMatchObject({ name: 'ExternalSearchError', provider: name, status: 401 });
  });

  it('keeps the reason Elasticsearch gives at the root, not "all shards failed"', async () => {
    const body = { error: { type: 'search_phase_execution_exception', reason: 'all shards failed', root_cause: [{ type: 'query_shard_exception', reason: 'No mapping found for [price] in order to sort on' }] } };
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status: 400 })));
    await expect(search(elasticsearchConnector)).rejects.toThrow('Elasticsearch returned HTTP 400: No mapping found for [price] in order to sort on');
  });

  it.each(connectors)('$name keeps the engine when it could not be reached', async ({ name, connector }) => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed'); }));
    const error = await search(connector).catch((e: unknown) => e);
    expect(error).toMatchObject({ name: 'ExternalSearchError', provider: name });
    expect((error as { status?: number }).status).toBeUndefined();
    expect((error as Error).message).toMatch(/fetch failed/);
  });
});
