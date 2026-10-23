// src/features/tools/executors/data-source/search.external-source.test.ts

/**
 * A tool search on an external source tracks the search itself, so it has to take
 * the turn's analytics source: an admin test chat must not count as live traffic.
 */

import { describe, it, expect, vi } from 'vitest';

const { trackSearch } = vi.hoisted(() => ({ trackSearch: vi.fn() }));
vi.mock('@/features/search/search.service', () => ({
  getExperienceContext: () => ({ experienceId: 'exp' }),
  getAnalyticsSourceContext: () => 'admin_test',
}));
vi.mock('@/features/analytics', () => ({ trackSearch }));
vi.mock('@/features/data-source/data-source.service', () => ({ getDataSourceById: vi.fn(async () => ({ schema: null })) }));
vi.mock('@/features/data-source/external-search/external-search.service', () => ({
  getConnector: () => ({
    search: vi.fn(async () => ({ hits: [], total: 0, took: 1, unappliedFilters: [], unappliedSort: [] })),
  }),
}));
vi.mock('@/features/search-index/search-index.service', () => ({ getSearchIndexById: vi.fn() }));
vi.mock('./shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./shared')>()),
  resolveDataSource: vi.fn(async () => ({ kind: 'external', provider: 'sitecore-search', dataSourceId: 'ds' })),
}));

import { executeDataSourceSearch } from './search';

describe('external tool search analytics', () => {
  it('records the turn’s analytics source', async () => {
    await executeDataSourceSearch('ds', {}, { query: 'linen shirts' });

    expect(trackSearch).toHaveBeenCalledWith(
      expect.objectContaining({ triggerType: 'ai_tool', source: 'admin_test', experienceId: 'exp' }),
      'exp',
    );
  });
});
