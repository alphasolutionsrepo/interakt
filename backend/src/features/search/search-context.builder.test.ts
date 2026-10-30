// src/features/search/search-context.builder.test.ts

/**
 * Searchable field selection.
 *
 * A number, date or boolean field flagged searchable reached multi_match and
 * Elasticsearch failed every query on the index with
 * "failed to create query: For input string". The flag is ignored for those
 * types here, so an index with stale configuration keeps working.
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('@/shared/logger/logger', () => ({
    createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { buildSearchContext } from './search-context.builder';
import type { SearchIndexComplete } from '@/features/search-index';

function field(overrides: Record<string, unknown>) {
    return {
        isSearchable: true,
        isIndexed: true,
        isMapped: true,
        isFacetable: false,
        includeInResponse: false,
        boostValue: 1,
        customAnalyzer: null,
        transformConfig: null,
        ...overrides,
    };
}

function index(fields: Record<string, unknown>[]): SearchIndexComplete {
    return {
        id: 'idx-1',
        name: 'pets',
        searchProvider: 'elasticsearch',
        searchType: 'keyword',
        language: 'en',
        fields,
    } as unknown as SearchIndexComplete;
}

describe('buildSearchContext — searchable fields', () => {
    it('drops number, date and boolean fields even when flagged searchable', () => {
        const context = buildSearchContext(index([
            field({ fieldName: 'name', fieldType: 'text' }),
            field({ fieldName: 'breed', fieldType: 'keyword' }),
            field({ fieldName: 'tags', fieldType: 'array' }),
            field({ fieldName: 'age', fieldType: 'number' }),
            field({ fieldName: 'birthDate', fieldType: 'date' }),
            field({ fieldName: 'adopted', fieldType: 'boolean' }),
        ]));

        expect(context.searchableFields.map(f => f.fieldName)).toEqual(['name', 'breed', 'tags']);
    });

    it('still respects the flag itself on text-like fields', () => {
        const context = buildSearchContext(index([
            field({ fieldName: 'name', fieldType: 'text' }),
            field({ fieldName: 'internalNote', fieldType: 'text', isSearchable: false }),
        ]));

        expect(context.searchableFields.map(f => f.fieldName)).toEqual(['name']);
    });
});
