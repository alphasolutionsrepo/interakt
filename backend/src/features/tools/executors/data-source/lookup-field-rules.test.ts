// src/features/tools/executors/data-source/lookup-field-rules.test.ts

/**
 * A Find Record tool's name and code fields: what is suggested, what a save may store, and
 * what counts as gone from the data source.
 */

import { describe, expect, it } from 'vitest';

import {
  checkLookupFields,
  hasChosenLookupFields,
  missingLookupFields,
  suggestLookupFields,
  type LookupFieldCandidate,
} from './lookup-field-rules';

const managed = { findsThroughSearch: true, codesNeedFilter: false };
const external = { findsThroughSearch: true, codesNeedFilter: true };

/** The demo catalog's index fields, as the index defines them. */
const demoIndex: LookupFieldCandidate[] = [
  { name: 'brand', type: 'keyword', searchable: true, filterable: true },
  { name: 'colorCode', type: 'keyword', searchable: true, filterable: true },
  { name: 'name', type: 'text', searchable: true, filterable: false },
  { name: 'productId', type: 'keyword', searchable: false, filterable: false },
  { name: 'variants', type: 'json', searchable: true, hasPaths: true },
  { name: 'embedding', type: 'vector' },
];

describe('suggested fields', () => {
  it('suggests the name field, and no attribute codes (colorCode) or fields search never matches', () => {
    expect(suggestLookupFields(demoIndex, managed)).toEqual({ nameFields: ['name'], codeFields: [] });
  });

  it("prefers the schema's title role, and suggests code fields an external source can filter on", () => {
    const fields: LookupFieldCandidate[] = [
      { name: 'name', type: 'text', searchable: true },
      { name: 'storeName', type: 'text', searchable: true, role: 'title' },
      { name: 'sku', type: 'keyword', filterable: true },
      { name: 'ean', type: 'text', filterable: false },
      { name: 'categoryId', type: 'keyword', filterable: true },
    ];

    expect(suggestLookupFields(fields, external)).toEqual({ nameFields: ['storeName'], codeFields: ['sku'] });
  });

  it('suggests nothing when no field looks like a name or a code', () => {
    expect(suggestLookupFields([{ name: 'price', type: 'number' }], managed)).toEqual({ nameFields: [], codeFields: [] });
  });
});

describe('checking chosen fields', () => {
  it('accepts fields of the source and paths under a json field', () => {
    const result = checkLookupFields({ nameFields: ['brand', 'name'], codeFields: ['variants.sku'] }, demoIndex, managed);

    expect(result).toEqual({ errors: [], warnings: [] });
  });

  it("refuses a field the source doesn't have, a vector field, and a field in both lists", () => {
    const result = checkLookupFields({ nameFields: ['title', 'name'], codeFields: ['embedding', 'name'] }, demoIndex, managed);

    expect(result.errors.map((e) => e.field)).toEqual(['title', 'embedding', 'name']);
  });

  it("refuses an external code field that can't be filtered on, and only warns about one search can't match", () => {
    const fields: LookupFieldCandidate[] = [
      { name: 'title', type: 'text', searchable: true, filterable: false },
      { name: 'partNo', type: 'text', searchable: true, filterable: false },
    ];

    expect(checkLookupFields({ codeFields: ['partNo'] }, fields, external).errors[0].message).toContain("can't be filtered on");
    expect(checkLookupFields({ codeFields: ['productId'] }, demoIndex, managed)).toMatchObject({
      errors: [],
      warnings: [{ field: 'productId' }],
    });
  });

  it('warns about a name field empty on most sampled items', () => {
    const fields: LookupFieldCandidate[] = [{ name: 'subtitle', type: 'text', searchable: true, nullRate: 0.8 }];

    expect(checkLookupFields({ nameFields: ['subtitle'] }, fields, external).warnings[0].message).toContain('80%');
  });

  it('checks only the fields a save adds', () => {
    const result = checkLookupFields({ nameFields: ['gone', 'name'] }, demoIndex, managed, new Set(['name']));

    expect(result.errors).toEqual([]);
  });
});

describe('set up and missing fields', () => {
  it('counts any chosen field, or a hand-set idField, as set up', () => {
    expect(hasChosenLookupFields({})).toBe(false);
    expect(hasChosenLookupFields({ nameFields: [] })).toBe(false);
    expect(hasChosenLookupFields({ codeFields: ['sku'] })).toBe(true);
    expect(hasChosenLookupFields({ idField: 'productId' })).toBe(true);
  });

  it('lists chosen fields the source no longer has', () => {
    expect(missingLookupFields({ nameFields: ['name', 'subtitle'], codeFields: ['variants.sku'], idField: 'handle' }, demoIndex)).toEqual([
      'subtitle',
      'handle',
    ]);
  });
});
