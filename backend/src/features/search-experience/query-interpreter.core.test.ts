import { describe, it, expect } from 'vitest';

import {
    buildInterpreterPrompt,
    parseInterpretation,
    shouldInterpret,
    toParameterContext,
} from './query-interpreter.core';

import type { FieldConstraint } from '@/features/pipeline/v2/parameter-context.types';

// ============================================================================
// HELPERS
// ============================================================================

function constraint(overrides: Partial<FieldConstraint> & { fieldName: string }): FieldConstraint {
    return {
        fieldType: 'text',
        isFilterable: true,
        isFacetable: true,
        validValues: [],
        ...overrides,
    };
}

const CONSTRAINTS: Record<string, FieldConstraint> = {
    gender: constraint({ fieldName: 'gender', validValues: ['Men', 'Women', 'Unisex'] }),
    minPrice: constraint({ fieldName: 'minPrice', fieldType: 'number', isFacetable: false }),
    secret: constraint({ fieldName: 'secret', isFilterable: false }),
};

// ============================================================================
// GATING
// ============================================================================

describe('shouldInterpret', () => {
    it('interprets a phrase at or above the word threshold', () => {
        expect(shouldInterpret('men t-shirt below 110', 3)).toBe(true);
    });

    it('skips a bare keyword lookup', () => {
        // Not worth an LLM round trip on every keystroke.
        expect(shouldInterpret('sweatshirt', 3)).toBe(false);
        expect(shouldInterpret('blue shirt', 3)).toBe(false);
    });

    it('still interprets a short phrase that carries a comparison', () => {
        expect(shouldInterpret('under $50', 3)).toBe(true);
        expect(shouldInterpret('over 4', 3)).toBe(true);
    });

    it('does not treat a number alone as a comparison', () => {
        expect(shouldInterpret('shirt 2024', 3)).toBe(false);
    });

    it('respects a configured threshold', () => {
        expect(shouldInterpret('blue shirt', 2)).toBe(true);
    });
});

// ============================================================================
// PROMPT
// ============================================================================

describe('buildInterpreterPrompt', () => {
    it('lists filterable fields with their real values', () => {
        // Grounding in actual values is what turns "mens" into "Men".
        const prompt = buildInterpreterPrompt(CONSTRAINTS);

        expect(prompt).toContain('gender (text)');
        expect(prompt).toContain('"Men"');
        expect(prompt).toContain('minPrice (number)');
    });

    it('omits fields that cannot be filtered', () => {
        const prompt = buildInterpreterPrompt(CONSTRAINTS);

        expect(prompt).not.toContain('secret');
    });

    it('teaches the paired-range rule', () => {
        // The whole point: "under $X" must filter the lower bound.
        const prompt = buildInterpreterPrompt(CONSTRAINTS);

        expect(prompt).toContain('minPrice <= X');
        expect(prompt).toContain('maxPrice >= X');
    });

    it('teaches the match-all sentinel for a filter-only interpretation', () => {
        // The query and the filters are ANDed. A leftover word like "price" has
        // to be found in the document's text too, which excludes the very product
        // the identifier filter just selected — measured as 0 lexical hits.
        const prompt = buildInterpreterPrompt(CONSTRAINTS);

        expect(prompt).toContain('query "*", filters [sku eq "08011-M"]');
        expect(prompt).not.toContain('query "price"');
    });

    it('tells the model to filter on exact identifiers', () => {
        // Without this the model reads rule 3's "not in the listed values" as
        // covering fields that have no listed values at all — which is every
        // high-cardinality identifier — and leaves the code in the query text,
        // where a keyword field can never match it.
        const prompt = buildInterpreterPrompt(CONSTRAINTS);

        expect(prompt).toContain('Exact identifiers');
        expect(prompt).toContain('sku eq "08011-M"');
    });

    it('scopes the unknown-value rule to fields that list values', () => {
        const prompt = buildInterpreterPrompt(CONSTRAINTS);

        expect(prompt).toContain('only to fields that have valid values listed');
    });

    it('appends custom instructions when configured', () => {
        const prompt = buildInterpreterPrompt(CONSTRAINTS, 'Prefer in-stock items.');

        expect(prompt).toContain('Prefer in-stock items.');
    });
});

