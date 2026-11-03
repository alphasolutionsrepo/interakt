// src/features/search-experience/external-refusal.test.ts

/**
 * An engine's 400 is blamed on a filter or sort only when its reason marks the field or
 * value as a name. The reasons below are what Elasticsearch (its root cause, from a real
 * cluster) and Azure AI Search answer.
 */

import { describe, expect, it } from 'vitest';

import { refusedRequest } from './external-refusal';

import type { DataSourceField } from '@/db/schema/data-sources.schema';
import { ExternalSearchError } from '@/features/data-source/external-search/external-search.types';
import type { FilterClause, SearchRequest } from '@/features/search/search.types';

const es = (reason: string, status = 400) => new ExternalSearchError('Elasticsearch', `Elasticsearch returned HTTP ${status}: ${reason}`, status);
const azure = (reason: string) => new ExternalSearchError('Azure AI Search', `Azure AI Search returned HTTP 400: ${reason}`, 400);
const filter = (field: string, value: FilterClause['value'], operator: FilterClause['operator'] = 'eq'): FilterClause => ({ field, operator, value });
const sortBy = (field: string): SearchRequest['sort'] => [{ field, direction: 'asc' }];
const RESULT_WINDOW = 'Result window is too large, from + size must be less than or equal to: [10000] but was [20010]. See the scroll api for a more efficient way to request large data sets. This limit can be set by changing the [index.max_result_window] index level setting.';

