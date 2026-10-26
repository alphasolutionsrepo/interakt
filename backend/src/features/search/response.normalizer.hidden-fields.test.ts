// src/features/search/response.normalizer.hidden-fields.test.ts

/**
 * A request for hidden searched fields gets them apart from each hit's source, so source holds
 * only what responses show, as without the request.
 */

import { describe, it, expect } from 'vitest';
import { normalizeSearchResponse } from './response.normalizer';
import type { ProviderSearchResponse, SearchContext, SearchRequest } from './search.types';

// name and sku are searched; sku is kept out of responses; price is shown but not searched
const context = {
  searchableFields: [
    { fieldName: 'name', fieldType: 'text', boostValue: 1 },
    { fieldName: 'sku', fieldType: 'keyword', boostValue: 1 },
  ],
  defaultResponseFields: ['name', 'price'],
} as unknown as SearchContext;

const engineHits = (source: Record<string, unknown>): ProviderSearchResponse =>
  ({ hits: [{ id: 'p1', score: 1, source }], total: { value: 1, relation: 'eq' } }) as unknown as ProviderSearchResponse;

const normalize = (source: Record<string, unknown>, request: Partial<SearchRequest>, ctx = context) =>
  normalizeSearchResponse(engineHits(source), { query: 'ABC-123', ...request } as SearchRequest, ctx, 'lexical').hits[0];

describe('hidden searched fields', () => {
  it('moves them out of source when asked for', () => {
    const hit = normalize({ id: 'p1', name: 'Crew Neck Sweater', price: 40, sku: 'ABC-123' }, { includeHiddenSearchedFields: true });

    expect(hit.source).toEqual({ id: 'p1', name: 'Crew Neck Sweater', price: 40 });
    expect(hit.hiddenSearchedFields).toEqual({ sku: 'ABC-123' });
  });

  it('leaves a hit untouched without the request', () => {
    const hit = normalize({ name: 'Crew Neck Sweater', price: 40 }, {});

    expect(hit).toEqual({ id: 'p1', score: 1, source: { name: 'Crew Neck Sweater', price: 40 } });
  });

  it('moves nothing when no fields are shown, as nothing was added', () => {
    const hit = normalize({ name: 'Crew Neck Sweater', sku: 'ABC-123' }, { includeHiddenSearchedFields: true },
      { ...context, defaultResponseFields: [] } as SearchContext);

    expect(hit.source).toEqual({ name: 'Crew Neck Sweater', sku: 'ABC-123' });
    expect(hit.hiddenSearchedFields).toBeUndefined();
  });

  it('leaves a hit as without the request when it names an empty field list', () => {
    const source = { name: 'Crew Neck Sweater', price: 40, sku: 'ABC-123' };
    const withRequest = normalize(source, { includeHiddenSearchedFields: true, includeFields: [] });

    expect(withRequest).toEqual(normalize(source, { includeFields: [] }));
  });

  describe('a dotted searched field', () => {
    const nested = {
      ...context,
      searchableFields: [...context.searchableFields, { fieldName: 'specs.sku', fieldType: 'keyword', boostValue: 1 }],
    } as unknown as SearchContext;

    it('is moved out whether the engine returns it flat or nested', () => {
      const flat = normalize({ name: 'Sweater', 'specs.sku': 'ABC-1' }, { includeHiddenSearchedFields: true }, nested);
      const deep = normalize({ name: 'Sweater', specs: { sku: 'ABC-1' } }, { includeHiddenSearchedFields: true }, nested);

      expect(flat.source).toEqual({ name: 'Sweater' });
      expect(flat.hiddenSearchedFields).toEqual({ 'specs.sku': 'ABC-1' });
      expect(deep.source).toEqual({ name: 'Sweater' });
      expect(deep.hiddenSearchedFields).toEqual({ 'specs.sku': 'ABC-1' });
    });

    it('is moved out of every item of a list, keeping the rest of each item', () => {
      const listed = { ...nested, searchableFields: [{ fieldName: 'variants.sku', fieldType: 'keyword', boostValue: 1 }] } as unknown as SearchContext;
      const hit = normalize(
        { name: 'Tote', variants: [{ sku: 'T-1', color: 'black' }, { sku: 'T-2', color: 'olive' }] },
        { includeHiddenSearchedFields: true },
        listed,
      );

      expect(hit.source).toEqual({ name: 'Tote', variants: [{ color: 'black' }, { color: 'olive' }] });
      expect(hit.hiddenSearchedFields).toEqual({ 'variants.sku': ['T-1', 'T-2'] });
    });

    it('drops a list whose items had only the hidden field, as responses show it', () => {
      const listed = { ...nested, searchableFields: [{ fieldName: 'variants.sku', fieldType: 'keyword', boostValue: 1 }] } as unknown as SearchContext;
      const hit = normalize(
        { name: 'Tote', variants: [{ sku: 'T-1' }, { sku: 'T-2' }] },
        { includeHiddenSearchedFields: true },
        listed,
      );

      expect(hit.source).toEqual({ name: 'Tote' });
      expect(hit.hiddenSearchedFields).toEqual({ 'variants.sku': ['T-1', 'T-2'] });
    });

    it('stays when the field above it is shown', () => {
      const hit = normalize({ name: 'Sweater', specs: { sku: 'ABC-1' } }, { includeHiddenSearchedFields: true, includeFields: ['name', 'specs'] }, nested);

      expect(hit.source).toEqual({ name: 'Sweater', specs: { sku: 'ABC-1' } });
      expect(hit.hiddenSearchedFields).toBeUndefined();
    });
  });

  it('keeps a searched field the request asks to show in source', () => {
    const hit = normalize({ name: 'Crew Neck Sweater', sku: 'ABC-123' },
      { includeHiddenSearchedFields: true, includeFields: ['name', 'sku'] });

    expect(hit.source).toEqual({ name: 'Crew Neck Sweater', sku: 'ABC-123' });
    expect(hit.hiddenSearchedFields).toBeUndefined();
  });
});
