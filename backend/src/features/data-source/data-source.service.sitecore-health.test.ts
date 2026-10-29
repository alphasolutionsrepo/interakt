// src/features/data-source/data-source.service.sitecore-health.test.ts

/**
 * The health check on a Sitecore source with a fixed filter written as text for a
 * number attribute (`year = 2024`). Sitecore rejects a value of the wrong type, so
 * the probe leaves the fixed filters out, and discovery samples within them, learning
 * the types from the whole widget first when Sitecore refuses a value. Field profiling
 * and the document count send them as the types searches use; the count is the
 * request every search makes, so its failure makes the source unhealthy. Runs
 * the real health check and connector; only the stored source and the network
 * are faked.
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

function source(fields?: DataSourceField[], yearValue: string | null = '2024') {
  return {
    id: 'ds-1',
    type: 'search_index_external',
    config: {
      provider: 'sitecore_search',
      connection: { url: 'https://discover.sitecorecloud.io/discover/v2/123', indexName: 'rfk_global_search', authType: 'none' },
      providerSettings: { fixedFilters: yearValue === null ? [] : [{ field: 'year', operator: 'eq', value: yearValue }] },
    },
    schema: fields ? { fields } : null,
  };
}

/** Sitecore: rejects a text value for year, like the live engine; otherwise one item */
const sitecore = vi.fn(async (_url: string, init?: RequestInit) => {
  const filter = JSON.parse(String(init?.body)).widget.items[0].search.filter;
  const year = filter?.filters?.[0]?.value;
  if (typeof year === 'string') {
    return new Response(`{"message":"filter value '${year}' not of the expected type"}`, { status: 400 });
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
  it('is healthy on first check, learns the type, and counts with the converted value', async () => {
    repository.getDataSourceById.mockResolvedValue(source());

    const result = await performHealthCheck('ds-1');

    expect(result.status).toBe('healthy');
    expect(result.documentCount).toBe(1);
    expect(result.schema?.fields.find((f) => f.name === 'year')?.valueType).toBe('number');
    const converted = { type: 'and', filters: [{ type: 'eq', name: 'year', value: 2024 }] };
    const asWritten = { type: 'and', filters: [{ type: 'eq', name: 'year', value: '2024' }] };
    // probe; discovery: scoped (refused), whole widget to learn types, scoped again; profiling; count
    expect(sentFilters()).toEqual([undefined, asWritten, undefined, converted, converted, converted]);
  });

  it("uses a stored type when this sample didn't see the attribute, or found no fields at all", async () => {
    const storedYear: DataSourceField = { name: 'year', displayName: 'Year', type: 'number', providerType: 'number', valueType: 'number', isSearchable: false, isFacetable: false, isFilterable: false };
    repository.getDataSourceById.mockResolvedValue(source([storedYear]));
    const answer = (content: object[]) => new Response(JSON.stringify({ widgets: [{ rfk_id: 'rfk_global_search', total_item: 1, content }] }));
    const converted = { type: 'and', filters: [{ type: 'eq', name: 'year', value: 2024 }] };

    // This sample's items have no year
    sitecore.mockImplementationOnce(async () => answer([{ id: 'a', title: 'Linen shirt' }]));
    sitecore.mockImplementationOnce(async () => answer([{ id: 'a', title: 'Linen shirt' }]));
    const missing = await performHealthCheck('ds-1');
    expect(missing.status).toBe('healthy');
    // discovery within the fixed filters in one call, profiling, the count
    expect(sentFilters().slice(1)).toEqual([converted, converted, converted]);

    // The sample is empty: no fields discovered
    sitecore.mockClear();
    sitecore.mockImplementationOnce(async () => answer([]));
    sitecore.mockImplementationOnce(async () => answer([]));
    const empty = await performHealthCheck('ds-1');
    expect(empty.status).toBe('healthy');
    expect(sentFilters().at(-1)).toEqual(converted);
  });

  it("is unhealthy, naming the fixed filters, when they can't be used, and keeps the discovered fields", async () => {
    repository.getDataSourceById.mockResolvedValue(source(undefined, 'recent'));

    const result = await performHealthCheck('ds-1');

    expect(result.status).toBe('error');
    expect(result.message).toMatch(/^Searches with this source's fixed filters fail: .*'recent' not of the expected type/);
    expect(result.schema?.fields.map((f) => f.name)).toEqual(['id', 'title', 'year']);
  });

  it('stays healthy when only the count fails on a source with no fixed filters', async () => {
    repository.getDataSourceById.mockResolvedValue(source(undefined, null));
    sitecore
      .mockImplementationOnce(async () => new Response(JSON.stringify({ widgets: [{ rfk_id: 'rfk_global_search', total_item: 1, content: [{ id: 'a' }] }] })))
      .mockImplementationOnce(async () => new Response(JSON.stringify({ widgets: [{ rfk_id: 'rfk_global_search', total_item: 1, content: [{ id: 'a' }] }] })))
      .mockImplementationOnce(async () => new Response(JSON.stringify({ widgets: [{ rfk_id: 'rfk_global_search', total_item: 1, content: [{ id: 'a' }] }] })))
      .mockImplementationOnce(async () => new Response('{"message":"busy"}', { status: 503 }));

    const result = await performHealthCheck('ds-1');

    expect(result.status).toBe('healthy');
    expect(result.documentCount).toBeUndefined();
    expect(result.message).not.toMatch(/fixed filters/);
  });
});
