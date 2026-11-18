// The Azure client against the real @azure/search-documents SDK (no mocks): building a client
// makes no network call, so this checks the classes, settings and caching the app relies on.
import { SearchClient, SearchIndexClient } from '@azure/search-documents';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { closeClients, getIndexClient, getSearchClient } from './azure-client';

const ENDPOINT = 'https://example-service.search.windows.net';

describe('azure-client with the real SDK', () => {
  beforeEach(() => {
    vi.stubEnv('AZURE_SEARCH_ENDPOINT', ENDPOINT);
    vi.stubEnv('AZURE_SEARCH_API_KEY', 'test-key');
    vi.stubEnv('AZURE_SEARCH_API_VERSION', '2024-07-01');
    closeClients();
  });

  afterEach(() => {
    closeClients();
    vi.unstubAllEnvs();
  });

  it('builds a SearchClient for the index with the configured endpoint and API version, and reuses it', () => {
    const client = getSearchClient('products');

    expect(client).toBeInstanceOf(SearchClient);
    expect(client.endpoint).toBe(ENDPOINT);
    expect(client.indexName).toBe('products');
    expect(client.apiVersion).toBe('2024-07-01');
    expect(getSearchClient('products')).toBe(client);
    expect(getSearchClient('orders')).not.toBe(client);
  });

  it('builds one SearchIndexClient with the configured endpoint and API version', () => {
    const client = getIndexClient();

    expect(client).toBeInstanceOf(SearchIndexClient);
    expect(client.endpoint).toBe(ENDPOINT);
    expect(client.apiVersion).toBe('2024-07-01');
    expect(getIndexClient()).toBe(client);
  });

  it('refuses to build a client when Azure AI Search is not configured', () => {
    vi.stubEnv('AZURE_SEARCH_ENDPOINT', '');

    expect(() => getSearchClient('products')).toThrow(/Azure AI Search not configured/);
  });
});
