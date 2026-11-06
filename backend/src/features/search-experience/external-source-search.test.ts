// src/features/search-experience/external-source-search.test.ts

import { describe, it, expect, vi } from 'vitest';

import { reported, type LogLine } from '@/shared/test/log-recorder';

const logs = vi.hoisted(() => [] as LogLine[]);
vi.mock('@/shared/logger/logger', async () => (await import('@/shared/test/log-recorder')).recordingLogger(logs));

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
import { trackSearch } from '@/features/analytics';
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
  const engineError = (status: number, reason = 'failed to parse') =>
    new ExternalSearchError('Elasticsearch', `Elasticsearch returned HTTP ${status}: ${reason}`, status);
  const ratingAbove = [{ field: 'rating', operator: 'gt' as const, value: 'abc' }];

  it('keeps the engine error as the cause, for the explanation admins see', async () => {
    const cause = engineError(401);
    vi.mocked(searchExternalSource).mockRejectedValueOnce(cause);
    await expect(searchExternalSourceForExperience(SOURCE, [], { query: 'x' }, EXPERIENCE)).rejects.toMatchObject({
      code: 'SOURCE_UNAVAILABLE',
      cause,
    });
  });

  // Which fields a 400 blames is in external-refusal.test.ts
  it('answers a filter the engine refused as a bad filter, not an outage', async () => {
    vi.mocked(searchExternalSource).mockRejectedValueOnce(engineError(400, 'failed to create query: For input string: "abc"'));
    await expect(searchExternalSourceForExperience(SOURCE, [], { query: 'x', filters: ratingAbove }, EXPERIENCE)).rejects.toMatchObject({
      code: 'INVALID_FILTER',
      status: 400,
      message: '"abc" isn\'t a valid value for rating',
    });
  });

  it('blames only the sort the engine names, by the field it was sent as', async () => {
    vi.mocked(searchExternalSource).mockRejectedValueOnce(engineError(400, 'No mapping found for [name.keyword] in order to sort on'));
    const fields = [{ ...field('name'), filterField: 'name.keyword' }];
    const sort = [{ field: 'name', direction: 'asc' as const }];
    await expect(searchExternalSourceForExperience(SOURCE, fields, { query: 'x', filters: ratingAbove, sort }, EXPERIENCE)).rejects.toMatchObject({
      code: 'INVALID_SORT',
      details: { fields: ['name'] },
    });
  });

  it('answers paging past the result window as the page to change', async () => {
    vi.mocked(searchExternalSource).mockRejectedValueOnce(engineError(400, 'Result window is too large, from + size must be less than or equal to: [10000] but was [10020].'));
    await expect(searchExternalSourceForExperience(SOURCE, [], { query: 'x', page: 501 }, EXPERIENCE)).rejects.toMatchObject({
      code: 'INVALID_QUERY',
      status: 400,
    });
  });

  it.each([
    ['refused', engineError(400, 'failed to create query: For input string: "abc"')],
    ['failed', engineError(503, 'unavailable')],
  ])('passes a %s search on without a warning or error of its own: whoever answers the caller logs it', async (_, error) => {
    logs.length = 0;
    vi.mocked(searchExternalSource).mockRejectedValueOnce(error);
    await searchExternalSourceForExperience(SOURCE, [], { query: 'x', filters: ratingAbove }, EXPERIENCE).catch(() => undefined);
    expect(reported(logs)).toEqual([]);
  });

  it('refuses a filter the engine cannot apply without a warning of its own', async () => {
    logs.length = 0;
    vi.mocked(searchExternalSource).mockResolvedValueOnce({
      dataSource: { id: 'ds', name: 'Sitecore', fields: [] },
      result: { hits: [], total: 0, took: 1, unappliedFilters: [{ field: 'rating', reason: 'not filterable' }], unappliedSort: [] },
    } as never);
    await searchExternalSourceForExperience(SOURCE, [], { query: 'x', filters: ratingAbove }, EXPERIENCE).catch(() => undefined);
    expect(reported(logs)).toEqual([]);
  });

  it('names the source that failed, for the log line of whoever answers the caller', async () => {
    vi.mocked(searchExternalSource).mockRejectedValueOnce(engineError(503, 'unavailable'));
    await expect(searchExternalSourceForExperience(SOURCE, [], { query: 'x' }, EXPERIENCE)).rejects.toMatchObject({
      code: 'SOURCE_UNAVAILABLE',
      details: { dataSourceId: 'ds' },
    });
  });

  it('treats a 400 that names no filter or sort as the source failing', async () => {
    vi.mocked(searchExternalSource).mockRejectedValueOnce(engineError(400, 'the query vector has a different number of dimensions [768] than the document vectors [1536]'));
    await expect(searchExternalSourceForExperience(SOURCE, [], { query: 'x', filters: ratingAbove }, EXPERIENCE)).rejects.toMatchObject({
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
    await expect(search).rejects.toMatchObject({ code: 'INVALID_FILTER', message: "This search source can't apply the filter (title: contains is not supported)" });
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

  it('records each filtered field once and counts every filter', async () => {
    const filters = [
      { field: 'site', operator: 'eq' as const, value: 'www' },
      { field: 'site', operator: 'eq' as const, value: 'news' },
    ];
    await searchExternalSourceForExperience(SOURCE, [], { query: 'x', filters }, EXPERIENCE);
    expect(vi.mocked(trackSearch).mock.lastCall?.[0]).toMatchObject({ filterFields: ['site'], filterCount: 2 });
  });
});
