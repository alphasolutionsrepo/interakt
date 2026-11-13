// src/features/search/search.service.hidden-searched-fields.test.ts

/**
 * search() validates each request before the engine sees it. A request option the validation
 * doesn't know is dropped there, so this runs the real search() and checks what the engine gets,
 * and what analytics records about the filters.
 */

import { errors as esErrors } from '@elastic/elasticsearch';
import { describe, it, expect, vi } from 'vitest';

import { trackSearch } from '@/features/analytics';
import { reported, type LogLine } from '@/shared/test/log-recorder';

vi.mock('server-only', () => ({}));
const logs = vi.hoisted(() => [] as LogLine[]);
vi.mock('@/shared/logger/logger', async () => (await import('@/shared/test/log-recorder')).recordingLogger(logs));
vi.mock('@/features/ai-service', () => ({ generateEmbedding: vi.fn(async () => { throw new Error('embedding provider down'); }) }));
vi.mock('@/features/analytics', () => ({ trackSearch: vi.fn() }));
vi.mock('./search.tracing', () => ({
  traceSearch: (_meta: unknown, run: (span: { setAttribute: () => void }) => unknown) => run({ setAttribute: vi.fn() }),
}));
vi.mock('./response.normalizer', () => ({ normalizeSearchResponse: () => ({ hits: [], total: { value: 0 } }) }));
vi.mock('@/features/search-index/search-index.service', () => ({
  getSearchIndexById: vi.fn(async () => ({ id: 'idx', name: 'products', isActive: true, status: 'active' })),
}));
vi.mock('./search-context.builder', () => ({
  buildSearchContext: () => ({ indexName: 'products', searchType: 'lexical', searchProvider: 'elasticsearch', embedding: { fieldName: 'v', dimensions: 3 } }),
  supportsSemanticSearch: () => true,
}));
const { engineSearch, engineGetDocument, engineAutocomplete } = vi.hoisted(() => ({
  engineSearch: vi.fn(async () => ({ hits: [], total: 0 })),
  engineGetDocument: vi.fn(),
  engineAutocomplete: vi.fn(),
}));
vi.mock('./providers', () => {
  const engine = { name: 'elasticsearch', search: engineSearch, getDocument: engineGetDocument, autocomplete: engineAutocomplete };
  return { providerRegistry: { list: () => [engine], get: () => engine }, initializeSearchProviders: vi.fn() };
});

import { autocompleteById, getDocumentByIdFromIndex, searchById } from './search.service';
import { getSearchIndexById } from '@/features/search-index/search-index.service';
import { SearchError } from './search.types';
import { describeError } from '@/shared/api/response';

describe('search request options', () => {
  it('passes a request for hidden searched fields on to the engine', async () => {
    await searchById('idx', { query: 'ABC-123', includeHiddenSearchedFields: true });

    expect(engineSearch).toHaveBeenCalledWith(
      expect.objectContaining({ request: expect.objectContaining({ includeHiddenSearchedFields: true }) }),
    );
  });
});

describe('filters recorded for analytics', () => {
  // A group's own field is not filtered on; brand appears twice
  const filters = [{
    field: 'any', operator: 'or' as const,
    filters: [{ field: 'brand', operator: 'eq' as const, value: 'x' }, { field: 'brand', operator: 'eq' as const, value: 'y' }],
  }];

  it('records each field once and counts every filter, after a search', async () => {
    await searchById('idx', { query: 'shirt', filters });
    expect(vi.mocked(trackSearch).mock.lastCall?.[0]).toMatchObject({ filterFields: ['brand'], filterCount: 2 });
  });

  it('counts every filter when the search fails', async () => {
    engineSearch.mockRejectedValueOnce(new Error('engine down'));
    await expect(searchById('idx', { query: 'shirt', filters })).rejects.toThrow();
    expect(vi.mocked(trackSearch).mock.lastCall?.[0]).toMatchObject({ filterCount: 2, success: false });
  });
});

describe('a failure passed on without a warning or error of its own: whoever answers the caller logs it', () => {
  it('a failed search', async () => {
    logs.length = 0;
    engineSearch.mockRejectedValueOnce(new Error('engine down'));
    await expect(searchById('idx', { query: 'shirt' })).rejects.toThrow();
    expect(reported(logs)).toEqual([]);
  });

  it('a query embedding that could not be made', async () => {
    vi.mocked(getSearchIndexById).mockResolvedValueOnce({ id: 'idx', name: 'products', isActive: true, status: 'active', aiProviderId: 'p', aiModelId: 'm' } as never);
    logs.length = 0;
    await expect(searchById('idx', { query: 'shirt', searchType: 'semantic' })).rejects.toMatchObject({ code: 'EMBEDDING_FAILED' });
    expect(reported(logs)).toEqual([]);
  });

  it('a failed document lookup', async () => {
    engineGetDocument.mockResolvedValueOnce({ found: false, error: 'ConnectionError', cause: new Error('connect ECONNREFUSED') });
    logs.length = 0;
    await expect(getDocumentByIdFromIndex('idx', 'PROD-1')).rejects.toMatchObject({ code: 'PROVIDER_ERROR' });
    expect(reported(logs)).toEqual([]);
  });

  it('a failed autocomplete', async () => {
    vi.mocked(getSearchIndexById).mockResolvedValueOnce({
      id: 'idx', name: 'products', isActive: true, status: 'active', fields: [{ fieldName: 'title', isAutocomplete: true, isSearchable: true }],
    } as never);
    engineAutocomplete.mockRejectedValueOnce(new Error('engine down'));
    logs.length = 0;
    await expect(autocompleteById('idx', { query: 'shi' })).rejects.toMatchObject({ code: 'PROVIDER_ERROR' });
    expect(reported(logs)).toEqual([]);
  });
});

