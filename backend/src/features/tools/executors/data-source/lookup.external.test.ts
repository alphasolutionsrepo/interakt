// src/features/tools/executors/data-source/lookup.external.test.ts

/**
 * Lookup on an external source filters by its id field. When that filter fails
 * outright (an engine where the id attribute isn't filterable), the lookup still
 * finds the document through a search instead of returning the engine error.
 */

import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';

const search = vi.fn();
vi.mock('@/features/search/search.service', () => ({}));
const { addSpanAttributes } = vi.hoisted(() => ({ addSpanAttributes: vi.fn() }));
vi.mock('@/features/telemetry', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/telemetry')>()),
  addSpanAttributes,
}));
const { getDataSourceById } = vi.hoisted(() => ({ getDataSourceById: vi.fn(async () => ({ schema: null }) as unknown) }));
vi.mock('@/features/data-source/data-source.service', () => ({ getDataSourceById }));
const capabilities: { documentIdField?: string } = {};
vi.mock('@/features/data-source/external-search/external-search.service', () => ({ getConnector: () => ({ search, capabilities }) }));
vi.mock('./shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./shared')>()),
  resolveDataSource: vi.fn(async () => ({ kind: 'external', provider: 'sitecore-search', dataSourceId: 'ds' })),
}));

import { executeDataSourceLookup } from './lookup';

describe('external lookup', () => {
  it('falls back to search when the id filter fails', async () => {
    search
      .mockRejectedValueOnce(new Error('Sitecore Search returned HTTP 400: id is not filterable'))
      .mockResolvedValueOnce({ hits: [{ id: 'p1', score: 1, source: { name: 'Scholarships' } }], unappliedFilters: [] });

    const result = await executeDataSourceLookup('ds', { idField: 'id' }, { id: 'Scholarships' });

    expect(result).toEqual({
      success: true,
      data: { id: 'p1', document: { name: 'Scholarships' }, matchedBy: 'search_fallback' },
    });
  });
});

describe('external lookup fallback', () => {
  it('returns not found instead of an unrelated top hit', async () => {
    search
      .mockResolvedValueOnce({ hits: [], unappliedFilters: [] })
      .mockResolvedValueOnce({ hits: [{ id: 'p2', score: 1, source: { name: 'Denim Jacket' } }], unappliedFilters: [] });

    const result = await executeDataSourceLookup('ds', { idField: 'id' }, { id: 'Denim Bomber' });

    expect(result).toEqual({
      success: true,
      data: {
        found: false,
        requested: 'Denim Bomber',
        message: 'No record matches "Denim Bomber". closestMatches lists the nearest items found; none of them is the item asked for.',
        closestMatches: [{ id: 'p2', name: 'Denim Jacket' }],
      },
    });
  });

  it('returns the hit a reworded request names', async () => {
    const sweater = { name: 'Vesper & Co Casual Crew Neck Sweater', brand: 'Vesper & Co' };
    search
      .mockResolvedValueOnce({ hits: [], unappliedFilters: [] })
      .mockResolvedValueOnce({
        hits: [
          { id: 'p1', score: 2, source: { name: 'Atlas Apparel Athleisure Crew Neck Sweater', brand: 'Atlas Apparel' } },
          { id: 'p2', score: 1, source: sweater },
        ],
        unappliedFilters: [],
      });

    const result = await executeDataSourceLookup('ds', { idField: 'id' }, { id: 'Casual Crew Neck Sweater by Vesper & Co' });

    expect(result).toEqual({ success: true, data: { id: 'p2', document: sweater, matchedBy: 'search_fallback' } });
    expect(search).toHaveBeenLastCalledWith(
      expect.anything(),
      { query: 'Casual Crew Neck Sweater by Vesper & Co', offset: 0, limit: 5 },
      [],
    );
  });

  it('lets a failed fallback search throw, like managed indexes (executeTool retries it)', async () => {
    search
      .mockResolvedValueOnce({ hits: [], unappliedFilters: [] })
      .mockRejectedValueOnce(new Error('HTTP 500'));

    await expect(executeDataSourceLookup('ds', { idField: 'id' }, { id: 'Vesper & Co Sweater' })).rejects.toThrow('HTTP 500');
  });
});

