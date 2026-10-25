// src/features/tools/executors/data-source/lookup.external.test.ts

/**
 * Lookup on an external source filters by its id field. When that filter fails
 * outright (an engine where the id attribute isn't filterable), the lookup still
 * finds the document through a search instead of returning the engine error.
 */

import { describe, it, expect, vi } from 'vitest';

const search = vi.fn();
vi.mock('@/features/search/search.service', () => ({}));
const { getDataSourceById } = vi.hoisted(() => ({ getDataSourceById: vi.fn(async () => ({ schema: null }) as unknown) }));
vi.mock('@/features/data-source/data-source.service', () => ({ getDataSourceById }));
vi.mock('@/features/data-source/external-search/external-search.service', () => ({ getConnector: () => ({ search }) }));
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
