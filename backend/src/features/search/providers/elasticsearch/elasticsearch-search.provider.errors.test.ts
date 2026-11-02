// src/features/search/providers/elasticsearch/elasticsearch-search.provider.errors.test.ts

/**
 * When Elasticsearch fails, the search error keeps the client's error as its cause, so
 * the API can say what happened (the cluster is down, it timed out) instead of nothing.
 */

import { errors as esErrors } from '@elastic/elasticsearch';
import { describe, expect, it, vi } from 'vitest';

import { SearchError } from '../../search.types';

const connectionRefused = vi.hoisted(() => ({ error: undefined as unknown }));
vi.mock('./elasticsearch.client', () => ({
    getElasticsearchClient: () => ({ search: async () => { throw connectionRefused.error; } }),
}));

import { ElasticsearchSearchProvider } from './elasticsearch-search.provider';

describe('Elasticsearch search failures', () => {
    it('keep the client error as the cause', async () => {
        const clientError = new esErrors.ConnectionError('', { body: null, statusCode: 0, headers: {}, meta: {}, warnings: null } as never);
        connectionRefused.error = clientError;

        const thrown = await new ElasticsearchSearchProvider()
            .search({
                context: { indexName: 'products', searchableFields: [], defaultResponseFields: [], facetableFields: [] },
                request: { query: 'linen shirt' },
                searchType: 'lexical',
            } as never)
            .catch((e: unknown) => e);

        expect(thrown).toBeInstanceOf(SearchError);
        expect((thrown as SearchError).code).toBe('PROVIDER_ERROR');
        expect((thrown as SearchError).cause).toBe(clientError);
    });
});