describe('external lookup when several records fit', () => {
  it('returns the record whose id was given, even when another record holds the same code', async () => {
    search
      .mockRejectedValueOnce(new Error('Sitecore Search returned HTTP 400: id is not filterable'))
      .mockResolvedValueOnce({
        hits: [
          { id: '88', score: 2, source: { name: 'Tote Bag', partNo: '245' } },
          { id: '245', score: 1, source: { name: 'Wool Scarf' } },
        ],
        unappliedFilters: [],
      });

    const result = await executeDataSourceLookup('ds', { idField: 'id' }, { id: '245' });

    expect(result).toMatchObject({ success: true, data: { id: '245', document: { name: 'Wool Scarf' } } });
  });

  it('says several match instead of returning the first', async () => {
    search
      .mockResolvedValueOnce({ hits: [], unappliedFilters: [] })
      .mockResolvedValueOnce({
        hits: [
          { id: 'p1', score: 2, source: { name: 'Trail Running Shoe' } },
          { id: 'p2', score: 1, source: { name: 'Trail Running Shoe' } },
        ],
        unappliedFilters: [],
      });

    const result = await executeDataSourceLookup('ds', { idField: 'id' }, { id: 'Trail Running Shoe' });

    expect(result.data).toMatchObject({
      found: false,
      matches: [{ id: 'p1', name: 'Trail Running Shoe' }, { id: 'p2', name: 'Trail Running Shoe' }],
    });
  });
});

describe('external lookup and the data source schema', () => {
  const schema = { fields: [{ name: 'productId', type: 'keyword', role: 'id' }, { name: 'headline', type: 'text', role: 'title' }] };

  it("filters on the field the schema calls the id when the tool doesn't set one", async () => {
    getDataSourceById.mockResolvedValueOnce({ schema });
    search.mockResolvedValueOnce({ hits: [{ id: 'p1', score: 1, source: { productId: 'PROD-1' } }], unappliedFilters: [] });

    await executeDataSourceLookup('ds', {}, { id: 'PROD-1' });

    expect(search.mock.lastCall?.[1]).toMatchObject({ filters: [{ field: 'productId', operator: 'eq', value: 'PROD-1' }] });
  });

  it('matches a name on the field the schema calls the title', async () => {
    getDataSourceById.mockResolvedValueOnce({ schema });
    search
      .mockResolvedValueOnce({ hits: [], unappliedFilters: [] })
      .mockResolvedValueOnce({ hits: [{ id: 'p1', score: 1, source: { headline: 'Crew Neck Sweater' } }], unappliedFilters: [] });

    const result = await executeDataSourceLookup('ds', {}, { id: 'Crew Neck Sweater' });

    expect(result).toMatchObject({ success: true, data: { id: 'p1', matchedBy: 'search_fallback' } });
  });

  it("still looks the item up, on field 'id', when the schema can't be read", async () => {
    getDataSourceById.mockRejectedValueOnce(new Error('db down'));
    search.mockResolvedValueOnce({ hits: [{ id: 'p1', score: 1, source: { name: 'Crew Neck Sweater' } }], unappliedFilters: [] });

    const result = await executeDataSourceLookup('ds', {}, { id: 'p1' });

    expect(search.mock.lastCall?.[1]).toMatchObject({ filters: [{ field: 'id', operator: 'eq', value: 'p1' }] });
    expect(result).toMatchObject({ success: true, data: { id: 'p1' } });
  });
});

describe("external lookup by the engine's own id", () => {
  afterEach(() => {
    delete capabilities.documentIdField;
  });

  it('finds an id from a list of matches that is the engine id, not a field (Elasticsearch _id)', async () => {
    capabilities.documentIdField = '_id';
    const sweater = { productId: 'P-200', name: 'Crew Neck Sweater', color: 'Grey' };
    search
      .mockResolvedValueOnce({ hits: [], unappliedFilters: [] })
      .mockResolvedValueOnce({ hits: [{ id: '1UQ9eqEB', score: 1, source: sweater }], unappliedFilters: [] });

    const result = await executeDataSourceLookup('ds', { idField: 'productId' }, { id: '1UQ9eqEB' });

    expect(result).toEqual({ success: true, data: { id: '1UQ9eqEB', document: sweater } });
    expect(search.mock.calls.at(-2)?.[1]).toMatchObject({ filters: [{ field: 'productId', operator: 'eq', value: '1UQ9eqEB' }] });
    expect(search.mock.lastCall?.[1]).toMatchObject({ filters: [{ field: '_id', operator: 'eq', value: '1UQ9eqEB' }] });
  });

  it('goes on to search by name when neither id finds a record', async () => {
    capabilities.documentIdField = '_id';
    search
      .mockResolvedValueOnce({ hits: [], unappliedFilters: [] })
      .mockResolvedValueOnce({ hits: [], unappliedFilters: [] })
      .mockResolvedValueOnce({ hits: [{ id: 'x1', score: 1, source: { name: 'Denim Jacket' } }], unappliedFilters: [] });

    const result = await executeDataSourceLookup('ds', { idField: 'productId' }, { id: 'Denim Jacket' });

    expect(result).toEqual({ success: true, data: { id: 'x1', document: { name: 'Denim Jacket' }, matchedBy: 'search_fallback' } });
    expect(search.mock.lastCall?.[1]).toEqual({ query: 'Denim Jacket', offset: 0, limit: 5 });
  });
});

