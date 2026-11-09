// src/features/search/request-refusal.test.ts

/**
 * An engine's 400 is blamed on a filter or sort only when its reason marks the field or
 * value as a name. The reasons below are what Elasticsearch (its root cause, from a real
 * cluster) and Azure AI Search answer.
 */

import { describe, expect, it } from 'vitest';

import { refusalFor } from './request-refusal';
import type { FilterClause, SearchRequest } from './search.types';

const CAUSE = new Error('the engine error');
const refuse = (reason: string, request: SearchRequest) => refusalFor(reason, request, (field) => [field], CAUSE);
const filter = (field: string, value: FilterClause['value'], operator: FilterClause['operator'] = 'eq'): FilterClause => ({ field, operator, value });
const sortBy = (field: string): SearchRequest['sort'] => [{ field, direction: 'asc' }];
const RESULT_WINDOW = 'Result window is too large, from + size must be less than or equal to: [10000] but was [20010]. See the scroll api for a more efficient way to request large data sets. This limit can be set by changing the [index.max_result_window] index level setting.';

describe('refusalFor', () => {
    it('blames the filter whose value the engine could not read', () => {
        const refused = refuse('failed to create query: For input string: "abc"', { query: 'x', filters: [filter('rating', 'abc', 'gt')] });
        expect(refused).toMatchObject({ code: 'INVALID_FILTER', status: 400, message: '"abc" isn\'t a valid value for rating', details: { fields: ['rating'] } });
    });

    it('says which field it is when the engine names the field, not the value', () => {
        const refused = refuse('Can only use prefix queries on keyword, text and wildcard fields - not on [createdAt] which is of type [date]', { query: 'x', filters: [filter('createdAt', '2025', 'prefix')] });
        expect(refused).toMatchObject({ code: 'INVALID_FILTER', message: "This search source can't filter on createdAt" });
    });

    it('names a bad value and a refused sort together', () => {
        const refused = refuse('For input string: "abc"; No mapping found for [price] in order to sort on', { query: 'x', filters: [filter('rating', 'abc', 'gt')], sort: sortBy('price') });
        expect(refused).toMatchObject({ code: 'INVALID_QUERY', message: '"abc" isn\'t a valid value for rating; this search source can\'t sort on price' });
    });

    it('shortens a long value', () => {
        const value = 'a'.repeat(60);
        const refused = refuse(`For input string: "${value}"`, { query: 'x', filters: [filter('rating', value, 'gt')] });
        expect(refused?.message).toBe(`"${'a'.repeat(40)}…" isn't a valid value for rating`);
    });

    it.each([
        ['a boolean', filter('inStock', 'maybe'), "failed to create query: Can't parse boolean value [maybe], expected [true] or [false]"],
        ['a date', filter('createdAt', 'last week', 'gte'), 'failed to parse date field [last week] with format [strict_date_optional_time||epoch_millis]'],
    ])('blames %s value Elasticsearch writes in brackets', (_, clause, reason) => {
        expect(refuse(reason, { query: 'x', filters: [clause] })).toMatchObject({ code: 'INVALID_FILTER', details: { fields: [clause.field] } });
    });

    it('blames only the sort the engine names, not a filter next to it', () => {
        const refused = refuse('No mapping found for [price] in order to sort on', { query: 'x', filters: [filter('rating', 4, 'gt')], sort: sortBy('price') });
        expect(refused).toMatchObject({ code: 'INVALID_SORT', message: "This search source can't sort on price" });
    });

    it('blames both when the engine names both', () => {
        const refused = refuse('Fielddata is disabled on [name]; failed to parse [rating]', { query: 'x', filters: [filter('rating', 4, 'gt')], sort: sortBy('name') });
        expect(refused).toMatchObject({ code: 'INVALID_QUERY', message: "This search source can't filter on rating or sort on name" });
    });

    it('blames the property Azure AI Search could not find, not a field named like its other words', () => {
        const refused = refuse(
            "Invalid expression: Could not find a property named 'colour' on type 'search.document'.",
            { query: 'x', filters: [filter('type', 'course'), filter('colour', 'red')] },
        );
        expect(refused).toMatchObject({ code: 'INVALID_FILTER', details: { fields: ['colour'] } });
    });

    it.each(['size', 'from', 'limit', 'index', 'window'])('does not blame a %s filter or sort for paging past the result window', (field) => {
        expect(refuse(RESULT_WINDOW, { query: 'x', filters: [filter(field, 'M')], sort: sortBy(field) })).toMatchObject({ code: 'INVALID_QUERY', details: { maxResults: 10000 } });
    });

    it('blames a number Elasticsearch could not read', () => {
        const refused = refuse('failed to create query: Value [3000000000] is out of range for an integer', { query: 'x', filters: [filter('rating', 3000000000, 'gt')] });
        expect(refused).toMatchObject({ code: 'INVALID_FILTER', details: { fields: ['rating'] } });
    });

    it('blames a true or false Elasticsearch could not read', () => {
        const refused = refuse('failed to create query: For input string: "true"', { query: 'x', filters: [filter('rating', true)] });
        expect(refused).toMatchObject({ code: 'INVALID_FILTER', details: { fields: ['rating'] } });
    });

    it('blames a number Elasticsearch could not read as a true or false', () => {
        const refused = refuse("failed to create query: Can't parse boolean value [1], expected [true] or [false]", { query: 'x', filters: [filter('inStock', 1)] });
        expect(refused).toMatchObject({ code: 'INVALID_FILTER', details: { fields: ['inStock'] } });
    });

    it('asks for an earlier page when the search went past the result window', () => {
        expect(refuse(RESULT_WINDOW, { query: 'x', page: 1001 })).toMatchObject({
            code: 'INVALID_QUERY',
            status: 400,
            message: "Results past the first 10000 can't be fetched: narrow the search or ask for an earlier page",
            details: { maxResults: 10000 },
        });
    });

    it("does not take the result window's numbers for a text value", () => {
        expect(refuse(RESULT_WINDOW, { query: 'x', filters: [filter('sku', '10000'), filter('code', '20010')] })).toMatchObject({ code: 'INVALID_QUERY', details: { maxResults: 10000 } });
    });

    it.each([10, 10000])('does not take the numbers in the result-window text for a filter value of %d', (value) => {
        expect(refuse(RESULT_WINDOW, { query: 'x', filters: [filter('price', value, 'lte')] })).toMatchObject({ code: 'INVALID_QUERY', details: { maxResults: 10000 } });
    });

    it('blames neither a filter nor a sort on the same field when the engine names it', () => {
        const reason = 'Can only use prefix queries on keyword, text and wildcard fields - not on [createdAt] which is of type [date]';
        const request = { query: 'x', filters: [filter('createdAt', '2025', 'prefix')], sort: sortBy('createdAt') };
        expect(refuse(reason, request)).toBeUndefined();
    });

    it('blames no filter when two carry the value the engine could not read', () => {
        const reason = 'failed to parse date field [Summer 2025] with format [strict_date_optional_time||epoch_millis]';
        const request = { query: 'x', filters: [filter('season', 'Summer 2025'), filter('createdAt', 'Summer 2025', 'gte')] };
        expect(refuse(reason, request)).toBeUndefined();
    });

    it('still blames a filter by its value when its field is also sorted on', () => {
        const request = { query: 'x', filters: [filter('rating', 'abc', 'gt')], sort: sortBy('rating') };
        expect(refuse('failed to create query: For input string: "abc"', request)).toMatchObject({ code: 'INVALID_FILTER', details: { fields: ['rating'] } });
    });

    it("does not take Elasticsearch's [true] or [false] for a filter value", () => {
        const reason = "failed to create query: Can't parse boolean value [yes], expected [true] or [false]";
        const request = { query: 'x', filters: [filter('inStock', true), filter('hasDiscount', 'yes')] };
        expect(refuse(reason, request)).toMatchObject({ details: { fields: ['hasDiscount'] } });
    });

    it("does not take the type Elasticsearch names for a field called that", () => {
        const reason = 'Can only use wildcard queries on keyword, text and wildcard fields - not on [publishedAt] which is of type [date]';
        const request = { query: 'x', filters: [filter('publishedAt', '2024', 'contains')], sort: sortBy('date') };
        expect(refuse(reason, request)).toMatchObject({ code: 'INVALID_FILTER', details: { fields: ['publishedAt'] } });
    });

    it('blames no filter when it is the query text the engine could not read', () => {
        // A true/false field marked searchable: the query text itself is refused
        const reason = "failed to create query: Can't parse boolean value [red jacket], expected [true] or [false]";
        expect(refuse(reason, { query: 'red jacket', filters: [filter('hasDiscount', true)] })).toBeUndefined();
        expect(refuse(reason, { query: 'red jacket', filters: [filter('colour', 'red jacket')] })).toBeUndefined();
    });

    it('does not blame a filter on a field the request also facets on', () => {
        const reason = 'Fielddata is disabled on [category] in [shop]. Text fields are not optimised for operations that require per-document field data like aggregations and sorting';
        const request = { query: 'x', facets: [{ field: 'category', type: 'terms' as const }], filters: [filter('category', 'Shoes')] };
        expect(refuse(reason, request)).toBeUndefined();
    });

    it('keeps the engine error as the cause', () => {
        expect(refuse('No mapping found for [name] in order to sort on', { query: 'x', sort: sortBy('name') })?.cause).toBe(CAUSE);
    });
});
