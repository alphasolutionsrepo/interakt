// src/features/search/providers/azure-ai-search/query-builders/query.builder.test.ts

/**
 * Azure search options builder.
 *
 * The regression these tests exist for: the app's isSearchable flag is
 * type-agnostic and defaults to true, so a numeric field like `priceAmount`
 * reached Azure's searchFields and highlight lists. Azure rejects the whole
 * request for those — "Field 'priceAmount' is not marked as 'searchable'" —
 * so one mislabelled field took down every search on the index. Anything
 * asserting a non-string field is excluded below is guarding that.
 */

import { describe, expect, it } from 'vitest';
import { buildAzureSearchOptions } from './query.builder';
import type {
    FieldConfig,
    ProviderSearchRequest,
    SearchContext,
    SearchRequest,
} from '../../../search.types';

type TestField = { fieldName: string; fieldType: string };

const field = (fieldName: string, fieldType: string): FieldConfig => ({
    fieldName,
    fieldType,
    isSearchable: true,
    isFacetable: false,
    isIndexed: true,
    includeInResponse: true,
    boostValue: 1,
});

const buildContext = (searchable: TestField[]): SearchContext => ({
    indexName: 'test-index',
    indexId: 'idx-1',
    searchProvider: 'azure-ai-search',
    searchType: 'lexical',
    searchableFields: searchable.map(f => ({
        fieldName: f.fieldName,
        fieldType: f.fieldType,
        boostValue: 1,
    })),
    facetableFields: [],
    defaultResponseFields: searchable.map(f => f.fieldName),
    allFields: new Map(searchable.map(f => [f.fieldName, field(f.fieldName, f.fieldType)])),
    language: 'en',
});

const build = (searchable: TestField[], request: Partial<SearchRequest> = {}) =>
    buildAzureSearchOptions({
        context: buildContext(searchable),
        request: { query: 'shoes', ...request } as SearchRequest,
        searchType: 'lexical',
    } as ProviderSearchRequest);

// A representative index: text fields Azure can search, plus the numeric field
// that used to break it.
const mixedIndex: TestField[] = [
    { fieldName: 'title', fieldType: 'text' },
    { fieldName: 'brand', fieldType: 'keyword' },
    { fieldName: 'keywords', fieldType: 'array' },
    { fieldName: 'priceAmount', fieldType: 'number' },
    { fieldName: 'releasedAt', fieldType: 'date' },
    { fieldName: 'inStock', fieldType: 'boolean' },
];

describe('non-searchable field types', () => {
    it('excludes them from highlightFields', () => {
        const options = build(mixedIndex, { highlight: { preTag: '<em>', postTag: '</em>' } });

        expect(options.highlightFields).toBe('title,brand,keywords');
        expect(options.highlightFields).not.toContain('priceAmount');
    });

    it('excludes them from searchFields', () => {
        const options = build(mixedIndex);

        expect(options.searchFields).toEqual(['title', 'brand', 'keywords']);
    });

    it('excludes them from an explicitly requested highlight list', () => {
        const options = build(mixedIndex, {
            highlight: { fields: ['title', 'priceAmount'], preTag: '<em>', postTag: '</em>' },
        });

        expect(options.highlightFields).toBe('title');
    });

    it('drops a highlight field that is not in the index at all', () => {
        const options = build(mixedIndex, { highlight: { fields: ['title', 'nope'] } });

        expect(options.highlightFields).toBe('title');
    });

    it('omits both params entirely when nothing searchable remains', () => {
        const options = build(
            [
                { fieldName: 'priceAmount', fieldType: 'number' },
                { fieldName: 'inStock', fieldType: 'boolean' },
            ],
            { highlight: { preTag: '<em>', postTag: '</em>' } },
        );

        expect(options.highlightFields).toBeUndefined();
        expect(options.highlightPreTag).toBeUndefined();
        expect(options.highlightPostTag).toBeUndefined();
        expect(options.searchFields).toBeUndefined();
    });
});

describe('searchable field types', () => {
    it('keeps every string-backed type', () => {
        const options = build([
            { fieldName: 'title', fieldType: 'text' },
            { fieldName: 'brand', fieldType: 'keyword' },
            { fieldName: 'body', fieldType: 'html' },
            { fieldName: 'notes', fieldType: 'markdown' },
            { fieldName: 'link', fieldType: 'url' },
            { fieldName: 'contact', fieldType: 'email' },
            { fieldName: 'keywords', fieldType: 'array' },
        ]);

        expect(options.searchFields).toEqual([
            'title', 'brand', 'body', 'notes', 'link', 'contact', 'keywords',
        ]);
    });

    it('applies the requested highlight tags', () => {
        const options = build(mixedIndex, { highlight: { preTag: '<em>', postTag: '</em>' } });

        expect(options.highlightPreTag).toBe('<em>');
        expect(options.highlightPostTag).toBe('</em>');
    });
});
