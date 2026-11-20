// src/features/data-source/external-search/connectors/content-hub.request.test.ts

import { describe, it, expect, vi } from 'vitest';

import { fieldKind, fullTextFilter, queryWords, rankByWords, rankScore, rankingProperties, translateContentHubFilters, translateContentHubSort, type ContentHubResolver } from './content-hub.request';

import type { DataSourceField } from '@/db/schema/data-sources.schema';


const field = (name: string, providerType: string, description?: string): DataSourceField => ({
  name, displayName: name, type: 'text', providerType, description, isSearchable: false, isFacetable: true, isFilterable: true,
});

const FIELDS: DataSourceField[] = [
  field('Acme.PCM.Category', 'Relation[]:Acme.PCM.Category'),
  field('FinalLifeCycleStatusToAsset', 'Relation:M.Final.LifeCycle.Status'),
  field('Acme.PCM.Product.ItemStatus', 'String:OptionList', 'Option list Acme.PCM.Product.ItemStatus'),
  field('Acme.PCM.FamilyName', 'String'),
  field('Acme.PCM.ActivationDate', 'DateTime'),
  field('Acme.PCM.Price', 'Decimal'),
  field('Acme.PCM.HideFromCustomer', 'Boolean'),
];

const resolver: ContentHubResolver = {
  relationIds: vi.fn(async (target: string, value: unknown) => {
    if (target === 'Acme.PCM.Category' && value === 'Cabinets') return [2687641, 2704385];
    if (target === 'M.Final.LifeCycle.Status' && value === 'Approved') return [544];
    return [];
  }),
  optionIdentifiers: vi.fn(async (list: string, value: unknown) => (value === 'Active' ? ['Acme.PCM.Product.ItemStatus.Active'] : [])),
};

const translate = (clauses: Parameters<typeof translateContentHubFilters>[0]) => translateContentHubFilters(clauses, FIELDS, resolver);

describe('fieldKind', () => {
  it('reads the kind from the stored provider type', () => {
    expect(fieldKind(FIELDS[0], 'Acme.PCM.Category')).toEqual({ kind: 'relation', target: 'Acme.PCM.Category' });
    expect(fieldKind(FIELDS[2], 'Acme.PCM.Product.ItemStatus')).toEqual({ kind: 'optionList', list: 'Acme.PCM.Product.ItemStatus' });
    expect(fieldKind(FIELDS[3], 'Acme.PCM.FamilyName')).toEqual({ kind: 'string' });
    expect(fieldKind(FIELDS[4], 'Acme.PCM.ActivationDate')).toEqual({ kind: 'date' });
    expect(fieldKind(undefined, 'id')).toEqual({ kind: 'id' });
    expect(fieldKind(undefined, 'modified_on')).toEqual({ kind: 'system', sortField: 'modifiedon' });
    expect(fieldKind(FIELDS[5], 'Acme.PCM.Price')).toEqual({ kind: 'other', providerType: 'Decimal' });
  });
});

