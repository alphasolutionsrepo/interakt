// src/features/tools/executors/external-query.test.ts

import { describe, it, expect } from 'vitest';

import { translateFilters, translateSort } from './external-query';

import type { DataSourceField } from '@/db/schema/data-sources.schema';
import type { FilterClause, FilterOperator, SortClause } from '@/features/search/search.types';

function field(overrides: Partial<DataSourceField> & { name: string }): DataSourceField {
  return {
    displayName: overrides.name,
    type: 'text',
    isSearchable: true,
    isFacetable: true,
    isFilterable: true,
    ...overrides,
  };
}

function filter(f: string, operator: string, value?: unknown): FilterClause {
  return { field: f, operator: operator as FilterOperator, value: value as FilterClause['value'] };
}

function sort(f: string, direction: 'asc' | 'desc' = 'asc'): SortClause {
  return { field: f, direction };
}

// ============================================================================
// AZURE AI SEARCH
// ============================================================================

describe('translateFilters — azure-ai-search', () => {
  it('quotes a string value and emits an OData equality clause', () => {
    const fields = [field({ name: 'brand', providerType: 'Edm.String' })];
    const result = translateFilters('azure-ai-search', [filter('brand', 'eq', 'Vesper')], fields);

    expect(result.odata).toBe("brand eq 'Vesper'");
    expect(result.unapplied).toEqual([]);
  });

  it('uses a lambda expression for a collection field', () => {
    // The bug this guards: the normalized `type` flattens Collection(Edm.String) to
    // 'text', and comparing an Azure collection without a lambda is an HTTP 400 — so the
    // whole search fails, not just the filter. Only providerType carries the collection.
    const fields = [field({ name: 'tags', type: 'text', providerType: 'Collection(Edm.String)' })];
    const result = translateFilters('azure-ai-search', [filter('tags', 'eq', 'sale')], fields);

    expect(result.odata).toBe("tags/any(t: t eq 'sale')");
  });

  it('emits a bare numeric literal for a number field even when the value arrives as a string', () => {
    // Param extraction returns JSON, so a number often arrives as "1100". Quoting it
    // would make Azure reject the comparison.
    const fields = [field({ name: 'price', type: 'number', providerType: 'Edm.Int32' })];
    const result = translateFilters('azure-ai-search', [filter('price', 'lte', '1100')], fields);

    expect(result.odata).toBe('price le 1100');
  });

  it('combines multiple clauses with and', () => {
    const fields = [
      field({ name: 'brand', providerType: 'Edm.String' }),
      field({ name: 'inStock', type: 'boolean', providerType: 'Edm.Boolean' }),
    ];
    const result = translateFilters(
      'azure-ai-search',
      [filter('brand', 'eq', 'Vesper'), filter('inStock', 'eq', true)],
      fields,
    );

    expect(result.odata).toBe("brand eq 'Vesper' and inStock eq true");
  });

  it('reports a field that is not in the discovered schema', () => {
    const fields = [field({ name: 'brand', providerType: 'Edm.String' })];
    const result = translateFilters('azure-ai-search', [filter('color', 'eq', 'red')], fields);

    expect(result.odata).toBeUndefined();
    expect(result.unapplied).toEqual([
      { field: 'color', operator: 'eq', reason: 'field is not present in the discovered schema' },
    ]);
  });

  it('reports a field the provider will not filter on', () => {
    const fields = [field({ name: 'body', providerType: 'Edm.String', isFilterable: false })];
    const result = translateFilters('azure-ai-search', [filter('body', 'eq', 'x')], fields);

    expect(result.odata).toBeUndefined();
    expect(result.unapplied[0].reason).toBe('field is not filterable on this index');
  });

  it('applies the usable clauses and reports only the rejected one', () => {
    // One bad filter must not cost the whole search.
    const fields = [
      field({ name: 'brand', providerType: 'Edm.String' }),
      field({ name: 'body', providerType: 'Edm.String', isFilterable: false }),
    ];
    const result = translateFilters(
      'azure-ai-search',
      [filter('brand', 'eq', 'Vesper'), filter('body', 'eq', 'x')],
      fields,
    );

    expect(result.odata).toBe("brand eq 'Vesper'");
    expect(result.unapplied).toHaveLength(1);
    expect(result.unapplied[0].field).toBe('body');
  });
});

describe('translateSort — azure-ai-search', () => {
  it('emits orderby for a sortable field', () => {
    const fields = [field({ name: 'published', type: 'date', providerType: 'Edm.DateTimeOffset', isSortable: true })];
    const result = translateSort('azure-ai-search', [sort('published', 'desc')], fields);

    expect(result.odataOrderBy).toBe('published desc');
    expect(result.unapplied).toEqual([]);
  });

  it('refuses to sort on a field the index declares unsortable', () => {
    const fields = [field({ name: 'published', isSortable: false })];
    const result = translateSort('azure-ai-search', [sort('published', 'desc')], fields);

    expect(result.odataOrderBy).toBeUndefined();
    expect(result.unapplied[0].reason).toBe('field is not sortable on this index');
  });

  it('refuses to sort when sortability is unknown, and says how to fix it', () => {
    // Azure rejects the entire request for an unsortable field, so an unverified sort
    // costs the whole search rather than just the ordering. Schemas discovered before
    // sortability was recorded land here.
    const fields = [field({ name: 'published' })];
    const result = translateSort('azure-ai-search', [sort('published', 'desc')], fields);

    expect(result.odataOrderBy).toBeUndefined();
    expect(result.unapplied[0].reason).toContain('re-run a health check');
  });
});

// ============================================================================
// ELASTICSEARCH
// ============================================================================

