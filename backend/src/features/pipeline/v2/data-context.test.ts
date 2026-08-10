// src/features/pipeline/v2/data-context.test.ts

import { describe, it, expect } from 'vitest';

import { buildDataContext, type DataContextSource } from './data-context';

import type { DataSourceField } from '@/db/schema/data-sources.schema';

function field(name: string, overrides: Partial<DataSourceField> = {}): DataSourceField {
  return {
    name,
    displayName: name,
    type: 'keyword',
    isSearchable: false,
    isFacetable: true,
    isFilterable: true,
    ...overrides,
  };
}

function profile(overrides: Partial<NonNullable<DataSourceField['profile']>> = {}) {
  return {
    sampleSize: 50,
    nullRate: 0,
    distinctInSample: 4,
    profiledAt: '2026-08-05T00:00:00.000Z',
    ...overrides,
  };
}

function source(fields: DataSourceField[], overrides: Partial<DataContextSource> = {}): DataContextSource {
  return { toolSlugs: ['catalog-search'], sourceName: 'Fashion Catalog', fields, ...overrides };
}

describe('buildDataContext', () => {
  it('says nothing when there is no schema to describe', () => {
    // The template collapses cleanly rather than emitting an empty heading.
    expect(buildDataContext([])).toBe('');
    expect(buildDataContext([source([])])).toBe('');
  });

  it('lists observed values so an exact-match filter can hit', () => {
    // The failure this prevents: a filter on "mens" against a field whose value is "Men"
    // returns nothing, and nothing in the result explains why.
    const rendered = buildDataContext([
      source([field('gender', { profile: profile({ sampleValues: ['Kids', 'Men', 'Unisex', 'Women'] }) })]),
    ]);

    expect(rendered).toContain('values: Kids, Men, Unisex, Women');
  });

  it('warns off a field that is empty in most documents', () => {
    // The fact that broke a real demo: a date field on the schema and absent from almost
    // every document, so anything ordered or filtered by recency returned nothing.
    const rendered = buildDataContext([
      source([field('published', { type: 'date', profile: profile({ nullRate: 0.92 }) })]),
    ]);

    expect(rendered).toContain('empty in 92% of sampled documents');
    expect(rendered).toContain('do not rely on it');
  });

  it('states what the provider will allow per field', () => {
    const rendered = buildDataContext([
      source([
        field('brand', { isFilterable: true, isSortable: true }),
        field('body', { type: 'text', isSearchable: true, isFilterable: false, isFacetable: false }),
      ]),
    ]);

    expect(rendered).toContain('brand (keyword, filterable/sortable)');
    expect(rendered).toContain('body (text, searchable)');
  });

  it('marks a field that can only be returned', () => {
    const rendered = buildDataContext([
      source([field('imageUrl', { isSearchable: false, isFilterable: false, isFacetable: false })]),
    ]);

    expect(rendered).toContain('returned only');
  });

  it('includes an operator-written description', () => {
    const rendered = buildDataContext([
      source([field('type', { description: 'file format, not a subject category' })]),
    ]);

    expect(rendered).toContain('file format, not a subject category');
  });

  it('names the tools that reach each source', () => {
    const rendered = buildDataContext([
      source([field('brand')], { toolSlugs: ['catalog-search', 'catalog-values'] }),
    ]);

    expect(rendered).toContain('queried via catalog-search, catalog-values');
  });

  it('groups by source rather than repeating fields per tool', () => {
    // Search, inspect and enumerate usually read the same index; repeating the field list
    // once per tool would triple the prompt for no added information.
    const rendered = buildDataContext([
      source([field('brand')], { toolSlugs: ['a', 'b', 'c'] }),
    ]);

    expect(rendered.match(/- brand/g)).toHaveLength(1);
  });

  it('orders sources deterministically so two identical turns build one prompt', () => {
    const fields = [field('brand')];
    const forward = buildDataContext([
      source(fields, { sourceName: 'Zebra' }),
      source(fields, { sourceName: 'Alpha' }),
    ]);
    const reverse = buildDataContext([
      source(fields, { sourceName: 'Alpha' }),
      source(fields, { sourceName: 'Zebra' }),
    ]);

    expect(forward).toBe(reverse);
    expect(forward.indexOf('Alpha')).toBeLessThan(forward.indexOf('Zebra'));
  });

  it('caps the field list and says how many it left out', () => {
    // A truncated list the planner believes is complete makes it conclude a field does not
    // exist. Silence here would be the same defect as a filter dropped without a word.
    const many = Array.from({ length: 40 }, (_, i) => field(`f${String(i).padStart(2, '0')}`));
    const rendered = buildDataContext([source(many)]);

    expect(rendered).toContain('10 further fields not listed');
    expect(rendered).toContain('inspect');
  });

  it('keeps the most useful fields when it has to cut', () => {
    // Fields with known values and filterability earn their place; fields that are empty in
    // most documents are the first to go, since relying on one returns nothing.
    const useful = field('gender', { profile: profile({ sampleValues: ['Men', 'Women'] }) });
    const useless = Array.from({ length: 40 }, (_, i) =>
      field(`empty${i}`, { profile: profile({ nullRate: 1 }) }),
    );
    const rendered = buildDataContext([source([...useless, useful])]);

    expect(rendered).toContain('- gender');
  });

  it('ranks a prose field above payload noise', () => {
    // Found against a real index: the ranking put a catalog's product name and descriptions
    // below its image URLs, so the fields a topical query must actually search were the
    // ones cut from the list. The planner cannot search well without them.
    const prose = field('longDescription', {
      type: 'text',
      isSearchable: true,
      isFilterable: false,
      isFacetable: false,
      profile: profile({ distinctInSample: 50 }),
    });
    const noise = Array.from({ length: 40 }, (_, i) =>
      field(`asset${i}`, {
        profile: profile({ sampleValues: ['https://cdn.example.com/a.jpg'] }),
      }),
    );

    const rendered = buildDataContext([source([...noise, prose])]);

    expect(rendered).toContain('- longDescription');
  });

  it('lists a URL field without listing its URLs', () => {
    // Eight asset links cost real tokens and give the planner nothing to filter or search
    // on. Detected from the sampled values, not the field name — name matching misses
    // primaryImageUrl, hero_asset and every non-English equivalent.
    const rendered = buildDataContext([
      source([
        field('primaryImageUrl', {
          profile: profile({ sampleValues: ['https://cdn.example.com/a.jpg', 'https://cdn.example.com/b.jpg'] }),
        }),
      ]),
    ]);

    expect(rendered).toContain('- primaryImageUrl');
    expect(rendered).not.toContain('cdn.example.com');
  });

  it('honors a configured field cap', () => {
    const many = Array.from({ length: 20 }, (_, i) => field(`f${String(i).padStart(2, '0')}`));
    const rendered = buildDataContext([source(many)], { maxFieldsPerSource: 5 });

    expect(rendered.match(/^- /gm)).toHaveLength(5);
    expect(rendered).toContain('15 further fields not listed');
  });

  it('turns the block off entirely at a field cap of zero', () => {
    // How an operator opts out of paying for schema in every planning call.
    expect(buildDataContext([source([field('brand')])], { maxFieldsPerSource: 0 })).toBe('');
  });

  it('honors a configured value cap', () => {
    const sampleValues = ['a', 'b', 'c', 'd', 'e'];
    const rendered = buildDataContext(
      [source([field('color', { profile: profile({ sampleValues }) })])],
      { maxValuesPerField: 2 },
    );

    expect(rendered).toContain('values: a, b, … (3 more seen)');
  });

  it('keeps the field but drops its values at a value cap of zero', () => {
    const rendered = buildDataContext(
      [source([field('color', { profile: profile({ sampleValues: ['red'] }) })])],
      { maxValuesPerField: 0 },
    );

    expect(rendered).toContain('- color');
    expect(rendered).not.toContain('values:');
  });

  it('falls back to the defaults for absent or nonsensical limits', () => {
    const many = Array.from({ length: 40 }, (_, i) => field(`f${String(i).padStart(2, '0')}`));
    const withDefaults = buildDataContext([source(many)]);

    expect(buildDataContext([source(many)], {})).toBe(withDefaults);
    expect(buildDataContext([source(many)], { maxFieldsPerSource: -1 })).toBe(withDefaults);
    expect(buildDataContext([source(many)], { maxFieldsPerSource: Number.NaN })).toBe(withDefaults);
  });

  it('caps values per field and says more were seen', () => {
    const sampleValues = Array.from({ length: 12 }, (_, i) => `v${i}`);
    const rendered = buildDataContext([source([field('color', { profile: profile({ sampleValues }) })])]);

    expect(rendered).toContain('(4 more seen)');
  });

  it('describes an unprofiled source by its field names alone', () => {
    // Nothing is claimed that was not measured.
    const rendered = buildDataContext([source([field('brand'), field('size')])]);

    expect(rendered).toContain('- brand');
    expect(rendered).not.toContain('values:');
    expect(rendered).not.toContain('empty in');
  });

  it('steers topical wording to search rather than to a filter', () => {
    const rendered = buildDataContext([source([field('brand')])]);

    expect(rendered).toContain('measured from a sample of real documents');
    expect(rendered).toContain('text search');
  });
});
