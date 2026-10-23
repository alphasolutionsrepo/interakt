// src/features/tools/executors/data-source/analytics-tagging.test.ts

/**
 * Searches run by tools are not visitor searches. Search analytics (popular
 * queries, zero results, user vs AI breakdown) depend on each call being tagged
 * with the right trigger: the model's tool searches as 'ai_tool', internal
 * facet-value lookups as 'system'.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const searchById = vi.fn();
vi.mock('@/features/search/search.service', () => ({
  searchById: (...args: unknown[]) => searchById(...args),
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
    expect(searchById).toHaveBeenCalledWith('idx', expect.objectContaining({ query: 'linen shirts' }), { triggerType: 'ai_tool' });
  });

  it('records a facet-value lookup as system', async () => {
    await executeDataSourceEnumerate('ds', {}, { field: 'brand' });
    expect(searchById).toHaveBeenCalledWith('idx', expect.objectContaining({ query: '*' }), { triggerType: 'system' });
  });
});
