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
