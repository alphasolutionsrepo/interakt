// src/features/search/filter-clauses.test.ts

import { describe, expect, it } from 'vitest';

import { filterFields, leafFilters } from './filter-clauses';
import type { FilterClause } from './search.types';

const rating: FilterClause = { field: 'rating', operator: 'gt', value: 4 };
const color: FilterClause = { field: 'color', operator: 'in', value: ['red', 'blue'] };
// A group's field is not filtered on: the operator makes it a group
const group: FilterClause = { field: 'any', operator: 'or', filters: [rating, { field: 'all', operator: 'and', filters: [color, rating] }] };

describe('leafFilters', () => {
  it('flattens groups to the clauses that filter on a field', () => {
    expect(leafFilters([group])).toEqual([rating, color, rating]);
  });

  it('skips a clause with no field (nested public filters are not validated)', () => {
    const unnamed = { operator: 'eq', value: 'x' } as unknown as FilterClause;
    expect(leafFilters([{ field: 'any', operator: 'or', filters: [unnamed, color] }])).toEqual([color]);
  });

  it('skips what is not a clause at all', () => {
    const broken = [{ field: 'g', operator: 'and', filters: [null] }, null] as unknown as FilterClause[];
    expect(leafFilters(broken)).toEqual([]);
  });

  it('has none without filters', () => {
    expect(leafFilters(undefined)).toEqual([]);
  });
});

describe('filterFields', () => {
  it('names each field once, never a group', () => {
    expect(filterFields([group, color])).toEqual(['rating', 'color']);
  });
});