describe('refusedRequest', () => {
  it('blames the filter whose value the engine could not read', () => {
    const refused = refusedRequest(es('failed to create query: For input string: "abc"'), { query: 'x', filters: [filter('rating', 'abc', 'gt')] }, []);
    expect(refused).toMatchObject({ code: 'INVALID_FILTER', status: 400, message: '"abc" isn\'t a valid value for rating', details: { fields: ['rating'] } });
  });

  it('says which field it is when the engine names the field, not the value', () => {
    const refused = refusedRequest(es('Can only use prefix queries on keyword, text and wildcard fields - not on [createdAt] which is of type [date]'), { query: 'x', filters: [filter('createdAt', '2025', 'prefix')] }, []);
    expect(refused).toMatchObject({ code: 'INVALID_FILTER', message: "This search source can't filter on createdAt" });
  });

  it('names a bad value and a refused sort together', () => {
    const refused = refusedRequest(es('For input string: "abc"; No mapping found for [price] in order to sort on'), { query: 'x', filters: [filter('rating', 'abc', 'gt')], sort: sortBy('price') }, []);
    expect(refused).toMatchObject({ code: 'INVALID_QUERY', message: '"abc" isn\'t a valid value for rating; this search source can\'t sort on price' });
  });

  it('shortens a long value', () => {
    const value = 'a'.repeat(60);
    const refused = refusedRequest(es(`For input string: "${value}"`), { query: 'x', filters: [filter('rating', value, 'gt')] }, []);
    expect(refused?.message).toBe(`"${'a'.repeat(40)}…" isn't a valid value for rating`);
  });

  it.each([
    ['a boolean', filter('inStock', 'maybe'), "failed to create query: Can't parse boolean value [maybe], expected [true] or [false]"],
    ['a date', filter('createdAt', 'last week', 'gte'), 'failed to parse date field [last week] with format [strict_date_optional_time||epoch_millis]'],
  ])('blames %s value Elasticsearch writes in brackets', (_, clause, reason) => {
    expect(refusedRequest(es(reason), { query: 'x', filters: [clause] }, [])).toMatchObject({ code: 'INVALID_FILTER', details: { fields: [clause.field] } });
  });

  it('blames only the sort the engine names, not a filter next to it', () => {
    const refused = refusedRequest(es('No mapping found for [price] in order to sort on'), { query: 'x', filters: [filter('rating', 4, 'gt')], sort: sortBy('price') }, []);
    expect(refused).toMatchObject({ code: 'INVALID_SORT', message: "This search source can't sort on price" });
  });

  it('blames the field by the name it was sent to the engine as', () => {
    const fields = [{ name: 'name', filterField: 'name.keyword' }] as DataSourceField[];
    const refused = refusedRequest(es('No mapping found for [name.keyword] in order to sort on'), { query: 'x', sort: sortBy('name') }, fields);
    expect(refused).toMatchObject({ code: 'INVALID_SORT', message: "This search source can't sort on name" });
  });

  it('blames both when the engine names both', () => {
    const refused = refusedRequest(es('Fielddata is disabled on [name]; failed to parse [rating]'), { query: 'x', filters: [filter('rating', 4, 'gt')], sort: sortBy('name') }, []);
    expect(refused).toMatchObject({ code: 'INVALID_QUERY', message: "This search source can't filter on rating or sort on name" });
  });

  it('blames the property Azure AI Search could not find, not a field named like its other words', () => {
    const refused = refusedRequest(
      azure("Invalid expression: Could not find a property named 'colour' on type 'search.document'."),
      { query: 'x', filters: [filter('type', 'course'), filter('colour', 'red')] },
      [],
    );
    expect(refused).toMatchObject({ code: 'INVALID_FILTER', details: { fields: ['colour'] } });
  });

  it.each(['size', 'from', 'limit', 'index', 'window'])('does not blame a %s filter or sort for paging past the result window', (field) => {
    expect(refusedRequest(es(RESULT_WINDOW), { query: 'x', filters: [filter(field, 'M')], sort: sortBy(field) }, [])).toBeUndefined();
  });

  it('blames a number Elasticsearch could not read', () => {
    const refused = refusedRequest(es('failed to create query: Value [3000000000] is out of range for an integer'), { query: 'x', filters: [filter('rating', 3000000000, 'gt')] }, []);
    expect(refused).toMatchObject({ code: 'INVALID_FILTER', details: { fields: ['rating'] } });
  });

  it('blames a true or false Elasticsearch could not read', () => {
    const refused = refusedRequest(es('failed to create query: For input string: "true"'), { query: 'x', filters: [filter('rating', true)] }, []);
    expect(refused).toMatchObject({ code: 'INVALID_FILTER', details: { fields: ['rating'] } });
  });

  it('blames a number Elasticsearch could not read as a true or false', () => {
    const refused = refusedRequest(es("failed to create query: Can't parse boolean value [1], expected [true] or [false]"), { query: 'x', filters: [filter('inStock', 1)] }, []);
    expect(refused).toMatchObject({ code: 'INVALID_FILTER', details: { fields: ['inStock'] } });
  });

  it.each([10, 10000])('does not take the numbers in the result-window text for a filter value of %d', (value) => {
    expect(refusedRequest(es(RESULT_WINDOW), { query: 'x', filters: [filter('price', value, 'lte')] }, [])).toBeUndefined();
  });

  it('blames neither a filter nor a sort on the same field when the engine names it', () => {
    const reason = 'Can only use prefix queries on keyword, text and wildcard fields - not on [createdAt] which is of type [date]';
    const request = { query: 'x', filters: [filter('createdAt', '2025', 'prefix')], sort: sortBy('createdAt') };
    expect(refusedRequest(es(reason), request, [])).toBeUndefined();
  });

  it('blames no filter when two carry the value the engine could not read', () => {
    const reason = 'failed to parse date field [Summer 2025] with format [strict_date_optional_time||epoch_millis]';
    const request = { query: 'x', filters: [filter('season', 'Summer 2025'), filter('createdAt', 'Summer 2025', 'gte')] };
    expect(refusedRequest(es(reason), request, [])).toBeUndefined();
  });

  it('still blames a filter by its value when its field is also sorted on', () => {
    const request = { query: 'x', filters: [filter('rating', 'abc', 'gt')], sort: sortBy('rating') };
    expect(refusedRequest(es('failed to create query: For input string: "abc"'), request, [])).toMatchObject({ code: 'INVALID_FILTER', details: { fields: ['rating'] } });
  });

  it("does not take Elasticsearch's [true] or [false] for a filter value", () => {
    const reason = "failed to create query: Can't parse boolean value [yes], expected [true] or [false]";
    const request = { query: 'x', filters: [filter('inStock', true), filter('hasDiscount', 'yes')] };
    expect(refusedRequest(es(reason), request, [])).toMatchObject({ details: { fields: ['hasDiscount'] } });
  });

  it("does not take the type Elasticsearch names for a field called that", () => {
    const reason = 'Can only use wildcard queries on keyword, text and wildcard fields - not on [publishedAt] which is of type [date]';
    const request = { query: 'x', filters: [filter('publishedAt', '2024', 'contains')], sort: sortBy('date') };
    expect(refusedRequest(es(reason), request, [])).toMatchObject({ code: 'INVALID_FILTER', details: { fields: ['publishedAt'] } });
  });

  it('blames no filter when it is the query text the engine could not read', () => {
    // A true/false field marked searchable: the query text itself is refused
    const reason = "failed to create query: Can't parse boolean value [red jacket], expected [true] or [false]";
    expect(refusedRequest(es(reason), { query: 'red jacket', filters: [filter('hasDiscount', true)] }, [])).toBeUndefined();
    expect(refusedRequest(es(reason), { query: 'red jacket', filters: [filter('colour', 'red jacket')] }, [])).toBeUndefined();
  });

  it('does not blame a filter on a field the request also facets on', () => {
    const reason = 'Fielddata is disabled on [category] in [shop]. Text fields are not optimised for operations that require per-document field data like aggregations and sorting';
    const request = { query: 'x', facets: [{ field: 'category', type: 'terms' as const }], filters: [filter('category', 'Shoes')] };
    expect(refusedRequest(es(reason), request, [])).toBeUndefined();
  });

  it('leaves engines whose wording is unknown alone', () => {
    const sitecore = new ExternalSearchError('Sitecore Search', 'Sitecore Search returned HTTP 400: {"type":"bad_request","field":"rating"}', 400);
    expect(refusedRequest(sitecore, { query: 'x', filters: [filter('rating', 4, 'gt')] }, [])).toBeUndefined();
  });

  it('leaves anything but a 400 from an engine alone', () => {
    const request = { query: 'x', filters: [filter('rating', 'abc', 'gt')] };
    expect(refusedRequest(es('For input string: "abc"', 500), request, [])).toBeUndefined();
    expect(refusedRequest(new Error('For input string: "abc"'), request, [])).toBeUndefined();
  });

  it('keeps the engine error as the cause, for the log', () => {
    const error = es('No mapping found for [name] in order to sort on');
    expect(refusedRequest(error, { query: 'x', sort: sortBy('name') }, [])?.cause).toBe(error);
  });
});
