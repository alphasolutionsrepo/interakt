// src/features/tools/executors/filter-defaults.test.ts

import { describe, it, expect } from 'vitest';

import {
  mergeDefaultFilters,
  mergeDefaultSort,
  describeAppliedConfig,
  annotateResult,
} from './filter-defaults';

import type { FilterClause, FilterOperator } from '@/features/search/search.types';

function filter(f: string, operator = 'eq', value: unknown = 'x'): FilterClause {
  return { field: f, operator: operator as FilterOperator, value: value as FilterClause['value'] };
}

describe('mergeDefaultFilters', () => {
  it('passes requested filters through when no defaults are configured', () => {
    const requested = [filter('brand')];
    const result = mergeDefaultFilters(undefined, requested);

    expect(result.filters).toBe(requested);
    expect(result.appliedDefaults).toEqual([]);
  });

  it('applies a default the caller did not ask about', () => {
    const result = mergeDefaultFilters(
      [{ field: 'status', operator: 'eq', value: 'published' }],
      [filter('brand', 'eq', 'Vesper')],
    );

    expect(result.filters).toEqual([
      { field: 'status', operator: 'eq', value: 'published' },
      { field: 'brand', operator: 'eq', value: 'Vesper' },
    ]);
    expect(result.appliedDefaults).toHaveLength(1);
  });

  it('lets a requested filter replace a default on the same field', () => {
    // ANDing them would produce a query that can never match, and the caller's intent is
    // the more specific of the two.
    const result = mergeDefaultFilters(
      [{ field: 'brand', operator: 'eq', value: 'Atelier' }],
      [filter('brand', 'eq', 'Vesper')],
    );

    expect(result.filters).toEqual([{ field: 'brand', operator: 'eq', value: 'Vesper' }]);
    expect(result.appliedDefaults).toEqual([]);
  });

  it('applies defaults when the caller sent no filters at all', () => {
    const result = mergeDefaultFilters([{ field: 'status', operator: 'eq', value: 'published' }], []);

    expect(result.filters).toHaveLength(1);
    expect(result.appliedDefaults).toHaveLength(1);
  });

  it('reports every default it applied', () => {
    // The reason this is reported at all: a default filter narrows the result set
    // invisibly. A hand-picked sitedomain default once removed an entire content category
    // from an index with nothing in the result or the trace to explain the gap.
    const result = mergeDefaultFilters(
      [
        { field: 'status', operator: 'eq', value: 'published' },
        { field: 'locale', operator: 'eq', value: 'en-us' },
      ],
      [],
    );

    expect(result.appliedDefaults.map(f => f.field)).toEqual(['status', 'locale']);
  });
});

describe('mergeDefaultSort', () => {
  it('prefers the requested sort outright', () => {
    const result = mergeDefaultSort(
      [{ field: 'published', direction: 'desc' }],
      [{ field: 'price', direction: 'asc' }],
    );

    expect(result.sort).toEqual([{ field: 'price', direction: 'asc' }]);
    expect(result.fromDefault).toBe(false);
  });

  it('falls back to the configured default and flags it', () => {
    const result = mergeDefaultSort([{ field: 'published', direction: 'desc' }], []);

    expect(result.sort).toEqual([{ field: 'published', direction: 'desc' }]);
    expect(result.fromDefault).toBe(true);
  });

  it('returns no sort when neither side has one', () => {
    expect(mergeDefaultSort(undefined, [])).toEqual({ sort: [], fromDefault: false });
  });
});

describe('describeAppliedConfig', () => {
  it('says nothing when nothing was applied', () => {
    // An ordinary search payload must be unchanged — no tokens spent reporting a no-op.
    expect(describeAppliedConfig([], { sort: [], fromDefault: false })).toEqual({});
  });

  it('omits the sort key when the caller chose the ordering', () => {
    const described = describeAppliedConfig([], {
      sort: [{ field: 'price', direction: 'asc' }],
      fromDefault: false,
    });

    expect(described).toEqual({});
  });

  it('reports defaults and unapplied clauses together', () => {
    const described = describeAppliedConfig(
      [filter('status')],
      { sort: [{ field: 'published', direction: 'desc' }], fromDefault: true },
      [{ field: 'color', operator: 'eq', reason: 'field is not present in the discovered schema' }],
      [{ field: 'rank', reason: 'field is not sortable on this index' }],
    );

    expect(Object.keys(described).sort()).toEqual([
      'appliedDefaultFilters',
      'appliedDefaultSort',
      'unappliedFilters',
      'unappliedSort',
    ]);
  });
});

describe('annotateResult', () => {
  it('merges annotations into the result data', () => {
    const result = annotateResult(
      { success: true, data: { results: [1, 2], totalCount: 2 } },
      [filter('status')],
      { sort: [], fromDefault: false },
      [],
      [],
    );

    expect(result.data).toEqual({
      results: [1, 2],
      totalCount: 2,
      appliedDefaultFilters: [{ field: 'status', operator: 'eq', value: 'x' }],
    });
  });

  it('leaves a failed result untouched', () => {
    // The error is what matters on a failure; filter bookkeeping would only bury it.
    const failed = { success: false, error: 'HTTP 400: invalid expression' };
    expect(annotateResult(failed, [filter('status')], { sort: [], fromDefault: false }, [], [])).toBe(failed);
  });

  it('returns the original object when there is nothing to annotate', () => {
    const clean = { success: true, data: { results: [] } };
    expect(annotateResult(clean, [], { sort: [], fromDefault: false }, [], [])).toBe(clean);
  });
});
