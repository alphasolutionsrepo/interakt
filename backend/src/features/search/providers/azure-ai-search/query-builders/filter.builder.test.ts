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

describe('partial coercion inside in/nin', () => {
    // The same silent drop as the top-level bug, one level down: values that fail
    // to coerce used to be filtered out of the list, so the clause built fine and
    // the strict wrapper had nothing to catch. For `nin` that removes an
    // exclusion and widens the filter.
    //
    // All-string arrays on purpose. filterValueSchema accepts z.array(z.string())
    // without regard to the field's declared type, so a UI-built filter list sends
    // strings for a numeric field and one junk or blank entry is enough. A mixed
    // array like [10, 'unknown', 30] is rejected by that schema, so it cannot
    // reach the builder through any validated path and would test nothing real.
    const partlyJunk = ['10', 'unknown', '30'];

    it('refuses a nin whose list has an uncoercible value, rather than excluding fewer', () => {
        const { odata, dropped } = buildAzureFilterParts(
            [{ field: 'price', operator: 'nin', value: partlyJunk } as FilterClause],
            scalars,
        );
        expect(odata).toBeUndefined();
        expect(dropped).toHaveLength(1);
        expect(dropped[0].reason).toContain('"unknown"');
    });

    it('never emits a nin that silently excludes only the coercible values', () => {
        const { odata } = buildAzureFilterParts(
            [{ field: 'price', operator: 'nin', value: partlyJunk } as FilterClause],
            scalars,
        );
        expect(odata ?? '').not.toContain('price ne 10');
    });

    it('refuses an in list with a junk value too, which would otherwise narrow silently', () => {
        const { odata, dropped } = buildAzureFilterParts(
            [{ field: 'price', operator: 'in', value: partlyJunk } as FilterClause],
            scalars,
        );
        expect(odata).toBeUndefined();
        expect(dropped[0].reason).toContain('not coercible');
    });

    it('throws from the strict wrapper, so a delete path cannot proceed', () => {
        expect(() =>
            buildAzureFilter([{ field: 'price', operator: 'nin', value: partlyJunk } as FilterClause], scalars),
        ).toThrow(SearchError);
    });

    it('names how many values failed and which', () => {
        const { dropped } = buildAzureFilterParts(
            [{ field: 'price', operator: 'nin', value: ['1', 'a', 'b'] } as FilterClause],
            scalars,
        );
        expect(dropped[0].reason).toContain('2 of 3');
        expect(dropped[0].reason).toContain('"a"');
        expect(dropped[0].reason).toContain('"b"');
    });

    it('still builds when every value coerces', () => {
        const odata = buildAzureFilter(
            [{ field: 'price', operator: 'nin', value: ['10', '30'] } as FilterClause],
            scalars,
        );
        expect(odata).toBe('(price ne 10 and price ne 30)');
    });

    it('refuses a boolean nin with a junk value', () => {
        // The reviewer's second reachable case: ['true','unknown'] on a boolean
        // field used to emit `inStock ne true` alone.
        const { odata, dropped } = buildAzureFilterParts(
            [{ field: 'inStock', operator: 'nin', value: ['true', 'unknown'] } as FilterClause],
            types({ inStock: 'boolean' }),
        );
        expect(odata).toBeUndefined();
        expect(dropped[0].reason).toContain('"unknown"');
    });

    it('leaves collection fields alone — their elements always coerce', () => {
        const odata = buildAzureFilter(
            [{ field: 'keywords', operator: 'nin', value: ['a', '10'] } as FilterClause],
            collections,
        );
        expect(odata).toBe("keywords/all(t: t ne 'a' and t ne '10')");
    });
});
