// src/features/tools/executors/data-source/lookup.external.test.ts

/**
 * Lookup on an external source filters by its id field. When that filter fails
 * outright (an engine where the id attribute isn't filterable), the lookup still
 * finds the document through a search instead of returning the engine error.
 */

import { describe, it, expect, vi } from 'vitest';

const search = vi.fn();
vi.mock('@/features/search/search.service', () => ({}));
vi.mock('@/features/data-source/data-source.service', () => ({ getDataSourceById: vi.fn(async () => ({ schema: null })) }));
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

    const result = await executeDataSourceLookup('ds', { idField: 'id' }, { id: 'XYZ-999' });

    expect(result).toEqual({
      success: true,
      data: { found: false, requested: 'XYZ-999', message: 'No record matches "XYZ-999".' },
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

  it('reports a failed fallback search as a failed lookup, like managed indexes', async () => {
    search
      .mockResolvedValueOnce({ hits: [], unappliedFilters: [] })
      .mockRejectedValueOnce(new Error('HTTP 500'));

    const result = await executeDataSourceLookup('ds', { idField: 'id' }, { id: 'Vesper & Co Sweater' });

    expect(result).toEqual({ success: false, error: 'HTTP 500' });
  });
});