describe('translateContentHubFilters', () => {
  it('resolves a relation by name to every matching item, ORed', async () => {
    const { filter, unapplied } = await translate([{ field: 'Acme.PCM.Category', operator: 'eq', value: 'Cabinets' }]);
    expect(unapplied).toEqual([]);
    expect(filter).toEqual({
      type: 'Logical', operator: 'Or',
      left: { type: 'Relation', relation: 'Acme.PCM.Category', id: 2687641 },
      right: { type: 'Relation', relation: 'Acme.PCM.Category', id: 2704385 },
    });
  });

  it('takes numeric relation values as ids without a lookup', async () => {
    const { filter } = await translate([{ field: 'FinalLifeCycleStatusToAsset', operator: 'eq', value: '544' }]);
    expect(filter).toEqual({ type: 'Relation', relation: 'FinalLifeCycleStatusToAsset', id: 544 });
  });

  it('reports a relation value that names nothing instead of guessing', async () => {
    const { filter, unapplied } = await translate([{ field: 'Acme.PCM.Category', operator: 'eq', value: 'Spaceships' }]);
    expect(filter).toBeUndefined();
    expect(unapplied).toEqual([{ field: 'Acme.PCM.Category', operator: 'eq', reason: 'no Acme.PCM.Category item named "Spaceships"' }]);
  });

  it('negates neq and nin', async () => {
    const { filter } = await translate([{ field: 'FinalLifeCycleStatusToAsset', operator: 'neq', value: 'Approved' }]);
    expect(filter).toEqual({ type: 'Negating', query: { type: 'Relation', relation: 'FinalLifeCycleStatusToAsset', id: 544 } });
  });

  it('maps option-list labels to identifiers and keeps unknown values as given', async () => {
    const { filter } = await translate([{ field: 'Acme.PCM.Product.ItemStatus', operator: 'in', value: ['Active', 'Acme.PCM.Product.ItemStatus.Retired'] }]);
    expect(filter).toEqual({
      type: 'Logical', operator: 'Or',
      left: { type: 'StringProperty', property_name: 'Acme.PCM.Product.ItemStatus', operator: 'Equals', value: 'Acme.PCM.Product.ItemStatus.Active' },
      right: { type: 'StringProperty', property_name: 'Acme.PCM.Product.ItemStatus', operator: 'Equals', value: 'Acme.PCM.Product.ItemStatus.Retired' },
    });
  });

  it('translates string equality, contains and prefix', async () => {
    expect((await translate([{ field: 'Acme.PCM.FamilyName', operator: 'eq', value: 'Marina' }])).filter)
      .toEqual({ type: 'StringProperty', property_name: 'Acme.PCM.FamilyName', operator: 'Equals', value: 'Marina' });
    expect((await translate([{ field: 'Acme.PCM.FamilyName', operator: 'contains', value: 'Ven' }])).filter)
      .toEqual({ type: 'StringProperty', property_name: 'Acme.PCM.FamilyName', operator: 'Contains', value: 'Ven' });
    expect((await translate([{ field: 'Acme.PCM.FamilyName', operator: 'prefix', value: 'Ven' }])).filter)
      .toEqual({ type: 'StringProperty', property_name: 'Acme.PCM.FamilyName', operator: 'StartsWith', value: 'Ven' });
  });

  it('translates dates and ranges', async () => {
    expect((await translate([{ field: 'modified_on', operator: 'gt', value: '2025-10-01' }])).unapplied[0].reason).toMatch(/sorted on but not filtered/);
    expect((await translate([{ field: 'Acme.PCM.ActivationDate', operator: 'gte', value: '2025-10-01T00:00:00Z' }])).filter)
      .toEqual({ type: 'DateTimeProperty', property_name: 'Acme.PCM.ActivationDate', operator: 'GreaterThanOrEqual', value: '2025-10-01T00:00:00.000Z' });
    const range = await translate([{ field: 'Acme.PCM.ActivationDate', operator: 'range', value: { from: '2025-01-01', to: '2026-01-01', includeUpper: false } }]);
    expect(range.filter).toEqual({
      type: 'Logical', operator: 'And',
      left: { type: 'DateTimeProperty', property_name: 'Acme.PCM.ActivationDate', operator: 'GreaterThanOrEqual', value: '2025-01-01T00:00:00.000Z' },
      right: { type: 'DateTimeProperty', property_name: 'Acme.PCM.ActivationDate', operator: 'LessThan', value: '2026-01-01T00:00:00.000Z' },
    });
  });

  it('filters ids with IdIn', async () => {
    expect((await translate([{ field: 'id', operator: 'in', value: ['1', '2'] }])).filter).toEqual({ type: 'IdIn', ids: [1, 2] });
  });

  it('ANDs several clauses and reports the ones it cannot express', async () => {
    const { filter, unapplied } = await translate([
      { field: 'Acme.PCM.FamilyName', operator: 'eq', value: 'Marina' },
      { field: 'Acme.PCM.Price', operator: 'gt', value: 100 },
      { field: 'Acme.PCM.HideFromCustomer', operator: 'eq', value: true },
      { field: 'Acme.PCM.FamilyName', operator: 'exists' },
    ]);
    expect(filter).toEqual({ type: 'StringProperty', property_name: 'Acme.PCM.FamilyName', operator: 'Equals', value: 'Marina' });
    expect(unapplied.map((u) => u.field)).toEqual(['Acme.PCM.Price', 'Acme.PCM.HideFromCustomer', 'Acme.PCM.FamilyName']);
    expect(unapplied[0].reason).toMatch(/Decimal/);
    expect(unapplied[2].reason).toMatch(/'exists' is not supported/);
  });

  it('nests and / or / not', async () => {
    const { filter } = await translate([{
      field: '', operator: 'or', filters: [
        { field: 'Acme.PCM.FamilyName', operator: 'eq', value: 'Marina' },
        { field: '', operator: 'not', filters: [{ field: 'Acme.PCM.Product.ItemStatus', operator: 'eq', value: 'Active' }] },
      ],
    }]);
    expect(filter).toEqual({
      type: 'Logical', operator: 'Or',
      left: { type: 'StringProperty', property_name: 'Acme.PCM.FamilyName', operator: 'Equals', value: 'Marina' },
      right: { type: 'Negating', query: { type: 'StringProperty', property_name: 'Acme.PCM.Product.ItemStatus', operator: 'Equals', value: 'Acme.PCM.Product.ItemStatus.Active' } },
    });
  });
});

