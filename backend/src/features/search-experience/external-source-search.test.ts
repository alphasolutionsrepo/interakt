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
import { ExternalSearchError } from '@/features/data-source/external-search/external-search.types';
import { SearchError } from '@/features/search/search.types';
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

  it('never returns hidden fields, even when the caller asks for them', async () => {
    const fields = [field('id'), field('name'), field('site', false), field('environment', false)];
    const response = await searchExternalSourceForExperience(
      SOURCE, fields, { query: 'x', includeFields: ['name', 'environment'] }, EXPERIENCE,
    );
    // The engine is asked only for the allowed field, and the hidden one is stripped anyway
    expect(vi.mocked(searchExternalSource)).toHaveBeenLastCalledWith('ds', expect.objectContaining({ selectFields: ['name'] }));
    expect(response.hits[0].source).not.toHaveProperty('environment');
    expect(response.hits[0].source).not.toHaveProperty('site');
  });

  it('asks for the default fields when the caller requests only hidden ones', async () => {
    const fields = [field('name'), field('environment', false)];
    await searchExternalSourceForExperience(SOURCE, fields, { query: 'x', includeFields: ['environment'] }, EXPERIENCE);
    expect(vi.mocked(searchExternalSource)).toHaveBeenLastCalledWith('ds', expect.objectContaining({ selectFields: undefined }));
  });

  it('keeps the engine error out of what public callers see', async () => {
    vi.mocked(searchExternalSource).mockRejectedValueOnce(
      new Error('Sitecore Search returned HTTP 500: {"internal":"stack trace"}'),
    );
    await expect(searchExternalSourceForExperience(SOURCE, [], { query: 'x' }, EXPERIENCE)).rejects.toThrow(
      /^An external search source is unavailable$/,
    );
  });

  it('fails with its own code, so admins are told the source is unavailable', async () => {
    vi.mocked(searchExternalSource).mockRejectedValueOnce(new Error('connect ECONNREFUSED 127.0.0.1:9200'));
    await expect(searchExternalSourceForExperience(SOURCE, [], { query: 'x' }, EXPERIENCE)).rejects.toMatchObject({
      code: 'SOURCE_UNAVAILABLE',
      status: 503,
    });
  });

  // What the connectors throw when the engine answers with an error (ExternalSearchError)
  const engineError = (status: number) =>
    new ExternalSearchError('Elasticsearch', `Elasticsearch returned HTTP ${status}: failed to parse`, status);

  it('keeps the engine error as the cause, for the explanation admins see', async () => {
    const cause = engineError(401);
    vi.mocked(searchExternalSource).mockRejectedValueOnce(cause);
    await expect(searchExternalSourceForExperience(SOURCE, [], { query: 'x' }, EXPERIENCE)).rejects.toMatchObject({
      code: 'SOURCE_UNAVAILABLE',
      cause,
    });
  });

  it('answers a filter the engine refused as a bad filter, not an outage', async () => {
    vi.mocked(searchExternalSource).mockRejectedValueOnce(engineError(400));
    const filters = [{ field: 'rating', operator: 'gt' as const, value: 'abc' }];
    await expect(searchExternalSourceForExperience(SOURCE, [], { query: 'x', filters }, EXPERIENCE)).rejects.toMatchObject({
      code: 'INVALID_FILTER',
      status: 400,
      message: "This search source can't filter on rating",
    });
  });

  it('answers a sort the engine refused as a bad sort', async () => {
    vi.mocked(searchExternalSource).mockRejectedValueOnce(engineError(400));
    const sort = [{ field: 'name', direction: 'asc' as const }];
    await expect(searchExternalSourceForExperience(SOURCE, [], { query: 'x', sort }, EXPERIENCE)).rejects.toMatchObject({
      code: 'INVALID_SORT',
      status: 400,
      message: "This search source can't sort on name",
    });
  });

  it('answers a refused request with both as a bad query', async () => {
    vi.mocked(searchExternalSource).mockRejectedValueOnce(engineError(400));
    const filters = [{ field: 'rating', operator: 'gt' as const, value: 'abc' }];
    const sort = [{ field: 'name', direction: 'asc' as const }];
    await expect(searchExternalSourceForExperience(SOURCE, [], { query: 'x', filters, sort }, EXPERIENCE)).rejects.toMatchObject({
      code: 'INVALID_QUERY',
      status: 400,
      message: "This search source can't filter on rating or sort on name",
    });
  });

  it('treats a 400 with no filter or sort as the source failing', async () => {
    vi.mocked(searchExternalSource).mockRejectedValueOnce(engineError(400));
    await expect(searchExternalSourceForExperience(SOURCE, [], { query: 'x' }, EXPERIENCE)).rejects.toMatchObject({
      code: 'SOURCE_UNAVAILABLE',
    });
  });

  it('refuses a filter the engine cannot apply instead of returning the unfiltered set', async () => {
    vi.mocked(searchExternalSource).mockResolvedValueOnce({
      dataSource: { id: 'ds', name: 'Sitecore', fields: [] },
      result: {
        hits: [{ id: 'a', score: 1, source: { id: 'a' } }, { id: 'b', score: 1, source: { id: 'b' } }],
        total: 2,
        took: 3,
        unappliedFilters: [{ field: 'title', reason: 'contains is not supported' }],
        unappliedSort: [],
      },
    } as Awaited<ReturnType<typeof searchExternalSource>>);
    const search = searchExternalSourceForExperience(
      SOURCE, [], { query: 'x', filters: [{ field: 'title', operator: 'contains', value: 'zzz' }] }, EXPERIENCE,
    );
    await expect(search).rejects.toBeInstanceOf(SearchError);
    await expect(search).rejects.toMatchObject({ code: 'INVALID_FILTER', message: "This search source can't filter on title" });
  });

  it('still answers when only the sort could not be applied', async () => {
    vi.mocked(searchExternalSource).mockResolvedValueOnce({
      dataSource: { id: 'ds', name: 'Sitecore', fields: [] },
      result: {
        hits: [{ id: 'a', score: 1, source: { id: 'a' } }],
        total: 1,
        took: 3,
        unappliedFilters: [],
        unappliedSort: [{ field: 'price', reason: 'not sortable' }],
      },
    } as Awaited<ReturnType<typeof searchExternalSource>>);
    const response = await searchExternalSourceForExperience(SOURCE, [], { query: 'x' }, EXPERIENCE);
    expect(response.hits.map((h) => h.id)).toEqual(['a']);
  });
});