describe("external lookup with the tool's chosen code fields", () => {
  const schema = {
    fields: [
      { name: 'productId', type: 'keyword', role: 'id' },
      { name: 'sku', type: 'keyword' },
      { name: 'gtin', type: 'keyword' },
      { name: 'name', type: 'text' },
    ],
  };
  beforeEach(() => {
    search.mockClear();
    addSpanAttributes.mockClear();
  });
  const notedMissing = () => addSpanAttributes.mock.calls.map(([attrs]) => attrs['alpha.tool.lookup.missing_fields']).filter(Boolean);
  const filteredOn = () => search.mock.calls.map(([, request]) => request.filters?.[0]?.field).filter(Boolean);

  it('tries each code field in turn, skipping one the index no longer has', async () => {
    getDataSourceById.mockResolvedValueOnce({ schema });
    const shirt = { productId: 'P-7', gtin: '0400000000017', name: 'Linen Shirt' };
    search
      .mockResolvedValueOnce({ hits: [], unappliedFilters: [] })
      .mockResolvedValueOnce({ hits: [{ id: 'P-7', score: 1, source: shirt }], unappliedFilters: [] });

    const result = await executeDataSourceLookup('ds', { codeFields: ['sku', 'retired', 'gtin'] }, { id: '0400000000017' });

    expect(result).toEqual({ success: true, data: { id: 'P-7', document: shirt } });
    expect(filteredOn()).toEqual(['sku', 'gtin']);
  });

  it("then the schema's id field, then a search by name", async () => {
    getDataSourceById.mockResolvedValueOnce({ schema });
    search
      .mockResolvedValueOnce({ hits: [], unappliedFilters: [] })
      .mockResolvedValueOnce({ hits: [], unappliedFilters: [] })
      .mockResolvedValueOnce({ hits: [{ id: 'P-9', score: 1, source: { name: 'Denim Jacket' } }], unappliedFilters: [] });

    const result = await executeDataSourceLookup('ds', { codeFields: ['sku'] }, { id: 'Denim Jacket' });

    expect(filteredOn()).toEqual(['sku', 'productId']);
    expect(search.mock.lastCall?.[1]).toEqual({ query: 'Denim Jacket', offset: 0, limit: 5 });
    expect(result).toMatchObject({ success: true, data: { id: 'P-9', matchedBy: 'search_fallback' } });
  });

  it('tries a hand-set idField after the code fields', async () => {
    getDataSourceById.mockResolvedValueOnce({ schema });
    search
      .mockResolvedValueOnce({ hits: [], unappliedFilters: [] })
      .mockResolvedValueOnce({ hits: [{ id: 'P-3', score: 1, source: { gtin: 'G-3' } }], unappliedFilters: [] });

    await executeDataSourceLookup('ds', { codeFields: ['sku'], idField: 'gtin' }, { id: 'G-3' });

    expect(filteredOn()).toEqual(['sku', 'gtin']);
  });

  it('notes a chosen field the found record has no value in, but not the field it was found by', async () => {
    getDataSourceById.mockResolvedValueOnce({ schema });
    // The engine matched the gtin filter but leaves gtin out of the hit
    search.mockResolvedValueOnce({ hits: [{ id: 'P-7', score: 1, source: { productId: 'P-7' } }], unappliedFilters: [] });

    await executeDataSourceLookup('ds', { nameFields: ['name'], codeFields: ['gtin'] }, { id: '0400000000017' });

    expect(notedMissing()).toEqual(['name']);
  });

  it("goes back to the schema's fields when every chosen one has left the index, and says so in the trace", async () => {
    getDataSourceById.mockResolvedValueOnce({ schema });
    search.mockResolvedValueOnce({ hits: [{ id: 'P-1', score: 1, source: { productId: 'P-1', name: 'Wool Coat' } }], unappliedFilters: [] });

    await executeDataSourceLookup('ds', { codeFields: ['retired'] }, { id: 'P-1' });

    expect(filteredOn()).toEqual(['productId']);
    expect(notedMissing()[0]).toBe('retired');
  });

  it("uses the chosen code fields as they are when the index's fields haven't been read yet", async () => {
    getDataSourceById.mockResolvedValueOnce({ schema: null });
    search.mockResolvedValueOnce({ hits: [{ id: 'P-2', score: 1, source: { sku: 'SKU-2' } }], unappliedFilters: [] });

    const result = await executeDataSourceLookup('ds', { codeFields: ['sku'] }, { id: 'SKU-2' });

    expect(filteredOn()).toEqual(['sku']);
    expect(result).toMatchObject({ success: true, data: { id: 'P-2' } });
  });
});