describe('queryWords', () => {
  it('drops generic words and the definition name, keeps the rest once each', () => {
    expect(queryWords('products Marina', ['M.PCM.Product'])).toEqual(['Marina']);
    expect(queryWords('Brandco products Brandco Retired', ['M.PCM.Product'])).toEqual(['Brandco', 'Retired']);
    expect(queryWords('find me all the assets for Harbor', ['M.Asset'])).toEqual(['Harbor']);
    expect(queryWords('exterior renderings', ['M.Asset'])).toEqual(['exterior', 'renderings']);
    expect(queryWords('*', [])).toEqual([]);
    expect(queryWords('  ', [])).toEqual([]);
  });

  it('ANDs one full-text filter per word', () => {
    expect(fullTextFilter([])).toBeUndefined();
    expect(fullTextFilter(['Marina'])).toEqual({ type: 'FullText', value: 'Marina', operator: 'Equals' });
    expect(fullTextFilter(['exterior', 'rendering'])).toEqual({
      type: 'Logical', operator: 'And',
      left: { type: 'FullText', value: 'exterior', operator: 'Equals' },
      right: { type: 'FullText', value: 'rendering', operator: 'Equals' },
    });
  });
});

describe('translateContentHubSort', () => {
  it('maps system fields, keeps property names, refuses relations, and adds the identifier tie-breaker', () => {
    const { sorting, unapplied } = translateContentHubSort([
      { field: 'modified_on', direction: 'desc' },
      { field: 'Acme.PCM.FamilyName', direction: 'asc' },
      { field: 'Acme.PCM.Category', direction: 'asc' },
    ], FIELDS);
    expect(sorting).toEqual([
      { field: 'modifiedon', order: 'Desc' },
      { field: 'Acme.PCM.FamilyName', order: 'Asc' },
      { field: 'identifier', order: 'Asc' },
    ]);
    expect(unapplied).toEqual([{ field: 'Acme.PCM.Category', reason: 'relations cannot be sorted on' }]);
  });

  it('sorts by identifier alone when nothing is asked', () => {
    expect(translateContentHubSort(undefined, FIELDS).sorting).toEqual([{ field: 'identifier', order: 'Asc' }]);
  });
});

describe('ranking', () => {
  const text = (name: string, extra: Partial<DataSourceField> = {}): DataSourceField => ({
    name, displayName: name, type: 'text', providerType: 'String', role: null,
    isSearchable: false, isFacetable: false, isFilterable: true, isRetrievable: true, isSortable: true, ...extra,
  });
  const fields: DataSourceField[] = [
    text('Title', { role: 'title', isSearchable: true }),
    text('Description', { role: 'description' }),
    text('Notes', { isSearchable: true }),
    text('Code'),
    { ...text('Category'), providerType: 'Relation:Acme.Category', role: 'category' },
  ];

  it('ranks on searchable text, titles and descriptions, never relations', () => {
    expect(rankingProperties(fields)).toEqual(['Title', 'Description', 'Notes']);
    expect(rankingProperties(undefined)).toEqual([]);
  });

  it('prefers whole words in the title, then the text, then partial matches', () => {
    const words = ['kitchen'];
    expect(rankScore({ Title: 'Marina Kitchen 02' }, words, fields)).toBe(4);
    expect(rankScore({ Title: 'Kitchenette' }, words, fields)).toBe(2);
    expect(rankScore({ Title: 'Great room', Description: 'View into the <b>kitchen</b>' }, words, fields)).toBe(1);
    expect(rankScore({ Title: 'Great room', Notes: 'kitchens' }, words, fields)).toBe(0.5);
    expect(rankScore({ Title: 'Great room', Code: 'kitchen' }, words, fields)).toBe(0);
    expect(rankScore({ Title: 'Great room', Category: 'kitchen' }, words, fields)).toBe(0);
  });

  it('rewards the phrase and is case-insensitive', () => {
    const words = ['gas', 'range'];
    expect(rankScore({ Title: 'GAS RANGE 30 inch' }, words, fields)).toBe(4 + 4 + 3);
    expect(rankScore({ Title: 'Range, gas' }, words, fields)).toBe(4 + 4);
  });

  it('reads multilingual and array values', () => {
    expect(rankScore({ Title: { 'en-US': 'Venice cabinet' }, Notes: ['venice', 'harbor'] }, ['venice'], fields)).toBe(5);
  });

  it('orders best first and keeps the incoming order for ties', () => {
    const items = [
      { id: 1, Title: 'Great room' },
      { id: 2, Title: 'Kitchen island' },
      { id: 3, Title: 'Foyer', Description: 'kitchen beyond' },
      { id: 4, Title: 'Kitchen' },
    ];
    expect(rankByWords(items, (i) => i, ['kitchen'], fields).map((i) => i.id)).toEqual([2, 4, 3, 1]);
  });

  it('falls back to every string value without a schema', () => {
    expect(rankScore({ anything: 'a kitchen here' }, ['kitchen'], undefined)).toBe(1);
  });
});
