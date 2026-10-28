// src/features/tools/executors/data-source/search.sitecore-field-types.test.ts

/**
 * The chat search tool on a Sitecore source, through the real connector and the
 * source's stored schema: Sitecore rejects a filter value that isn't its
 * attribute's type, so values go out as the type discovery saw. Only fetch is stubbed.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DataSourceField } from '@/db/schema/data-sources.schema';

const { storedFields } = vi.hoisted(() => ({ storedFields: { value: [] as DataSourceField[] } }));

vi.mock('@/features/search/search.service', () => ({ getExperienceContext: () => undefined }));
vi.mock('@/features/analytics', () => ({ trackSearch: vi.fn() }));
vi.mock('@/features/data-source/data-source.service', () => ({
  getDataSourceById: vi.fn(async () => ({ schema: { fields: storedFields.value, discoveredFrom: 'sample' } })),
}));
vi.mock('@/features/search-index/search-index.service', () => ({ getSearchIndexById: vi.fn() }));
vi.mock('./shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./shared')>()),
  resolveDataSource: vi.fn(async () => ({
    kind: 'external',
    provider: 'sitecore-search',
    endpoint: 'https://discover.sitecorecloud.io/discover/v2/123',
    indexName: 'rfk_global_search',
    apiKey: '',
    authType: 'none',
    providerSettings: {},
    dataSourceId: 'ds',
  })),
}));

import { inferSitecoreFields } from '@/features/data-source/external-search/connectors/sitecore-search.connector';

import { executeDataSourceSearch } from './search';

function stubSitecore() {
  const fetchMock = vi.fn(async () => ({
    ok: true,
    text: async () => JSON.stringify({ widgets: [{ rfk_id: 'rfk_global_search', total_item: 0, content: [] }] }),
  }));
  vi.stubGlobal('fetch', fetchMock);
  return () => JSON.parse((fetchMock.mock.calls[0] as unknown as [string, { body: string }])[1].body).widget.items[0].search.filter.filters;
}

afterEach(() => vi.unstubAllGlobals());

// What the model may write: numbers and text, whatever the attribute holds
const filters = [
  { field: 'type', operator: 'eq', value: 80 },
  { field: 'year', operator: 'gte', value: '2020' },
  { field: 'rating', operator: 'eq', value: 2 },
];

describe('chat search tool on a Sitecore source', () => {
  it('sends each value as the type discovery saw, and an unsampled attribute as given', async () => {
    storedFields.value = inferSitecoreFields({
      items: [{ id: 'a', type: 'page', year: 2024 }],
      total: 1,
      facets: new Map([['rating', 'Rating']]),
    });
    const sent = stubSitecore();

    const result = await executeDataSourceSearch('ds', {}, { query: 'shirts', filters });

    expect(result.success).toBe(true);
    expect(sent()).toEqual([
      { type: 'eq', name: 'type', value: '80' },
      { type: 'gte', name: 'year', value: 2020 },
      { type: 'eq', name: 'rating', value: 2 },
    ]);
  });

  it('sends values as given for a source discovered before value types were recorded', async () => {
    storedFields.value = [
      { name: 'type', displayName: 'Type', type: 'text', providerType: 'string', isSearchable: false, isFacetable: true, isFilterable: true },
      { name: 'year', displayName: 'Year', type: 'number', providerType: 'number', isSearchable: false, isFacetable: false, isFilterable: false },
      { name: 'rating', displayName: 'Rating', type: 'text', providerType: 'string', isSearchable: false, isFacetable: true, isFilterable: true },
    ];
    const sent = stubSitecore();

    await executeDataSourceSearch('ds', {}, { query: 'shirts', filters });

    expect(sent()).toEqual([
      { type: 'eq', name: 'type', value: 80 },
      { type: 'gte', name: 'year', value: '2020' },
      { type: 'eq', name: 'rating', value: 2 },
    ]);
  });
});
