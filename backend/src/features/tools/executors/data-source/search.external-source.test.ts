// src/features/tools/executors/data-source/search.external-source.test.ts

/**
 * A tool search on an external source tracks the search itself, so it has to take
 * the turn's analytics source: an admin test chat must not count as live traffic.
 * A filter the engine couldn't apply is handled the same on every external engine.
 */

import { afterEach, describe, it, expect, vi } from 'vitest';

const { trackSearch, unapplied } = vi.hoisted(() => ({
  trackSearch: vi.fn(),
  unapplied: { value: [] as Array<{ field: string; operator: string; reason: string }> },
}));
vi.mock('@/features/search/search.service', () => ({
  getExperienceContext: () => ({ experienceId: 'exp' }),
}));
vi.mock('@/features/analytics', () => ({ trackSearch }));
vi.mock('@/features/data-source/data-source.service', () => ({ getDataSourceById: vi.fn(async () => ({ schema: null })) }));
vi.mock('@/features/data-source/external-search/external-search.service', () => ({
  getConnector: () => ({
    search: vi.fn(async () => ({ hits: [], total: 0, took: 1, unappliedFilters: unapplied.value, unappliedSort: [] })),
  }),
}));
vi.mock('@/features/search-index/search-index.service', () => ({ getSearchIndexById: vi.fn() }));
vi.mock('./shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./shared')>()),
  resolveDataSource: vi.fn(async () => ({ kind: 'external', provider: 'sitecore-search', dataSourceId: 'ds' })),
}));

import { withAnalyticsSource } from '@/features/analytics/analytics-source-context';
import { executeDataSourceSearch } from './search';

describe('external tool search analytics', () => {
  it('records the turn’s analytics source', async () => {
    // The source the chat pipeline sets for an admin test chat
    await withAnalyticsSource('admin_test', () => executeDataSourceSearch('ds', {}, { query: 'linen shirts' }));

    expect(trackSearch).toHaveBeenCalledWith(
      expect.objectContaining({ triggerType: 'ai_tool', source: 'admin_test', experienceId: 'exp' }),
      'exp',
    );
  });
});

describe('a filter the external engine could not apply', () => {
  afterEach(() => { unapplied.value = []; });

  it('fails the search when it is one of the tool\'s default filters', async () => {
    unapplied.value = [{ field: 'region', operator: 'eq', reason: 'not filterable' }];

    const result = await executeDataSourceSearch(
      'ds', { defaultFilters: [{ field: 'region', operator: 'eq', value: 'west' }] }, { query: 'x' },
    );

    expect(result).toEqual({
      success: false,
      error: "The tool's default filter can't be applied (region: not filterable). Fix it in the tool's settings.",
    });
  });

  it('searches and reports it when the model asked for it', async () => {
    unapplied.value = [{ field: 'title', operator: 'contains', reason: 'not supported' }];

    const result = await executeDataSourceSearch(
      'ds', { defaultFilters: [{ field: 'region', operator: 'eq', value: 'west' }] },
      { query: 'x', filters: [{ field: 'title', operator: 'contains', value: 'linen' }] },
    );

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({ unappliedFilters: unapplied.value });
  });
});
