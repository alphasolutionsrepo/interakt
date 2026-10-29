// src/features/search-experience/external-source-search.trace.test.ts

/**
 * The external search's trace step ends the way the search did: a refused filter
 * fails the step with the reason, instead of closing it as a normal answer, and
 * the step carries no result counts (those hits are the unfiltered set).
 * withSpan fails a step when its callback throws, so the fake records just that.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

type Step = { name: string; failed?: string; attributes: Record<string, unknown> };
const steps = vi.hoisted(() => [] as Step[]);
vi.mock('@/features/telemetry', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/telemetry')>()),
  shouldLogContent: () => false,
  withSpan: async (opts: { name: string }, fn: (span: unknown) => Promise<unknown>) => {
    const step: Step = { name: opts.name, attributes: {} };
    steps.push(step);
    try {
      return await fn({ setAttribute: (key: string, value: unknown) => { step.attributes[key] = value; } });
    } catch (error) {
      step.failed = (error as Error).message;
      throw error;
    }
  },
}));
vi.mock('@/features/analytics', () => ({ trackSearch: vi.fn() }));
const result = vi.hoisted(() => ({
  hits: [{ id: 'a', score: 1, source: { id: 'a', name: 'Jeans' } }],
  total: 1,
  took: 3,
  unappliedFilters: [] as Array<{ field: string; reason: string }>,
  unappliedSort: [] as Array<{ field: string; reason: string }>,
}));
vi.mock('@/features/data-source/external-search/external-search.service', () => ({
  searchExternalSource: vi.fn(async () => ({ dataSource: { id: 'ds', name: 'External catalog', fields: [] }, result })),
}));

import { searchExternalSourceForExperience } from './external-source-search';
import type { SearchExperienceExternalSourceWithDetails, SearchExperienceWithIndexes } from './search-experience.types';

import { trackSearch } from '@/features/analytics';
import { ATTR } from '@/features/telemetry';

const SOURCE = { dataSourceId: 'ds', dataSource: { name: 'External catalog' } } as SearchExperienceExternalSourceWithDetails;
const EXPERIENCE = { id: 'exp', slug: 'pr56-external' } as SearchExperienceWithIndexes;
const search = () => searchExternalSourceForExperience(SOURCE, [], { query: 'jeans' }, EXPERIENCE);

beforeEach(() => {
  vi.clearAllMocks();
  steps.length = 0;
  result.unappliedFilters = [];
  result.unappliedSort = [];
});

describe('the external search trace step', () => {
  it('fails with the reason when the source refuses a filter', async () => {
    result.unappliedFilters = [{ field: 'longDescription', reason: 'not filterable' }];

    await expect(search()).rejects.toMatchObject({ code: 'INVALID_FILTER' });
    expect(steps).toEqual([{ name: 'search.external', failed: "This search source can't apply the filter (longDescription: not filterable)", attributes: {} }]);
    // Analytics records the refused search once, with no results
    expect(vi.mocked(trackSearch)).toHaveBeenCalledOnce();
    expect(vi.mocked(trackSearch).mock.calls[0][0]).toMatchObject({
      success: false, totalResults: 0, resultsReturned: 0, errorMessage: 'filter not applied: longDescription: not filterable',
    });
  });

  it('ends normally when only the sort could not be applied', async () => {
    result.unappliedSort = [{ field: 'price', reason: 'not sortable' }];

    await expect(search()).resolves.toBeDefined();
    expect(steps).toEqual([{
      name: 'search.external',
      attributes: { [ATTR.SEARCH_TOTAL_RESULTS]: 1, [ATTR.SEARCH_RETURNED]: 1, [ATTR.SEARCH_ES_TOOK_MS]: 3 },
    }]);
    expect(vi.mocked(trackSearch).mock.calls[0][0]).toMatchObject({ success: true, totalResults: 1 });
  });
});
