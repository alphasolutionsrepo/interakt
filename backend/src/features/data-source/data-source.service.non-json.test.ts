// src/features/data-source/data-source.service.non-json.test.ts

/**
 * An external engine behind a proxy that answers a 2xx with its own page, not JSON: the
 * health check still says the source is reachable, and that schema discovery failed
 * with what the proxy sent, not "Unexpected token <". Runs the real health check; only
 * the stored source and the network are faked.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

const repository = vi.hoisted(() => ({ getDataSourceById: vi.fn(), updateDataSource: vi.fn(async () => ({})) }));
vi.mock('./data-source.repository', () => repository);
vi.mock('@/features/search-experience/search-experience.cache', () => ({ invalidateByDataSource: vi.fn() }));
vi.mock('@/features/search-index/search-index.repository', () => ({}));
vi.mock('@/features/secrets/secrets.service', () => ({ resolveSecret: vi.fn() }));
vi.mock('@/features/tools/tools.service', () => ({}));

import { performHealthCheck } from './data-source.service';

afterEach(() => vi.unstubAllGlobals());

describe('an Elasticsearch source whose proxy answers its index requests with a page', () => {
  it('says schema discovery failed with what the proxy sent', async () => {
    repository.getDataSourceById.mockResolvedValue({
      id: 'ds-1',
      type: 'search_index_external',
      config: { provider: 'elasticsearch', connection: { url: 'http://es.internal:9200', indexName: 'shop', authType: 'none' } },
      schema: null,
    });
    // The cluster root answers; everything under the index gets the proxy's page
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (url.endsWith(':9200')
      ? new Response(JSON.stringify({ version: { number: '9.3.0' } }))
      : new Response('<html><body>Gateway login</body></html>', { status: 200 }))));

    const result = await performHealthCheck('ds-1');

    expect(result.message).toContain('schema discovery failed: Elasticsearch returned a non-JSON response (HTTP 200): <html>');
    expect(result.message).not.toContain('Unexpected token');
  });
});

describe('an Azure AI Search source whose proxy answers with a page', () => {
  it('says schema discovery failed with what the proxy sent', async () => {
    repository.getDataSourceById.mockResolvedValue({
      id: 'ds-2',
      type: 'search_index_external',
      config: { provider: 'azure_ai_search', connection: { url: 'https://shop.search.windows.net', indexName: 'products', authType: 'none' } },
      schema: null,
    });
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html><body>Gateway login</body></html>', { status: 200 })));

    const result = await performHealthCheck('ds-2');

    expect(result.message).toContain('schema discovery failed: Azure AI Search returned a non-JSON response (HTTP 200): <html>');
    expect(result.message).not.toContain('Unexpected token');
  });
});
