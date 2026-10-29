// src/features/search-experience/external-source-search.sitecore.test.ts

/**
 * A search experience on a Sitecore source, through the real external search
 * service and connector: facet values arrive as text, and go out as the type
 * discovery saw. Only the data source lookup, its connection and fetch are stubbed.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DataSourceField } from '@/db/schema/data-sources.schema';

const { storedFields } = vi.hoisted(() => ({ storedFields: { value: [] as DataSourceField[] } }));

vi.mock('@/features/analytics', () => ({ trackSearch: vi.fn() }));
vi.mock('@/features/data-source/data-source.service', () => ({
  getDataSourceById: vi.fn(async () => ({
    id: 'ds',
    name: 'Sitecore',
    type: 'search_index_external',
    isActive: true,
    config: {},
    schema: { fields: storedFields.value, discoveredFrom: 'sample' },
  })),
}));
vi.mock('@/features/data-source/external-search/external-connection', () => ({
  resolveExternalConnection: vi.fn(async () => ({
    provider: 'sitecore-search',
    endpoint: 'https://discover.sitecorecloud.io/discover/v2/123',
    indexName: 'rfk_global_search',
    apiKey: '',
    authType: 'none',
    providerSettings: {},
  })),
}));

import { inferSitecoreFields } from '@/features/data-source/external-search/connectors/sitecore-search.connector';
import { SearchError } from '@/features/search/search.types';

import { searchExternalSourceForExperience } from './external-source-search';
import type { SearchExperienceExternalSourceWithDetails, SearchExperienceWithIndexes } from './search-experience.types';

const SOURCE = { dataSourceId: 'ds', dataSource: { name: 'Sitecore' } } as SearchExperienceExternalSourceWithDetails;
const EXPERIENCE = { id: 'exp', slug: 'exp' } as SearchExperienceWithIndexes;

function stubSitecore() {
  const fetchMock = vi.fn(async () => ({
    ok: true,
    text: async () => JSON.stringify({ widgets: [{ rfk_id: 'rfk_global_search', total_item: 0, content: [] }] }),
  }));
  vi.stubGlobal('fetch', fetchMock);
  return () => JSON.parse((fetchMock.mock.calls[0] as unknown as [string, { body: string }])[1].body).widget.items[0].search.filter;
}

afterEach(() => vi.unstubAllGlobals());

describe('search experience on a Sitecore source', () => {
  storedFields.value = inferSitecoreFields({
    items: [{ id: 'a', year: 2024, open: true }],
    total: 1,
    facets: new Map([['year', 'Year'], ['open', 'Open']]),
  });

  it('sends a facet value as the type discovery saw', async () => {
    const sent = stubSitecore();

    await searchExternalSourceForExperience(
      SOURCE, storedFields.value, { query: 'x', filters: [{ field: 'year', operator: 'eq', value: '2024' }] }, EXPERIENCE,
    );

    expect(sent()).toEqual({ type: 'and', filters: [{ type: 'eq', name: 'year', value: 2024 }] });
  });

  it("refuses a value that can't be its field's type, saying why, and never sends that value", async () => {
    const sent = stubSitecore();

    const search = searchExternalSourceForExperience(
      SOURCE, storedFields.value, { query: 'x', filters: [{ field: 'open', operator: 'eq', value: 'Yes' }] }, EXPERIENCE,
    );

    await expect(search).rejects.toMatchObject({
      code: 'INVALID_FILTER',
      message: `This search source can't apply the filter (open: "Yes" is not a boolean value for 'open')`,
    });
    // Sitecore is asked without the filter, and that answer is refused rather than returned
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
    expect(sent()).toBeUndefined();
  });
});
