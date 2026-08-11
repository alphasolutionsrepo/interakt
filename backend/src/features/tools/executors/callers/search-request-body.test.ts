// src/features/tools/executors/callers/search-request-body.test.ts

/**
 * Asserts that filters and sort reach the provider request body.
 *
 * This is the seam that was broken: both callers accepted a search input, built a request
 * body, and never included the caller's filters — so a filtered search was indistinguishable
 * from an unfiltered one at every layer above. Unit tests on the translation alone would
 * still pass with the wiring missing, which is the shape of bug worth a dedicated test.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { callAzureAISearch } from './azure-ai-search';
import { callElasticsearchSearch } from './elasticsearch';

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ value: [], hits: { hits: [], total: { value: 0 } } }),
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

/** The JSON body of the single request the caller made. */
function sentBody(): Record<string, unknown> {
  expect(fetchMock).toHaveBeenCalledOnce();
  return JSON.parse(fetchMock.mock.calls[0][1].body as string);
}

const AZURE = { endpoint: 'https://acme.search.windows.net', indexName: 'catalog', apiKey: 'k' };
const ES = { endpoint: 'https://es.acme.dev', indexName: 'catalog', apiKey: 'k' };

describe('callAzureAISearch', () => {
  it('sends the OData filter expression', async () => {
    await callAzureAISearch(AZURE, { query: 'sweater', maxResults: 10, filter: "brand eq 'Vesper'" });

    expect(sentBody().filter).toBe("brand eq 'Vesper'");
  });

  it('sends orderby', async () => {
    await callAzureAISearch(AZURE, { query: '', maxResults: 10, orderBy: 'published desc' });

    expect(sentBody().orderby).toBe('published desc');
  });

  it('omits both keys when neither was supplied', async () => {
    await callAzureAISearch(AZURE, { query: 'sweater', maxResults: 10 });

    const body = sentBody();
    expect(body).not.toHaveProperty('filter');
    expect(body).not.toHaveProperty('orderby');
  });
});

describe('callElasticsearchSearch', () => {
  it('ANDs filter clauses into the query', async () => {
    await callElasticsearchSearch(ES, {
      query: 'sweater',
      maxResults: 10,
      searchFields: 'title',
      filterClauses: [{ term: { 'brand.keyword': 'Vesper' } }],
    });

    expect(sentBody().query).toEqual({
      bool: {
        must: { multi_match: { query: 'sweater', fields: ['title'] } },
        filter: [{ term: { 'brand.keyword': 'Vesper' } }],
      },
    });
  });

  it('sends sort', async () => {
    await callElasticsearchSearch(ES, {
      query: '',
      maxResults: 10,
      sort: [{ published: { order: 'desc' } }],
    });

    expect(sentBody().sort).toEqual([{ published: { order: 'desc' } }]);
  });

  it('keeps the lookup term filter alongside translated filters', async () => {
    // lookup-by-id shares this caller; its term filter predates the filter support and
    // must not be displaced by it.
    await callElasticsearchSearch(ES, {
      query: '',
      maxResults: 1,
      termFilter: { field: 'sku', value: 'ABC-1' },
      filterClauses: [{ term: { 'brand.keyword': 'Vesper' } }],
    });

    const query = sentBody().query as { bool: { filter: unknown[] } };
    expect(query.bool.filter).toEqual([
      { term: { sku: 'ABC-1' } },
      { term: { 'brand.keyword': 'Vesper' } },
    ]);
  });

  it('leaves the query unwrapped when there is nothing to filter', async () => {
    await callElasticsearchSearch(ES, { query: '', maxResults: 10 });

    const body = sentBody();
    expect(body.query).toEqual({ match_all: {} });
    expect(body).not.toHaveProperty('sort');
  });
});
