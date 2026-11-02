// src/features/search/providers/azure-ai-search/azure-search.provider.errors.test.ts

/**
 * When Azure AI Search fails, the search error keeps Azure's error as its cause, so the
 * API can say what happened (the key was rejected, a field is invalid).
 */

import { describe, expect, it, vi } from 'vitest';

import { SearchError } from '../../search.types';

const azure = vi.hoisted(() => ({ error: undefined as unknown }));
vi.mock('./azure-client', () => ({
    getSearchClient: () => ({ search: async () => { throw azure.error; } }),
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
});
