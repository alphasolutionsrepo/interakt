// src/features/search/providers/azure-ai-search/azure-search.provider.errors.test.ts

/**
 * When Azure AI Search fails, the search error keeps Azure's error as its cause, so the
 * API can say what happened (the key was rejected, a field is invalid).
 */

import { describe, expect, it, vi } from 'vitest';

import { SearchError } from '../../search.types';

import { reported, type LogLine } from '@/shared/test/log-recorder';

const logs = vi.hoisted(() => [] as LogLine[]);
vi.mock('@/shared/logger/logger', async () => (await import('@/shared/test/log-recorder')).recordingLogger(logs));

const azure = vi.hoisted(() => ({ error: undefined as unknown }));
vi.mock('./azure-client', () => ({
    getSearchClient: () => ({ search: async () => { throw azure.error; }, suggest: async () => { throw azure.error; } }),
    checkAzureHealth: vi.fn(),
}));

import { AzureSearchProvider } from './azure-search.provider';

describe('Azure AI Search failures', () => {
    it('keep the Azure error as the cause', async () => {
        const restError = Object.assign(new Error('Access denied'), { name: 'RestError', statusCode: 403 });
        azure.error = restError;

        const thrown = await new AzureSearchProvider()
            .search({
                context: { indexName: 'products', searchableFields: [], defaultResponseFields: [], facetableFields: [] },
                request: { query: 'linen shirt' },
                searchType: 'lexical',
            } as never)
            .catch((e: unknown) => e);

        expect(thrown).toBeInstanceOf(SearchError);
        expect((thrown as SearchError).cause).toBe(restError);
    });

    it('are passed on without a warning or error of their own: whoever answers the caller logs them', async () => {
        logs.length = 0;
        azure.error = Object.assign(new Error('Access denied'), { name: 'RestError', statusCode: 403 });
        await new AzureSearchProvider()
            .search({
                context: { indexName: 'products', searchableFields: [], defaultResponseFields: [], facetableFields: [] },
                request: { query: 'linen shirt' },
                searchType: 'lexical',
            } as never)
            .catch(() => undefined);
        expect(reported(logs)).toEqual([]);
    });

    describe('a search Azure AI Search refuses (400)', () => {
        const refusal = (message: string) => Object.assign(new Error(message), { name: 'RestError', statusCode: 400 });
        const search = (request: Record<string, unknown>) => new AzureSearchProvider()
            .search({
                context: { indexName: 'products', searchableFields: [], defaultResponseFields: [], facetableFields: [], allFields: new Map() },
                request: { query: 'shirt', ...request },
                searchType: 'lexical',
            } as never)
            .catch((e: unknown) => e);

        it('is passed on without a warning or error of its own', async () => {
            logs.length = 0;
            azure.error = refusal("Invalid expression: Could not find a property named 'colour' on type 'search.document'.");
            await search({ filters: [{ field: 'colour', operator: 'eq', value: 'red' }] });
            expect(reported(logs)).toEqual([]);
        });

        it('names the filter it could not apply, as Elasticsearch does', async () => {
            azure.error = refusal("Invalid expression: Could not find a property named 'colour' on type 'search.document'.");
            const thrown = await search({ filters: [{ field: 'colour', operator: 'eq', value: 'red' }] });
            expect(thrown).toMatchObject({ code: 'INVALID_FILTER', status: 400, details: { fields: ['colour'] } });
        });

        it('answers a refusal that names nothing in the request as a failure, keeping the cause', async () => {
            const error = refusal("Invalid expression: A binary operator with incompatible types was detected. Found operand types 'Edm.Double' and 'Edm.String'.");
            azure.error = error;
            const thrown = await search({ filters: [{ field: 'rating', operator: 'gt', value: 4 }] });
            expect(thrown).toMatchObject({ code: 'PROVIDER_ERROR', cause: error });
        });
    });
});

describe('Azure AI Search autocomplete failures', () => {
    it.each([
        ['the suggest call', () => Object.assign(new Error('Access denied'), { name: 'RestError', statusCode: 403 })],
        ['the search it falls back to without a suggester', () => Object.assign(new Error('The specified suggester name sg does not exist in this index definition.'), { name: 'RestError', statusCode: 400 })],
    ])('in %s are passed on with the Azure error as the cause, without logging an error', async (_case, failure) => {
        logs.length = 0;
        azure.error = failure();

        const thrown = await new AzureSearchProvider().autocomplete('products', 'lin', ['name']).catch((e: unknown) => e);

        expect(thrown).toBeInstanceOf(SearchError);
        expect((thrown as SearchError).cause).toBe(azure.error);
        expect(reported(logs).filter((l) => l.level === 'error')).toEqual([]);
    });
});
