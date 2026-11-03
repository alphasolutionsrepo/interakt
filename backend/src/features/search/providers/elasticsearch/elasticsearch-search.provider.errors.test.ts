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
    getElasticsearchClient: () => ({
        search: async () => { throw connectionRefused.error; },
        get: async () => { throw connectionRefused.error; },
    }),
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

    it('report a failed document lookup as a failure, not as "not found", when the error has no message', async () => {
        const clientError = new esErrors.ConnectionError('', { body: null, statusCode: 0, headers: {}, meta: {}, warnings: null } as never);
        connectionRefused.error = clientError;

        const result = await new ElasticsearchSearchProvider().getDocument('products', 'PROD-1');

        expect(result).toEqual({ found: false, error: 'ConnectionError', cause: clientError });
    });

    describe('a search Elasticsearch refuses', () => {
        // What the client throws: Elasticsearch's own body, with the reason at the root
        const refusal = (reason: string, statusCode = 400) => new esErrors.ResponseError({
            body: { error: { type: 'search_phase_execution_exception', reason: 'all shards failed', root_cause: reason ? [{ reason }] : [] }, status: statusCode },
            statusCode, headers: {}, meta: {} as never, warnings: null,
        } as never);
        const search = (request: Record<string, unknown>, searchType = 'lexical') => new ElasticsearchSearchProvider()
            .search({
                context: {
                    indexName: 'products', searchableFields: [], defaultResponseFields: [], facetableFields: [],
                    allFields: new Map([
                        ['rating', { fieldName: 'rating', fieldType: 'integer', isIndexed: true }],
                        ['title', { fieldName: 'title', fieldType: 'text', isIndexed: true }],
                    ]),
                    embedding: { fieldName: 'content_embedding', dimensions: 3 },
                },
                request: { query: 'shirt', ...request },
                searchType,
                queryEmbedding: [0.1, 0.2, 0.3],
            } as never)
            .catch((e: unknown) => e);

        it.each(['lexical', 'semantic', 'hybrid'])('names the value it could not read (%s), as an external source does', async (searchType) => {
            connectionRefused.error = refusal('failed to create query: For input string: "abc"');
            const thrown = await search({ filters: [{ field: 'rating', operator: 'gt', value: 'abc' }] }, searchType);
            expect(thrown).toMatchObject({ code: 'INVALID_FILTER', status: 400, message: '"abc" isn\'t a valid value for rating', details: { fields: ['rating'] } });
        });

        it('names a text field it was sent as field.keyword', async () => {
            connectionRefused.error = refusal('Can only use wildcard queries on keyword, text and wildcard fields - not on [title.keyword] which is of type [text]');
            const thrown = await search({ filters: [{ field: 'title', operator: 'eq', value: 'Linen shirt' }] });
            expect(thrown).toMatchObject({ code: 'INVALID_FILTER', message: "This search source can't filter on title" });
        });

        it('answers paging past the result window as the page to change', async () => {
            connectionRefused.error = refusal('Result window is too large, from + size must be less than or equal to: [10000] but was [20010].');
            const thrown = await search({ page: 1001 });
            expect(thrown).toMatchObject({ code: 'INVALID_QUERY', status: 400, message: "Results past the first 10000 can't be fetched: narrow the search or ask for an earlier page" });
        });

        it('answers an index that is gone as a failure, without naming it to the caller', async () => {
            const error = new esErrors.ResponseError({
                body: { error: { type: 'index_not_found_exception', reason: 'no such index [products]' }, status: 404 },
                statusCode: 404, headers: {}, meta: {} as never, warnings: null,
            } as never);
            connectionRefused.error = error;
            const thrown = await search({});
            expect(thrown).toMatchObject({ code: 'PROVIDER_ERROR', cause: error });
        });

        it.each([
            ['a query vector of another size', 'the query vector has a different number of dimensions [768] than the document vectors [1536]', {}],
        ])('answers %s as a failure, with what Elasticsearch said as the cause', async (_, reason, request) => {
            const error = refusal(reason);
            connectionRefused.error = error;
            const thrown = await search(request) as SearchError;
            expect(thrown).toMatchObject({ code: 'PROVIDER_ERROR', message: reason });
            expect((thrown.cause as SearchError).cause).toBe(error);
        });

        it('answers shards that failed (503) as a failure, not as a bad query', async () => {
            connectionRefused.error = refusal('', 503);
            const thrown = await search({ filters: [{ field: 'rating', operator: 'gt', value: 4 }] });
            expect(thrown).toMatchObject({ code: 'PROVIDER_ERROR' });
        });
    });
});
