// src/features/tools/executors/data-source/analytics-tagging.test.ts

/**
 * Searches run by tools are not visitor searches. Search analytics (popular
 * queries, zero results, user vs AI breakdown) depend on each call being tagged
 * with what started it and which tool ran it: every tool search is 'ai_tool', with the
 * tool's step ('search', 'enumerate' for List Values, 'lookup' for Find Record), so reports
 * count only the Search tool's.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const searchById = vi.fn();
vi.mock('@/features/search/search.service', () => ({
  searchById: (...args: unknown[]) => searchById(...args),
  getDocumentByIdFromIndex: async () => null,
  getExperienceContext: () => undefined,
  getAnalyticsSourceContext: () => undefined,
}));
vi.mock('@/features/analytics', () => ({ trackSearch: vi.fn() }));
vi.mock('@/features/data-source/data-source.service', () => ({ getDataSourceById: vi.fn() }));
vi.mock('@/features/data-source/external-search/external-search.service', () => ({ getConnector: vi.fn() }));
vi.mock('@/features/search-index/search-index.service', () => ({
  getSearchIndexById: vi.fn(async () => ({
    fields: [{ fieldName: 'brand', isFacetable: true, isIndexed: true, filterValueMappings: null }],
  })),
}));
vi.mock('./shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./shared')>()),
  resolveDataSource: vi.fn(async () => ({ kind: 'managed', searchIndexId: 'idx', dataSourceId: 'ds' })),
}));

import { executeDataSourceSearch } from './search';
import { executeDataSourceEnumerate } from './enumerate';
import { executeDataSourceLookup } from './lookup';

beforeEach(() => {
  searchById.mockReset();
  searchById.mockResolvedValue({
    hits: [],
    total: { value: 0, relation: 'eq' },
    took: 1,
    facets: [{ field: 'brand', type: 'terms', buckets: [] }],
  });
});

describe('analytics tagging of tool searches', () => {
  it('records a tool search on a managed index as ai_tool', async () => {
    await executeDataSourceSearch('ds', {}, { query: 'linen shirts' });
    expect(searchById).toHaveBeenCalledWith('idx', expect.objectContaining({ query: 'linen shirts' }), { triggerType: 'ai_tool', triggerStep: 'search' });
  });

  it('records a List Values lookup as the AI tool it is, with its step', async () => {
    await executeDataSourceEnumerate('ds', {}, { field: 'brand' });
    expect(searchById).toHaveBeenCalledWith('idx', expect.objectContaining({ query: '*' }), { triggerType: 'ai_tool', triggerStep: 'enumerate' });
  });

  it("records Find Record's search for the item asked for as the AI tool it is, with its step", async () => {
    await executeDataSourceLookup('ds', {}, { id: 'Linen Shirt' });
    expect(searchById).toHaveBeenCalledWith('idx', expect.objectContaining({ query: 'Linen Shirt' }), { triggerType: 'ai_tool', triggerStep: 'lookup' });
  });
});
