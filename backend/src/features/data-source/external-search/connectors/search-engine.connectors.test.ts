// src/features/data-source/external-search/connectors/search-engine.connectors.test.ts

/**
 * Elasticsearch hits carry the engine's own _id, so its connector says a filter on _id finds a
 * hit by its id, and passes that filter to the engine. Azure AI Search hits take their id from a
 * field, so its connector has no such field.
 */

import { describe, it, expect, vi } from 'vitest';

const { callElasticsearchSearch } = vi.hoisted(() => ({
  callElasticsearchSearch: vi.fn(async () => ({ success: true, data: { results: [], totalCount: 0, took: 0 } })),
}));
vi.mock('../engines/elasticsearch', () => ({ callElasticsearchSearch }));

import { azureAISearchConnector, elasticsearchConnector } from './search-engine.connectors';

const connection = { provider: 'elasticsearch', endpoint: 'http://localhost:9200', indexName: 'shop', authType: 'none' } as never;

describe('connector document ids', () => {
  it('lets Elasticsearch filter on its own _id, and sends that filter to the engine', async () => {
    const field = elasticsearchConnector.capabilities.documentIdField;
    expect(field).toBe('_id');

    const result = await elasticsearchConnector.search(
      connection,
      { query: '*', offset: 0, limit: 1, filters: [{ field: field!, operator: 'eq', value: '1UQ9eqEB' }] },
      [{ name: 'productId', type: 'keyword' } as never],
    );

    expect(result.unappliedFilters).toEqual([]);
    expect(callElasticsearchSearch).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ filterClauses: [{ term: { _id: '1UQ9eqEB' } }] }),
    );
  });

  it('has no engine id field on Azure AI Search, whose hits take their id from a field', () => {
    expect(azureAISearchConnector.capabilities.documentIdField).toBeUndefined();
  });
});