describe('a search the engine refused', () => {
  it('passes on a SearchError from the providers\' own copy of the class, not a server error', async () => {
    // Providers are registered from the instrumentation bundle, with its own SearchError
    class OtherCopy extends Error {
      code = 'INVALID_FILTER';
      constructor(message: string) {
        super(message);
        Object.assign(this, { [Symbol.for('interakt.SearchError')]: true });
      }
    }
    const refused = new OtherCopy('"abc" isn\'t a valid value for rating');
    engineSearch.mockRejectedValueOnce(refused);

    await expect(searchById('idx', { query: 'shirt' })).rejects.toBe(refused);
    expect(vi.mocked(trackSearch).mock.lastCall?.[0]).toMatchObject({ errorCode: 'INVALID_FILTER' });
  });

  it('records what the engine said next to what the caller was told', async () => {
    const said = new SearchError('failed to create query: For input string: "abc"', 'INVALID_QUERY');
    engineSearch.mockRejectedValueOnce(new SearchError('"abc" isn\'t a valid value for rating', 'INVALID_FILTER', {}, { cause: said }));

    await expect(searchById('idx', { query: 'shirt' })).rejects.toThrow();
    expect(vi.mocked(trackSearch).mock.lastCall?.[0]).toMatchObject({
      errorMessage: '"abc" isn\'t a valid value for rating (failed to create query: For input string: "abc")',
    });
  });
});


describe('a semantic search query embedding', () => {
  it("asks for the index's vector size, so a model with longer vectors still fits the index", async () => {
    const { generateEmbedding } = await import('@/features/ai-service');
    vi.mocked(generateEmbedding).mockResolvedValueOnce([0.1, 0.2, 0.3]);
    vi.mocked(getSearchIndexById).mockResolvedValueOnce({ id: 'idx', name: 'products', isActive: true, status: 'active', aiProviderId: 'p', aiModelId: 'm' } as never);

    await searchById('idx', { query: 'shirt', searchType: 'semantic' });

    // 3 is the embedding size of the mocked index context above
    expect(generateEmbedding).toHaveBeenLastCalledWith('shirt', expect.objectContaining({ dimensions: 3, feature: 'search_query' }));
  });
});

describe('a provider that is rate limiting, as the caller is told', () => {
  const rateLimited = () => Object.assign(new Error('429 Too Many Requests'), { name: 'AdapterError', providerKey: 'openai', statusCode: 429 });

  it('a query embedding it refused is explained as a rate limit, with what to do', async () => {
    const { generateEmbedding } = await import('@/features/ai-service');
    vi.mocked(generateEmbedding).mockRejectedValueOnce(rateLimited());
    vi.mocked(getSearchIndexById).mockResolvedValueOnce({ id: 'idx', name: 'products', isActive: true, status: 'active', aiProviderId: 'p', aiModelId: 'm' } as never);

    const failed = await searchById('idx', { query: 'shirt', searchType: 'semantic' }).catch((e: unknown) => e);
    expect(failed).toMatchObject({ code: 'EMBEDDING_FAILED' });
    expect(describeError(failed).body).toMatchObject({ code: 'UPSTREAM_RATE_LIMITED', hint: expect.any(String) });
  });

  it('autocomplete the engine refused is explained as a rate limit, with what to do', async () => {
    vi.mocked(getSearchIndexById).mockResolvedValueOnce({ id: 'idx', name: 'products', isActive: true, status: 'active', fields: [{ fieldName: 'title', isAutocomplete: true, isSearchable: true }] } as never);
    engineAutocomplete.mockRejectedValueOnce(new esErrors.ResponseError({ body: { error: { type: 'es_rejected_execution_exception', reason: 'rejected execution' }, status: 429 }, statusCode: 429, headers: {}, meta: {} as never, warnings: null }));

    const failed = await autocompleteById('idx', { query: 'shi' }).catch((e: unknown) => e);
    expect(failed).toMatchObject({ code: 'PROVIDER_ERROR' });
    expect(describeError(failed).body).toMatchObject({ code: 'UPSTREAM_RATE_LIMITED', hint: expect.any(String) });
  });
});

describe('admin autocomplete on an index that is not ready', () => {
  it("answers with the index's own reason, as a search does, not as a provider failure", async () => {
    vi.mocked(getSearchIndexById).mockResolvedValueOnce({ id: 'idx', name: 'products', isActive: false, status: 'active', fields: [] } as never);

    const failed = await autocompleteById('idx', { query: 'shi' }).catch((e: unknown) => e);
    expect(failed).toBeInstanceOf(SearchError);
    expect((failed as SearchError).code).not.toBe('PROVIDER_ERROR');
    expect(describeError(failed).body.message).not.toBe(describeError(new Error('x')).body.message);
  });
});
