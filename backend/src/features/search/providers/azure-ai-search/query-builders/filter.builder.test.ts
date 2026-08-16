// src/features/search/providers/azure-ai-search/query-builders/filter.builder.test.ts

/**
 * Azure OData filter builder.
 *
 * The regression these tests exist for: an unexpressible clause used to be
 * dropped silently, so `locale eq 'en' AND uniqueId nin [...]` collapsed to
 * `locale eq 'en'`. A filter set is a conjunction, so losing a term widens it —
 * and on delete-by-filter that emptied a production index. Anything asserting
 * "does not silently reduce" below is guarding that.
 */

import { describe, expect, it } from 'vitest';
import { buildAzureFilter, buildAzureFilterParts, type FieldTypeLookup } from './filter.builder';
import { SearchError, type FilterClause } from '../../../search.types';

const types = (entries: Record<string, string>): FieldTypeLookup =>
    new Map(Object.entries(entries).map(([name, fieldType]) => [name, { fieldType }]));

const scalars = types({ locale: 'keyword', uniqueId: 'keyword', price: 'number' });
const collections = types({ keywords: 'array' });

describe('nin', () => {
    it('ANDs ne comparisons for a scalar field', () => {
        const odata = buildAzureFilter(
            [{ field: 'uniqueId', operator: 'nin', value: ['a', 'b'] } as FilterClause],
            scalars,
        );
        expect(odata).toBe("(uniqueId ne 'a' and uniqueId ne 'b')");
    });

    it('uses all/and for a collection field', () => {
        const odata = buildAzureFilter(
            [{ field: 'keywords', operator: 'nin', value: ['x', 'y'] } as FilterClause],
            collections,
        );
        expect(odata).toBe("keywords/all(t: t ne 'x' and t ne 'y')");
    });

    // in and nin are duals; getting the inversion wrong yields a filter that
    // matches far too much, which is exactly the failure mode being guarded.
    it('is the inverse of in — or/any becomes and/all', () => {
        const clause = (operator: 'in' | 'nin'): FilterClause[] => [
            { field: 'keywords', operator, value: ['x', 'y'] } as FilterClause,
        ];
        expect(buildAzureFilter(clause('in'), collections)).toBe(
            "keywords/any(t: t eq 'x' or t eq 'y')",
        );
        expect(buildAzureFilter(clause('nin'), collections)).toBe(
            "keywords/all(t: t ne 'x' and t ne 'y')",
        );
    });

    it('escapes quotes in values', () => {
        const odata = buildAzureFilter(
            [{ field: 'uniqueId', operator: 'nin', value: ["it's"] } as FilterClause],
            scalars,
        );
        expect(odata).toBe("(uniqueId ne 'it''s')");
    });

    it('drops an empty list rather than emitting a filter that matches everything', () => {
        const { odata, dropped } = buildAzureFilterParts(
            [{ field: 'uniqueId', operator: 'nin', value: [] } as FilterClause],
            scalars,
        );
        expect(odata).toBeUndefined();
        expect(dropped).toHaveLength(1);
    });
});

describe('the prune filter (regression)', () => {
    const pruneFilter: FilterClause[] = [
        { field: 'locale', operator: 'eq', value: 'en' } as FilterClause,
        { field: 'uniqueId', operator: 'nin', value: ['en_cases_convena'] } as FilterClause,
    ];

    it('keeps both clauses — never reduces to locale alone', () => {
        const odata = buildAzureFilter(pruneFilter, scalars);
        expect(odata).toBe("locale eq 'en' and (uniqueId ne 'en_cases_convena')");
        expect(odata).not.toBe("locale eq 'en'");
    });

    it('throws rather than silently narrowing to the surviving clause', () => {
        const withBadOperator: FilterClause[] = [
            { field: 'locale', operator: 'eq', value: 'en' } as FilterClause,
            { field: 'uniqueId', operator: 'notAnOperator', value: ['x'] } as unknown as FilterClause,
        ];
        expect(() => buildAzureFilter(withBadOperator, scalars)).toThrow(SearchError);
    });
});

describe('strict vs lenient', () => {
    const unsupported: FilterClause[] = [
        { field: 'locale', operator: 'wat', value: 'en' } as unknown as FilterClause,
    ];

    it('buildAzureFilter throws on an unsupported operator', () => {
        expect(() => buildAzureFilter(unsupported, scalars)).toThrow(/not supported/);
    });

    it('buildAzureFilterParts reports instead of throwing', () => {
        const { odata, dropped } = buildAzureFilterParts(unsupported, scalars);
        expect(odata).toBeUndefined();
        expect(dropped).toEqual([
            { field: 'locale', operator: 'wat', reason: expect.stringContaining('not supported') },
        ]);
    });

    it('reports a partial drop, keeping the clauses it could express', () => {
        const mixed: FilterClause[] = [
            { field: 'locale', operator: 'eq', value: 'en' } as FilterClause,
            { field: 'price', operator: 'eq', value: 'not-a-number' } as FilterClause,
        ];
        const { odata, dropped } = buildAzureFilterParts(mixed, scalars);
        expect(odata).toBe("locale eq 'en'");
        expect(dropped).toHaveLength(1);
        expect(dropped[0].field).toBe('price');
    });

    it('returns undefined without throwing for no filters', () => {
        expect(buildAzureFilter([], scalars)).toBeUndefined();
        expect(buildAzureFilterParts([], scalars)).toEqual({ dropped: [] });
    });
});
