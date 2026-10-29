// src/features/data-source/data-source.service.sitecore-health.test.ts

/**
 * The health check on a Sitecore source with a fixed filter written as text for a
 * number attribute (`year = 2024`). Sitecore rejects a value of the wrong type, so
 * the probe and field discovery leave the fixed filters out, and the calls that
 * keep them (document count, field profiling) send each value as its field's type
 * once it's known. Runs the real health check and connector; only the stored
 * source and the network are faked.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const repository = vi.hoisted(() => ({ getDataSourceById: vi.fn(), updateDataSource: vi.fn() }));
vi.mock('./data-source.repository', () => repository);
vi.mock('@/features/search-experience/search-experience.cache', () => ({ invalidateByDataSource: vi.fn() }));
vi.mock('@/features/search-index/search-index.repository', () => ({}));
vi.mock('@/features/secrets/secrets.service', () => ({ resolveSecret: vi.fn() }));
vi.mock('@/features/tools/tools.service', () => ({}));

import { performHealthCheck } from './data-source.service';

import type { DataSourceField } from '@/db/schema/data-sources.schema';

const YEAR_FILTER = { field: 'year', operator: 'eq', value: '2024' };

function source(fields?: DataSourceField[]) {
  return {
    id: 'ds-1',
    type: 'search_index_external',
    config: {
      provider: 'sitecore_search',
      connection: { url: 'https://discover.sitecorecloud.io/discover/v2/123', indexName: 'rfk_global_search', authType: 'none' },
      providerSettings: { fixedFilters: [YEAR_FILTER] },
    },
    schema: fields ? { fields } : null,
  };
}

/** Sitecore: rejects a text value for year, like the live engine; otherwise one item */
const sitecore = vi.fn(async (_url: string, init?: RequestInit) => {
  const filter = JSON.parse(String(init?.body)).widget.items[0].search.filter;
  if (JSON.stringify(filter ?? {}).includes('"value":"2024"')) {
    return new Response(`{"message":"filter value '2024' not of the expected type"}`, { status: 400 });
  }
  return new Response(JSON.stringify({
    widgets: [{ rfk_id: 'rfk_global_search', total_item: 1, content: [{ id: 'a', title: 'Linen shirt', year: 2024 }] }],
  }));
});

/** The filter each call sent, in order */
const sentFilters = () => sitecore.mock.calls.map(
  (call) => JSON.parse(String((call[1] as RequestInit).body)).widget.items[0].search.filter,
);

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', sitecore);
  repository.updateDataSource.mockResolvedValue({});
});
afterEach(() => vi.unstubAllGlobals());

describe('health check on a Sitecore source whose fixed filter is written as text for a number', () => {
  it('is healthy on first check and learns the type, profiling with the converted value', async () => {
    repository.getDataSourceById.mockResolvedValue(source());

    const result = await performHealthCheck('ds-1');

    expect(result.status).toBe('healthy');
    expect(result.schema?.fields.find((f) => f.name === 'year')?.valueType).toBe('number');
    const converted = { type: 'and', filters: [{ type: 'eq', name: 'year', value: 2024 }] };
    // probe, document count (no types yet, so as written: best-effort, refused), discovery, profiling
    expect(sentFilters()).toEqual([
      undefined,
      { type: 'and', filters: [{ type: 'eq', name: 'year', value: '2024' }] },
      undefined,
      converted,
    ]);
  });

  it('counts documents with the converted value once the type is stored', async () => {
    repository.getDataSourceById.mockResolvedValue(source([
      { name: 'year', displayName: 'Year', type: 'number', providerType: 'number', valueType: 'number', isSearchable: false, isFacetable: false, isFilterable: false },
    ]));

    const result = await performHealthCheck('ds-1');

    expect(result.status).toBe('healthy');
    expect(result.documentCount).toBe(1);
    expect(sentFilters()[1]).toEqual({ type: 'and', filters: [{ type: 'eq', name: 'year', value: 2024 }] });
  });
});
