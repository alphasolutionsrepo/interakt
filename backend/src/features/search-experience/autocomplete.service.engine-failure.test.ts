// src/features/search-experience/autocomplete.service.engine-failure.test.ts

/**
 * Autocomplete when the search engine fails, through the real autocomplete service and
 * Elasticsearch provider (only the client is stubbed): a visitor's type-ahead gets no
 * suggestions, quietly, and the failure is logged once with the request id; an admin
 * testing the experience gets the error. An index made without the autocomplete
 * analyzer is still asked again without it.
 */

import { errors as esErrors } from '@elastic/elasticsearch';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { reported, type LogLine } from '@/shared/test/log-recorder';

vi.mock('server-only', () => ({}));
const logs = vi.hoisted(() => [] as LogLine[]);
vi.mock('@/shared/logger/logger', async () => (await import('@/shared/test/log-recorder')).recordingLogger(logs));
const es = vi.hoisted(() => ({ search: vi.fn() }));
vi.mock('@elastic/elasticsearch', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@elastic/elasticsearch')>()),
  Client: class { search = es.search; },
}));
vi.mock('@/features/search-index/search-index.service', () => ({
  getSearchIndexById: async (id: string) => ({ id, name: id === 'i2' ? 'catalog' : 'shop', fields: [{ fieldName: 'name', isIndexed: true }] }),
}));
const azure = vi.hoisted(() => ({ suggest: vi.fn() }));
vi.mock('@/features/search/providers/azure-ai-search/azure-client', () => ({
  getSearchClient: () => ({ suggest: azure.suggest }),
  checkAzureHealth: vi.fn(),
}));
vi.mock('@/features/search-index/provider-settings.utils', () => ({ getProviderFieldSettings: () => ({ isAutocomplete: true }) }));
const session = vi.hoisted(() => ({ user: null as { id: string } | null }));
vi.mock('@/features/auth/auth.api.handlers', () => ({ auth: async () => (session.user ? { user: session.user } : null) }));
vi.mock('./search-experience.service', () => ({
  getSearchExperienceByAccessToken: async () => ({ ...(experience as object), isActive: true, accessToken: 'search-token', allowedOrigins: [] }),
  UnauthorizedError: class UnauthorizedError extends Error {},
  ForbiddenError: class ForbiddenError extends Error {},
}));

import { getAutocompleteSuggestions } from './autocomplete.service';

import { providerRegistry } from '@/features/search/providers';
import { AzureSearchProvider } from '@/features/search/providers/azure-ai-search/azure-search.provider';
import { ElasticsearchSearchProvider } from '@/features/search/providers/elasticsearch/elasticsearch-search.provider';

import { POST as autocompleteRoute } from '@/app/api/v1/autocomplete/route';
import { markAdminCaller, publicRoute } from '@/shared/api/public-route';
import { TEST_MARKER_HEADER } from '@/shared/constants/test-marker.constants';

const experience = {
  id: 'exp',
  searchConfig: { autocomplete: { enabled: true, minLength: 1, maxSuggestions: 5 } },
  indexes: [{ searchIndexId: 'i1', searchIndex: { name: 'shop', displayName: 'Shop', isActive: true, searchProvider: 'elasticsearch' } }],
} as never;
const down = () => new esErrors.ConnectionError('connect ECONNREFUSED 127.0.0.1:9200', { meta: {} } as never);
const asVisitor = <T>(work: () => Promise<T>) => publicRoute(work)();
const asAdmin = <T>(work: () => Promise<T>) => publicRoute(async () => { markAdminCaller(); return work(); })();

// The real providers, registered as the app's startup does (its require() doesn't resolve under the test runner)
if (!providerRegistry.get('elasticsearch')) providerRegistry.register('elasticsearch', new ElasticsearchSearchProvider(), true);
if (!providerRegistry.get('azure_ai_search')) providerRegistry.register('azure_ai_search', new AzureSearchProvider());

beforeEach(() => { logs.length = 0; es.search.mockReset(); azure.suggest.mockReset(); session.user = null; });

describe('autocomplete when Elasticsearch is down', () => {
  it("gives a visitor no suggestions, quietly, and logs it once with the request id", async () => {
    es.search.mockRejectedValue(down());

    const result = await asVisitor(() => getAutocompleteSuggestions(experience, { query: 'lin' }));

    expect(result.suggestions).toEqual([]);
    expect(reported(logs)).toEqual([expect.objectContaining({ level: 'error', context: expect.objectContaining({ requestId: expect.any(String) }) })]);
  });

  it('gives an admin the error, for the answer to explain and log', async () => {
    const error = down();
    es.search.mockRejectedValue(error);

    await expect(asAdmin(() => getAutocompleteSuggestions(experience, { query: 'lin' }))).rejects.toMatchObject({ cause: error });
    expect(reported(logs)).toEqual([]);
  });
});

