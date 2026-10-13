// src/features/search-experience/external-source-search.test.ts

import { describe, it, expect, vi } from 'vitest';

vi.mock('@/features/analytics', () => ({ trackSearch: vi.fn() }));
vi.mock('@/features/data-source/external-search/external-search.service', () => ({
  searchExternalSource: vi.fn(async () => ({
    dataSource: { id: 'ds', name: 'Sitecore', fields: [] },
    result: {
      hits: [{ id: 'a', score: 1, source: { id: 'a', name: 'Scholarships', site: 'www', environment: 'prod' } }],
      total: 1,
      took: 3,
      unappliedFilters: [],
      unappliedSort: [],
    },
  })),
}));

import type { DataSourceField } from '@/db/schema/data-sources.schema';
import { searchExternalSource } from '@/features/data-source/external-search/external-search.service';
import { searchExternalSourceForExperience } from './external-source-search';
import type { SearchExperienceExternalSourceWithDetails, SearchExperienceWithIndexes } from './search-experience.types';

const SOURCE = { dataSourceId: 'ds', dataSource: { name: 'Sitecore' } } as SearchExperienceExternalSourceWithDetails;
const EXPERIENCE = { id: 'exp', slug: 'exp' } as SearchExperienceWithIndexes;

function field(name: string, isRetrievable?: boolean): DataSourceField {
  return { name, displayName: name, type: 'text', isSearchable: false, isFacetable: false, isFilterable: false, isRetrievable };
}

describe('searchExternalSourceForExperience', () => {
  it('leaves out fields the data source marks not retrievable', async () => {
    const fields = [field('id'), field('name'), field('site', false), field('environment', false)];
    const response = await searchExternalSourceForExperience(SOURCE, fields, { query: 'x' }, EXPERIENCE);
    expect(response.hits[0].source).toEqual({ id: 'a', name: 'Scholarships' });
  });

  it('returns everything when the schema hides nothing', async () => {
    const response = await searchExternalSourceForExperience(SOURCE, [field('name')], { query: 'x' }, EXPERIENCE);
    expect(Object.keys(response.hits[0].source)).toEqual(['id', 'name', 'site', 'environment']);
  });

  it('keeps the engine error out of what public callers see', async () => {
    vi.mocked(searchExternalSource).mockRejectedValueOnce(
      new Error('Sitecore Search returned HTTP 500: {"internal":"stack trace"}'),
    );
    await expect(searchExternalSourceForExperience(SOURCE, [], { query: 'x' }, EXPERIENCE)).rejects.toThrow(
      /^An external search source is unavailable$/,
    );
  });
});
