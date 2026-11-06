// src/features/data-source/external-search/connectors/connector-errors.test.ts

/**
 * A failed engine call keeps what the engine said: which engine, and the HTTP status
 * when it answered. The error explanation reads them (bad credentials, unreachable,
 * a refused filter); a bare message would only say "unavailable".
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ExternalConnection, ExternalSearchConnector } from '../external-search.types';

import { classifyUpstream } from '@/shared/errors/upstream';

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

/**
 * An engine that answers with something other than JSON (a proxy's sign-in or error page
 * in front of it) is explained as that, with the start of what it sent, the same way on
 * every engine. A timeout while the answer is still arriving is explained as a timeout.
 */
describe('an answer that cannot be read', () => {
  const SIGN_IN_PAGE = '<html><body>Sign in to continue</body></html>';
  const page = (body: string, status: number) => vi.fn(async () => new Response(body, { status, headers: { 'content-type': 'text/html' } }));

  it.each(connectors)('$name explains a success that is not JSON', async ({ name, connector }) => {
    vi.stubGlobal('fetch', page(SIGN_IN_PAGE, 200));
    await expect(search(connector)).rejects.toMatchObject({ name: 'ExternalSearchError', provider: name, message: `${name} returned a non-JSON response (HTTP 200): ${SIGN_IN_PAGE}` });
  });

  it.each(connectors.filter(({ name }) => name !== 'Sitecore Search'))('$name keeps the text of an error page that is not JSON', async ({ name, connector }) => {
    vi.stubGlobal('fetch', page('<html>502 Bad Gateway</html>', 502));
    await expect(search(connector)).rejects.toMatchObject({ status: 502, message: `${name} returned HTTP 502: <html>502 Bad Gateway</html>` });
  });

  it.each(connectors)('$name explains a timeout while the answer was arriving as a timeout', async ({ connector }) => {
    const stalled = new ReadableStream({ start: (c) => c.error(new DOMException('The operation was aborted due to timeout', 'TimeoutError')) });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(stalled, { status: 200 })));
    const failed = await search(connector).catch((e: unknown) => e);
    expect(failed).toMatchObject({ name: 'ExternalSearchError' });
    expect(classifyUpstream(failed)).toMatchObject({ code: 'UPSTREAM_TIMEOUT' });
  });

  it("still reads Azure AI Search's own reason from a JSON error", async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: { message: "The index 'shop' was not found" } }, { status: 404 })));
    await expect(search(azureAISearchConnector)).rejects.toThrow("Azure AI Search returned HTTP 404: The index 'shop' was not found");
  });
});