// ============================================================================
// PARSING
// ============================================================================

describe('parseInterpretation', () => {
    it('parses a query and filters', () => {
        const result = parseInterpretation(
            JSON.stringify({
                query: 't-shirt',
                filters: [
                    { field: 'gender', operator: 'eq', value: 'Men' },
                    { field: 'minPrice', operator: 'lte', value: 110 },
                ],
            }),
            'men t-shirt below $110',
        );

        expect(result).toEqual({
            query: 't-shirt',
            filters: [
                { field: 'gender', operator: 'eq', value: 'Men' },
                { field: 'minPrice', operator: 'lte', value: 110 },
            ],
        });
    });

    it('falls back to match-all when the query is empty but filters were extracted', () => {
        // Restoring the original sentence here would AND its words back in and
        // exclude the document the filter selected.
        const result = parseInterpretation(
            JSON.stringify({ query: '', filters: [{ field: 'sku', operator: 'eq', value: '08011-M' }] }),
            "What's the price of SKU 08011-M?",
        );

        expect(result).toEqual({
            query: '*',
            filters: [{ field: 'sku', operator: 'eq', value: '08011-M' }],
        });
    });

    it('falls back to the original phrase when nothing was extracted at all', () => {
        // With no filters to narrow on, match-all would return the whole index.
        const result = parseInterpretation(
            JSON.stringify({ query: '   ', filters: [] }),
            'waterproof jackets',
        );

        expect(result).toEqual({ query: 'waterproof jackets', filters: [] });
    });

    it('coerces numeric strings, including currency symbols', () => {
        // Models return "$110" despite instructions; a string where a range query
        // expects a number matches nothing.
        const result = parseInterpretation(
            JSON.stringify({ query: 'shirt', filters: [{ field: 'minPrice', operator: 'lte', value: '$110' }] }),
            'shirt under $110',
        );

        expect(result?.filters[0].value).toBe(110);
    });

    it('keeps genuinely textual values as strings', () => {
        const result = parseInterpretation(
            JSON.stringify({ query: 'shirt', filters: [{ field: 'gender', operator: 'eq', value: 'Men' }] }),
            'mens shirt',
        );

        expect(result?.filters[0].value).toBe('Men');
    });

    it('falls back to the original query when the model returns an empty one', () => {
        // An empty query would match the entire index.
        const result = parseInterpretation(
            JSON.stringify({ query: '   ', filters: [] }),
            'mens shirt',
        );

        expect(result?.query).toBe('mens shirt');
    });

    it('drops malformed filter entries rather than failing the whole parse', () => {
        const result = parseInterpretation(
            JSON.stringify({
                query: 'shirt',
                filters: [
                    { field: 'gender', operator: 'eq', value: 'Men' },
                    { field: 'gender' },
                    { field: 'x', operator: 'explode', value: 1 },
                    null,
                    { field: 'y', operator: 'eq', value: null },
                ],
            }),
            'shirt',
        );

        expect(result?.filters).toEqual([{ field: 'gender', operator: 'eq', value: 'Men' }]);
    });

    it('returns null on unparseable output so the caller can fall back', () => {
        expect(parseInterpretation('not json', 'shirt')).toBeNull();
        expect(parseInterpretation('"a string"', 'shirt')).toBeNull();
    });

    it('tolerates a missing filters array', () => {
        const result = parseInterpretation(JSON.stringify({ query: 'shirt' }), 'shirt');

        expect(result).toEqual({ query: 'shirt', filters: [] });
    });
});

// ============================================================================
// CONTEXT
// ============================================================================

describe('toParameterContext', () => {
    it('marks a populated context as enriched', () => {
        const ctx = toParameterContext(CONSTRAINTS);

        expect(ctx.enriched).toBe(true);
        expect(ctx.fieldConstraints.gender.validValues).toContain('Men');
    });

    it('marks an empty context as not enriched', () => {
        // validateFilters short-circuits on an empty constraint map, so filters
        // pass through untouched rather than all being dropped.
        expect(toParameterContext({}).enriched).toBe(false);
    });
});
