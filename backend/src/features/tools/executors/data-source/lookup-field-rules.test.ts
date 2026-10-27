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
      { name: 'sku', type: 'keyword', searchable: false, filterable: true },
      { name: 'ean', type: 'text', filterable: false },
      { name: 'categoryId', type: 'keyword', filterable: true },
    ];

    expect(suggestLookupFields(fields, external)).toEqual({ nameFields: ['storeName'], codeFields: ['sku'] });
    // Fetched by filter, so not being searchable doesn't matter for an external code field
    expect(checkLookupFields({ codeFields: ['sku'] }, fields, external)).toEqual({ errors: [], warnings: [] });
  });

  it('passes over a declared title that is mostly empty for a name field that fits', () => {
    const fields: LookupFieldCandidate[] = [
      { name: 'headline', type: 'text', searchable: true, role: 'title', nullRate: 0.9 },
      { name: 'name', type: 'text', searchable: true, nullRate: 0 },
    ];

    expect(suggestLookupFields(fields, external).nameFields).toEqual(['name']);
  });

  it("suggests the declared id and product codes first, whatever the index's field order", () => {
    const fields: LookupFieldCandidate[] = [
      { name: 'categoryCodeId', type: 'keyword', filterable: true },
      { name: 'storeId', type: 'keyword', filterable: true },
      { name: 'warehouseId', type: 'keyword', filterable: true },
      { name: 'listingId', type: 'keyword', filterable: true },
      { name: 'sku', type: 'keyword', filterable: true },
      { name: 'handle', type: 'keyword', filterable: true, role: 'id' },
    ];

    expect(suggestLookupFields(fields, external).codeFields).toEqual(['handle', 'sku', 'warehouseId']);
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

  it("warns that an external path's filtering can't be checked, and about a field the latest sample didn't show", () => {
    const fields: LookupFieldCandidate[] = [
      { name: 'variants', type: 'object', filterable: false, hasPaths: true },
      { name: 'productName', type: 'text', searchable: true, notInLatestSample: true },
    ];

    const { errors, warnings } = checkLookupFields({ nameFields: ['productName'], codeFields: ['variants.sku'] }, fields, external);

    expect(errors).toEqual([]);
    expect(warnings.map((w) => w.field)).toEqual(['productName', 'variants.sku']);
    expect(warnings.find((w) => w.field === 'variants.sku')?.message).toContain("can't tell whether variants.sku can be filtered on");
  });

  it("refuses a managed index field that is neither searched nor in responses", () => {
    const fields: LookupFieldCandidate[] = [{ name: 'internalCode', type: 'keyword', searchable: false, shownInResponses: false }];

    expect(checkLookupFields({ codeFields: ['internalCode'] }, fields, managed).errors[0].message).toContain("can't match on it");
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
