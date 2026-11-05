// src/features/search-experience/autocomplete.service.engine-failure.test.ts

/**
 * Autocomplete when the search engine fails, through the real autocomplete service and
 * Elasticsearch provider (only the client is stubbed): a visitor's type-ahead gets no
 * suggestions, quietly, and the failure is logged once with the request id; an admin
 * testing the experience gets the error. An index made without the autocomplete
 * analyzer is still asked again without it.
 */

import { errors as esErrors } from '@elastic/elasticsearch';
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
  getSearchIndexById: async () => ({ id: 'i1', name: 'shop', fields: [{ fieldName: 'name', isIndexed: true }] }),
}));
vi.mock('@/features/search-index/provider-settings.utils', () => ({ getProviderFieldSettings: () => ({ isAutocomplete: true }) }));

import { getAutocompleteSuggestions } from './autocomplete.service';

import { providerRegistry } from '@/features/search/providers';
import { ElasticsearchSearchProvider } from '@/features/search/providers/elasticsearch/elasticsearch-search.provider';

import { markAdminCaller, publicRoute } from '@/shared/api/public-route';

const experience = {
  id: 'exp',
  searchConfig: { autocomplete: { enabled: true, minLength: 1, maxSuggestions: 5 } },
  indexes: [{ searchIndexId: 'i1', searchIndex: { name: 'shop', displayName: 'Shop', isActive: true, searchProvider: 'elasticsearch' } }],
} as never;
const down = () => new esErrors.ConnectionError('connect ECONNREFUSED 127.0.0.1:9200', { meta: {} } as never);
const asVisitor = <T>(work: () => Promise<T>) => publicRoute(work)();
const asAdmin = <T>(work: () => Promise<T>) => publicRoute(async () => { markAdminCaller(); return work(); })();

// The real provider, registered as the app's startup does (its require() doesn't resolve under the test runner)
if (!providerRegistry.get('elasticsearch')) providerRegistry.register('elasticsearch', new ElasticsearchSearchProvider(), true);

beforeEach(() => { logs.length = 0; es.search.mockReset(); });

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
