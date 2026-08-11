// src/features/data-source/field-profiler.test.ts

import { describe, it, expect } from 'vitest';

import { profileFields, resolveSampleSize, DEFAULT_PROFILE_SAMPLE_SIZE } from './field-profiler';

import type { DataSourceField } from '@/db/schema/data-sources.schema';

const AT = '2026-08-05T00:00:00.000Z';

function field(name: string, overrides: Partial<DataSourceField> = {}): DataSourceField {
  return {
    name,
    displayName: name,
    type: 'keyword',
    isSearchable: true,
    isFacetable: true,
    isFilterable: true,
    ...overrides,
  };
}

function profileOf(f: DataSourceField, docs: Record<string, unknown>[]) {
  const profiled = profileFields([f], docs, AT);
  return profiled[0].profile!;
}

describe('profileFields', () => {
  it('measures how often a field is empty', () => {
    // The fact that fixed a real demo: a date field present on the schema and absent from
    // almost every document, so anything relying on recency silently returned nothing.
    const docs = [{ published: '2026-01-01' }, {}, {}, {}];
    const profile = profileOf(field('published', { type: 'date' }), docs);

    expect(profile.sampleSize).toBe(4);
    expect(profile.nullRate).toBe(0.75);
  });

  it('counts an empty string and an empty array as absent', () => {
    // "Present but blank" is indistinguishable from missing when deciding whether a field
    // can be filtered on — counting them as populated would overstate the field.
    const docs = [{ tags: [] }, { tags: '' }, { tags: '   ' }, { tags: ['sale'] }];
    const profile = profileOf(field('tags'), docs);

    expect(profile.nullRate).toBe(0.75);
    expect(profile.distinctInSample).toBe(1);
  });

  it('counts each element of an array field as its own value', () => {
    // Every element is independently filterable, so a stringified array would both
    // undercount and offer a value that matches nothing.
    const docs = [{ tags: ['sale', 'new'] }, { tags: ['sale'] }];
    const profile = profileOf(field('tags'), docs);

    expect(profile.distinctInSample).toBe(2);
    expect(profile.sampleValues).toEqual(['new', 'sale']);
  });

  it('reports example values for a low-cardinality field', () => {
    const docs = [{ size: 'S' }, { size: 'M' }, { size: 'L' }, { size: 'M' }];
    const profile = profileOf(field('size'), docs);

    expect(profile.sampleValues).toEqual(['L', 'M', 'S']);
    expect(profile.distinctInSample).toBe(3);
  });

  it('preserves inconsistent casing rather than normalizing it away', () => {
    // `story` and `Story` being separate values is the finding, not noise: an exact-match
    // filter on the wrong casing returns nothing.
    const docs = [{ articleType: 'story' }, { articleType: 'Story' }];
    const profile = profileOf(field('articleType'), docs);

    expect(profile.sampleValues).toEqual(['Story', 'story']);
    expect(profile.distinctInSample).toBe(2);
  });

  it('omits example values for an analyzed field with no keyword sub-field', () => {
    // Two sentences of body copy are not a value list. Offering them as one invites the
    // planner to filter on prose, which is exactly the mistake profiling should prevent.
    const docs = [{ body: 'A description.' }, { body: 'Another one.' }];
    const profile = profileOf(field('body', { type: 'text', providerType: 'text', isFilterable: false }), docs);

    expect(profile.sampleValues).toBeUndefined();
    expect(profile.nullRate).toBe(0);
  });

  it('offers example values for a keyword field the normalized type calls text', () => {
    // Discovery collapses Elasticsearch `keyword` to type 'text'. Gating examples on that
    // label withheld them from the most filterable fields in the index — the same lossy
    // -label trap that made filter translation need providerType.
    const docs = [{ brand: 'Coastal Haven' }, { brand: 'Skyline Fashion' }];
    const profile = profileOf(field('brand', { type: 'text', providerType: 'keyword' }), docs);

    expect(profile.sampleValues).toEqual(['Coastal Haven', 'Skyline Fashion']);
  });

  it('omits example values for a field whose role says it holds prose', () => {
    const docs = [{ summary: 'short' }, { summary: 'also short' }];
    const profile = profileOf(field('summary', { role: 'description' }), docs);

    expect(profile.sampleValues).toBeUndefined();
  });

  it('still reports example values for a text field that has a keyword sub-field', () => {
    // Such a field IS exact-matchable, so its values are genuinely useful.
    const docs = [{ material: 'cotton' }, { material: 'wool' }];
    const profile = profileOf(
      field('material', { type: 'text', providerType: 'text', filterField: 'material.keyword' }),
      docs,
    );

    expect(profile.sampleValues).toEqual(['cotton', 'wool']);
  });

  it('omits example values when the field is too varied to enumerate', () => {
    const docs = Array.from({ length: 40 }, (_, i) => ({ sku: `SKU-${i}` }));
    const profile = profileOf(field('sku'), docs);

    expect(profile.distinctInSample).toBe(40);
    expect(profile.sampleValues).toBeUndefined();
  });

  it('omits example values when any value is long enough to be prose', () => {
    const docs = [{ note: 'ok' }, { note: 'x'.repeat(120) }];
    const profile = profileOf(field('note'), docs);

    expect(profile.sampleValues).toBeUndefined();
    // Still counted: length decides what can be shown, not what exists. Excluding long
    // values from the count reported a populated free-text field as having zero distinct
    // values alongside a null rate of zero, which reads as a contradiction.
    expect(profile.distinctInSample).toBe(2);
    expect(profile.nullRate).toBe(0);
  });

  it('caps the number of example values', () => {
    const docs = Array.from({ length: 20 }, (_, i) => ({ color: `c${i}` }));
    const profile = profileOf(field('color'), docs);

    expect(profile.sampleValues).toHaveLength(10);
  });

  it('reads a nested field through its dotted path', () => {
    const docs = [{ variants: { color: 'red' } }, { variants: { color: 'blue' } }];
    const profile = profileOf(field('variants.color'), docs);

    expect(profile.nullRate).toBe(0);
    expect(profile.sampleValues).toEqual(['blue', 'red']);
  });

  it('descends into an array of objects', () => {
    // Product documents hold `variants` as an array while the mapping advertises
    // `variants.sku` as a field. Stopping at the array reported every such field as absent
    // from every document — a confident, wrong measurement headed for a prompt.
    const docs = [
      { variants: [{ sku: 'A-1', size: 'L' }, { sku: 'A-2', size: 'M' }] },
      { variants: [{ sku: 'B-1', size: 'L' }] },
    ];

    expect(profileOf(field('variants.sku'), docs).nullRate).toBe(0);
    expect(profileOf(field('variants.size'), docs).sampleValues).toEqual(['L', 'M']);
    expect(profileOf(field('variants.sku'), docs).distinctInSample).toBe(3);
  });

  it('counts a document whose array is empty as missing the nested field', () => {
    const docs = [{ variants: [] }, { variants: [{ sku: 'A-1' }] }];

    expect(profileOf(field('variants.sku'), docs).nullRate).toBe(0.5);
  });

  it('counts an empty object as absent', () => {
    const docs = [{ customFields: {} }, { customFields: { a: 'x' } }];

    expect(profileOf(field('customFields'), docs).nullRate).toBe(0.5);
  });

  it('prefers a literal dotted key over a nested path', () => {
    // Elasticsearch mappings can declare a field literally named "a.b".
    const docs = [{ 'a.b': 'flat' }];
    const profile = profileOf(field('a.b'), docs);

    expect(profile.sampleValues).toEqual(['flat']);
  });

  it('treats a field missing from every document as fully empty', () => {
    const profile = profileOf(field('ghost'), [{ other: 1 }, { other: 2 }]);

    expect(profile.nullRate).toBe(1);
    expect(profile.distinctInSample).toBe(0);
    expect(profile.sampleValues).toBeUndefined();
  });

  it('leaves fields untouched when there is no sample', () => {
    // A `sampleSize: 0` profile would read as a measurement. Absent is the honest answer.
    const fields = [field('brand')];
    const result = profileFields(fields, [], AT);

    expect(result).toBe(fields);
    expect(result[0].profile).toBeUndefined();
  });

  it('stamps every profile with the same timestamp', () => {
    const result = profileFields([field('a'), field('b')], [{ a: 1, b: 2 }], AT);

    expect(result.map(f => f.profile?.profiledAt)).toEqual([AT, AT]);
  });

  it('does not mutate the fields it was given', () => {
    const original = field('brand');
    profileFields([original], [{ brand: 'x' }], AT);

    expect(original.profile).toBeUndefined();
  });
});

describe('resolveSampleSize', () => {
  it('defaults when unset', () => {
    expect(resolveSampleSize(undefined)).toBe(DEFAULT_PROFILE_SAMPLE_SIZE);
  });

  it('honors an explicit zero so profiling can be turned off', () => {
    expect(resolveSampleSize(0)).toBe(0);
  });

  it('caps an unreasonable request', () => {
    expect(resolveSampleSize(100_000)).toBe(500);
  });

  it('falls back to the default for nonsense', () => {
    expect(resolveSampleSize(-5)).toBe(DEFAULT_PROFILE_SAMPLE_SIZE);
    expect(resolveSampleSize(Number.NaN)).toBe(DEFAULT_PROFILE_SAMPLE_SIZE);
  });
});
