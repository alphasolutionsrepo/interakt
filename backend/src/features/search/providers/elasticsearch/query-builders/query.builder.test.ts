// src/features/search/providers/elasticsearch/query-builders/query.builder.test.ts

import { describe, expect, it } from 'vitest';
import { buildLexicalSearchBody } from './query.builder';
import type { SearchContext, SearchRequest } from '../../../search.types';

// sku is searched but kept out of responses; price is shown but not searched
const context = {
    indexName: 'test-index',
    indexId: 'idx-1',
    searchProvider: 'elasticsearch',
    searchType: 'hybrid',
    searchableFields: [
        { fieldName: 'name', fieldType: 'text', boostValue: 1 },
        { fieldName: 'sku', fieldType: 'keyword', boostValue: 1 },
    ],
    facetableFields: [],
    defaultResponseFields: ['name', 'price'],
    allFields: new Map(),
    language: 'en',
    embedding: { fieldName: 'content_embedding' },
} as unknown as SearchContext;

const source = (request: Partial<SearchRequest>) =>
    buildLexicalSearchBody({ query: 'ABC-123', ...request } as SearchRequest, context)._source;

describe('searched fields in the response', () => {
    it('returns the shown fields plus the searched fields, never the embedding, when asked', () => {
        expect(source({ includeSearchedFields: true })).toEqual({
            includes: ['name', 'price', 'sku'],
            excludes: ['content_embedding'],
        });
    });

    it('returns only the shown fields otherwise', () => {
        expect(source({})).toEqual({ includes: ['name', 'price'], excludes: ['content_embedding'] });
    });
});