describe('autocomplete across an Elasticsearch and an Azure AI Search index', () => {
  const both = {
    id: 'exp',
    searchConfig: { autocomplete: { enabled: true, minLength: 1, maxSuggestions: 5 } },
    indexes: [
      { searchIndexId: 'i1', searchIndex: { name: 'shop', displayName: 'Shop', isActive: true, searchProvider: 'elasticsearch' } },
      { searchIndexId: 'i2', searchIndex: { name: 'catalog', displayName: 'Catalog', isActive: true, searchProvider: 'azure_ai_search' } },
    ],
  } as never;
  const azureAnswers = (...names: string[]) => ({
    results: (async function* () { for (const name of names) yield { text: name, document: { id: name, name } }; })(),
  });

  it("gives a visitor the other index's suggestions when one is down, logging the one that failed", async () => {
    es.search.mockRejectedValue(down());
    azure.suggest.mockResolvedValue(azureAnswers('Linen trousers'));

    const result = await asVisitor(() => getAutocompleteSuggestions(both, { query: 'lin' }));

    expect(result.suggestions.map((s) => s.text)).toEqual(['Linen trousers']);
    expect(reported(logs)).toEqual([expect.objectContaining({ level: 'error', context: expect.objectContaining({ indexIds: ['i1'], requestId: expect.any(String) }) })]);
  });

  it('gives a visitor no suggestions from Azure AI Search when it fails, quietly, logged once', async () => {
    es.search.mockResolvedValue({ hits: { hits: [] } });
    azure.suggest.mockRejectedValue(Object.assign(new Error('Access denied'), { name: 'RestError', statusCode: 403 }));

    const result = await asVisitor(() => getAutocompleteSuggestions(both, { query: 'lin' }));

    expect(result.suggestions).toEqual([]);
    expect(reported(logs)).toEqual([expect.objectContaining({ context: expect.objectContaining({ indexIds: ['i2'] }) })]);
  });
});

describe('autocomplete through the route when Elasticsearch is down', () => {
  const ask = (headers: Record<string, string>) => autocompleteRoute(new NextRequest('http://interakt.test/api/v1/autocomplete', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-Access-Token': 'search-token', ...headers },
    body: JSON.stringify({ query: 'lin' }),
  }));

  it('gives a visitor no suggestions, even one sending the test marker without the login', async () => {
    es.search.mockRejectedValue(down());
    const res = await ask({ [TEST_MARKER_HEADER]: '1' });
    expect(res.status).toBe(200);
    expect((await res.json()).data.suggestions).toEqual([]);
  });

  it('gives the search playground (the marker and the admin login) the failure explained', async () => {
    session.user = { id: 'admin' };
    es.search.mockRejectedValue(down());
    const res = await ask({ [TEST_MARKER_HEADER]: '1' });
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body).toMatchObject({ code: 'UPSTREAM_UNAVAILABLE', message: "Elasticsearch couldn't be reached.", requestId: expect.any(String) });
    expect(reported(logs)).toEqual([expect.objectContaining({ level: 'error', context: expect.objectContaining({ requestId: body.requestId }) })]);
  });
});

describe('autocomplete on an index made without the autocomplete analyzer', () => {
  it('is asked again without it', async () => {
    es.search
      .mockRejectedValueOnce(new Error('analyzer [autocomplete_search] has not been configured in mappings'))
      .mockResolvedValueOnce({ hits: { hits: [{ _id: 'a', _score: 1, _source: { name: 'Linen shirt' } }] } });

    const result = await asVisitor(() => getAutocompleteSuggestions(experience, { query: 'lin' }));

    expect(result.suggestions.map((s) => s.text)).toEqual(['Linen shirt']);
  });
});

describe('the Elasticsearch provider asked for autocomplete while Elasticsearch is down', () => {
  it('passes the failure on with its cause, without logging it', async () => {
    const error = down();
    es.search.mockRejectedValue(error);

    await expect(new ElasticsearchSearchProvider().autocomplete('shop', 'lin', ['name'])).rejects.toMatchObject({ code: 'PROVIDER_ERROR', cause: error });
    expect(reported(logs)).toEqual([]);
  });
});