describe('translateFilters — elasticsearch', () => {
  it('targets the keyword sub-field when filtering an analyzed text field', () => {
    const fields = [field({ name: 'title', providerType: 'text', filterField: 'title.keyword' })];
    const result = translateFilters('elasticsearch', [filter('title', 'eq', 'Cashmere Sweater')], fields);

    expect(result.esClauses).toEqual([{ term: { 'title.keyword': 'Cashmere Sweater' } }]);
  });

  it('does not append .keyword to a field that is already a keyword', () => {
    // The bug this guards: discovery normalizes both `text` and `keyword` to 'text', and
    // the managed-path builder appends `.keyword` to anything typed 'text'. On a real
    // keyword field that queries a sub-field which does not exist — zero hits, no error,
    // no way to tell from the result that the filter was the problem.
    const fields = [field({ name: 'brand', providerType: 'keyword' })];
    const result = translateFilters('elasticsearch', [filter('brand', 'eq', 'Vesper')], fields);

    expect(result.esClauses).toEqual([{ term: { brand: 'Vesper' } }]);
  });

  it('keeps contains on the analyzed field rather than the keyword sub-field', () => {
    // match_phrase_prefix needs the analyzed field; a wildcard over keyword would be both
    // slower and case-sensitive.
    const fields = [field({ name: 'title', providerType: 'text', filterField: 'title.keyword' })];
    const result = translateFilters('elasticsearch', [filter('title', 'contains', 'cashmere')], fields);

    expect(result.esClauses).toEqual([{ match_phrase_prefix: { title: { query: 'cashmere' } } }]);
  });

  it('builds a range query for a comparison operator', () => {
    const fields = [field({ name: 'price', type: 'number', providerType: 'long' })];
    const result = translateFilters('elasticsearch', [filter('price', 'gte', 100)], fields);

    expect(result.esClauses).toEqual([{ range: { price: { gte: 100 } } }]);
  });

  it('wraps a scalar handed to an in filter', () => {
    const fields = [field({ name: 'size', providerType: 'keyword' })];
    const result = translateFilters('elasticsearch', [filter('size', 'in', 'XL')], fields);

    expect(result.esClauses).toEqual([{ terms: { size: ['XL'] } }]);
  });

  it('reports an untranslatable clause and keeps the rest', () => {
    const fields = [
      field({ name: 'brand', providerType: 'keyword' }),
      field({ name: 'size', providerType: 'keyword' }),
    ];
    const result = translateFilters(
      'elasticsearch',
      [filter('brand', 'eq', 'Vesper'), filter('size', 'nin', 'not-an-array')],
      fields,
    );

    expect(result.esClauses).toEqual([{ term: { brand: 'Vesper' } }]);
    expect(result.unapplied).toHaveLength(1);
    expect(result.unapplied[0].field).toBe('size');
    expect(result.unapplied[0].reason).toContain('array');
  });

  it('checks existence against the field itself, not the sub-field', () => {
    const fields = [field({ name: 'title', providerType: 'text', filterField: 'title.keyword' })];
    const result = translateFilters('elasticsearch', [filter('title', 'exists', true)], fields);

    expect(result.esClauses).toEqual([{ exists: { field: 'title' } }]);
  });
});

describe('translateSort — elasticsearch', () => {
  it('sorts a text field through its keyword sub-field', () => {
    // Sorting an analyzed text field directly is an error in ES ("Fielddata is disabled"),
    // which fails the whole request.
    const fields = [field({ name: 'title', providerType: 'text', filterField: 'title.keyword', isSortable: true })];
    const result = translateSort('elasticsearch', [sort('title', 'asc')], fields);

    expect(result.esSort).toEqual([{ 'title.keyword': { order: 'asc' } }]);
  });

  it('sorts a date field directly', () => {
    const fields = [field({ name: 'published', type: 'date', providerType: 'date', isSortable: true })];
    const result = translateSort('elasticsearch', [sort('published', 'desc')], fields);

    expect(result.esSort).toEqual([{ published: { order: 'desc' } }]);
  });
});

// ============================================================================
// SHARED BEHAVIOR
// ============================================================================

describe('translation without a discovered schema', () => {
  it('attempts the filter rather than dropping it', () => {
    // Better to send the filter and surface a provider error than to silently ignore it,
    // which is what happened before this module existed. A data source whose health check
    // has never run lands here.
    const result = translateFilters('elasticsearch', [filter('brand', 'eq', 'Vesper')], []);

    expect(result.esClauses).toEqual([{ term: { brand: 'Vesper' } }]);
    expect(result.unapplied).toEqual([]);
  });

  it('attempts the sort rather than dropping it', () => {
    const result = translateSort('azure-ai-search', [sort('published', 'desc')], undefined);

    expect(result.odataOrderBy).toBe('published desc');
    expect(result.unapplied).toEqual([]);
  });
});

describe('unsupported requests', () => {
  it('reports boolean filter combinations', () => {
    // Tool input schemas are flat, so these should never arrive — but reporting beats
    // discarding if the shape ever changes.
    const result = translateFilters('elasticsearch', [filter('', 'and')], [field({ name: 'brand' })]);

    expect(result.esClauses).toBeUndefined();
    expect(result.unapplied[0].reason).toContain('boolean filter combinations');
  });

  it('names the provider when filtering is not implemented for it', () => {
    const result = translateFilters('some-new-engine', [filter('brand', 'eq', 'x')], []);

    expect(result.unapplied[0].reason).toBe("filtering is not implemented for provider 'some-new-engine'");
  });

  it('returns nothing to do for an absent filter list', () => {
    expect(translateFilters('elasticsearch', undefined, [])).toEqual({ unapplied: [] });
    expect(translateFilters('elasticsearch', [], [])).toEqual({ unapplied: [] });
    expect(translateSort('elasticsearch', undefined, [])).toEqual({ unapplied: [] });
  });
});
