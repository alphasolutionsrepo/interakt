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

describe('hidden searched fields in the response', () => {
    it('returns the shown fields plus the searched fields, never the embedding, when asked', () => {
        expect(source({ includeHiddenSearchedFields: true })).toEqual({
            includes: ['name', 'price', 'sku'],
            excludes: ['content_embedding'],
        });
    });

    it('returns only the shown fields otherwise', () => {
        expect(source({})).toEqual({ includes: ['name', 'price'], excludes: ['content_embedding'] });
    });

    it('adds nothing for an explicit empty field list, as without the request', () => {
        expect(source({ includeHiddenSearchedFields: true, includeFields: [] })).toEqual(source({ includeFields: [] }));
    });

    it('adds nothing when no fields are shown, so the response is as before', () => {
        const body = buildLexicalSearchBody(
            { query: 'ABC-123', includeHiddenSearchedFields: true } as SearchRequest,
            { ...context, defaultResponseFields: [] },
        );

        expect(body._source).toEqual({ includes: [], excludes: ['content_embedding'] });
    });
});

describe('multi_match leniency', () => {
    // A field whose type cannot hold the query text (a number asked for "test")
    // used to fail the whole request: "failed to create query: For input string".
    it('marks the best_fields and cross_fields clauses lenient', () => {
        const body = buildLexicalSearchBody({ query: 'test' } as SearchRequest, context);
        const json = JSON.stringify(body.query);
        const clauses = [...json.matchAll(/"multi_match":\{[^}]*\}/g)].map(m => m[0]);

        const typed = (type: string) => clauses.filter(c => c.includes(`"type":"${type}"`));
        expect(typed('best_fields')).toHaveLength(1);
        expect(typed('cross_fields')).toHaveLength(1);
        expect(typed('best_fields')[0]).toContain('"lenient":true');
        expect(typed('cross_fields')[0]).toContain('"lenient":true');
    });
});
