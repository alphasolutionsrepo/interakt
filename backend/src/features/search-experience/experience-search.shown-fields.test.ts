// src/features/search-experience/experience-search.shown-fields.test.ts

/**
 * A public search's field list can narrow what an index shows in responses, never add to it.
 * The real experience search, search service and context builder run; only the engine and the
 * database are faked, so this checks the field list the engine is asked for.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { executeExperienceSearch } from './experience-search';
import type { SearchExperienceWithIndexes } from './search-experience.types';

import { searchById } from '@/features/search/search.service';
import type { SearchRequest } from '@/features/search/search.types';

vi.mock('server-only', () => ({}));
vi.mock('@/shared/logger/logger', async () => (await import('@/shared/test/log-recorder')).recordingLogger([]));
vi.mock('@/features/feature-switches/feature-switches.service', async () => (await import('@/shared/test/feature-switches-stub')).featureSwitchesService);
vi.mock('@/features/analytics', () => ({ trackSearch: vi.fn() }));
vi.mock('@/features/ai-service', () => ({ chat: vi.fn(), generateEmbedding: vi.fn() }));
vi.mock('@/features/data-source/data-source.service', () => ({ getDataSourceById: vi.fn() }));
vi.mock('./external-source-search', () => ({ externalFacetableFields: () => [], searchExternalSourceForExperience: vi.fn() }));

const field = (fieldName: string, includeInResponse: boolean) => ({
  fieldName, fieldType: 'keyword', isIndexed: true, isMapped: true, isFacetable: false, isSearchable: false,
  includeInResponse, isSystemField: false, transformConfig: null,
});
vi.mock('@/features/search-index/search-index.service', () => ({
  getSearchIndexById: vi.fn(async (id: string) => (id === 'idx'
    ? {
      id: 'idx', name: 'products', isActive: true, status: 'active', searchType: 'lexical', searchProvider: 'elasticsearch',
      fields: [field('name', true), field('specs', true), field('price', true), field('costPrice', false)],
    }
    : id === 'idx-open'
    ? {
      // An index with no fields set up: responses carry whole documents
      id: 'idx-open', name: 'open', isActive: true, status: 'active', searchType: 'lexical', searchProvider: 'elasticsearch',
      fields: [],
    }
    : id.startsWith('idx-hidden')
    ? {
      // Every field turned off for responses, on either engine
      id, name: 'hidden', isActive: true, status: 'active', searchType: 'lexical',
      searchProvider: id === 'idx-hidden-azure' ? 'azure-ai-search' : 'elasticsearch',
      fields: [field('name', false), field('costPrice', false)],
    }
    : {
      // A second index that shows costPrice
      id: 'idx-trade', name: 'trade', isActive: true, status: 'active', searchType: 'lexical', searchProvider: 'elasticsearch',
      fields: [field('name', true), field('costPrice', true)],
    })),
}));

const { engineSearch } = vi.hoisted(() => ({
  engineSearch: vi.fn(async (_args: { request: SearchRequest; context: { indexName: string } }) => ({ hits: [], total: { value: 0, relation: 'eq' }, took: 1 })),
}));
vi.mock('@/features/search/providers', () => {
  const engine = { name: 'elasticsearch', search: engineSearch, getDocument: vi.fn(), autocomplete: vi.fn() };
  return { providerRegistry: { list: () => [engine], get: () => engine }, initializeSearchProviders: vi.fn() };
});

const experience = {
  id: 'exp-fields', slug: 'shop',
  searchConfig: { enableFacets: false, defaultPageSize: 10, maxPageSize: 50 },
  aiConfig: null,
  indexes: [{ searchIndexId: 'idx', weight: 1, searchIndex: { id: 'idx', name: 'products', displayName: 'Products', isActive: true } }],
  externalSources: [],
} as unknown as SearchExperienceWithIndexes;

/** The field list the engine was asked for after a public search with this list. */
async function engineFields(includeFields?: string[]): Promise<string[] | undefined> {
  await executeExperienceSearch(experience, { query: 'shirt', includeFields }, { source: 'api' });
  return engineSearch.mock.lastCall?.[0].request.includeFields;
}

beforeEach(() => engineSearch.mockClear());

describe('a public search names the fields it wants', () => {
  it('drops a field the index keeps out of responses', async () => {
    expect(await engineFields(['name', 'costPrice'])).toEqual(['name']);
  });

  it('gets the shown fields when it asks only for hidden ones', async () => {
    expect(await engineFields(['costPrice'])).toBeUndefined();
  });

  it('keeps a field under a shown one', async () => {
    expect(await engineFields(['specs.sku', 'price'])).toEqual(['specs.sku', 'price']);
  });

  it('gets the shown fields when it names none', async () => {
    expect(await engineFields()).toBeUndefined();
  });

  it('gets the shown fields when its list is empty', async () => {
    expect(await engineFields([])).toBeUndefined();
  });

  it('narrows an index that shows whole documents to the fields it names', async () => {
    const open = {
      ...experience,
      indexes: [{ searchIndexId: 'idx-open', weight: 1, searchIndex: { id: 'idx-open', name: 'open', displayName: 'Open', isActive: true } }],
    } as SearchExperienceWithIndexes;
    await executeExperienceSearch(open, { query: 'shirt', includeFields: ['name'] }, { source: 'api' });
    expect(engineSearch.mock.lastCall?.[0].request.includeFields).toEqual(['name']);
  });

  it('gets from each index the fields that index shows', async () => {
    const twoIndexes = {
      ...experience,
      indexes: [
        ...experience.indexes,
        { searchIndexId: 'idx-trade', weight: 1, searchIndex: { id: 'idx-trade', name: 'trade', displayName: 'Trade', isActive: true } },
      ],
    } as SearchExperienceWithIndexes;
    await executeExperienceSearch(twoIndexes, { query: 'shirt', includeFields: ['name', 'costPrice'] }, { source: 'api' });
    const byIndex = Object.fromEntries(engineSearch.mock.calls.map(([args]) => [args.context.indexName, args.request.includeFields]));
    expect(byIndex).toEqual({ products: ['name'], trade: ['name', 'costPrice'] });
  });
});

describe('highlights in a public search', () => {
  const highlighted = {
    hits: [{
      id: 'p1', score: 1, source: { name: 'Linen shirt' },
      highlight: { name: ['<em>shirt</em>'], 'specs.sku': ['<em>SH</em>-1'], costPrice: ['<em>12</em>'] },
    }],
    total: { value: 1, relation: 'eq' }, took: 1,
  };

  it('come only from fields the index shows', async () => {
    engineSearch.mockResolvedValueOnce(highlighted as never);
    const { results } = await executeExperienceSearch(experience, { query: 'shirt' }, { source: 'api' });
    expect(results.hits[0].highlights).toEqual({ name: ['<em>shirt</em>'], 'specs.sku': ['<em>SH</em>-1'] });
  });

  it('are all kept for an admin search', async () => {
    engineSearch.mockResolvedValueOnce(highlighted as never);
    const { hits } = await searchById('idx', { query: 'shirt' });
    expect(Object.keys(hits[0].highlights ?? {})).toEqual(['name', 'specs.sku', 'costPrice']);
  });
});

describe('an admin search names the fields it wants', () => {
  it('still gets a field kept out of public responses', async () => {
    await searchById('idx', { query: 'shirt', includeFields: ['name', 'costPrice'] });
    expect(engineSearch.mock.lastCall?.[0].request.includeFields).toEqual(['name', 'costPrice']);
  });
});

describe('an index with every field turned off for responses', () => {
  const hiddenHit = {
    hits: [{ id: 'p1', score: 1, source: { name: 'Linen shirt', costPrice: 12 }, highlight: { name: ['<em>shirt</em>'], costPrice: ['<em>12</em>'] } }],
    total: { value: 1, relation: 'eq' }, took: 1,
  };
  const on = (searchIndexId: string) => ({
    ...experience,
    indexes: [{ searchIndexId, weight: 1, searchIndex: { id: searchIndexId, name: 'hidden', displayName: 'Hidden', isActive: true } }],
  }) as SearchExperienceWithIndexes;

  it.each(['idx-hidden', 'idx-hidden-azure'])('gives a public search each result\'s id and no fields, even ones it names (%s)', async (indexId) => {
    for (const includeFields of [undefined, ['costPrice'], ['name', 'costPrice']]) {
      engineSearch.mockResolvedValueOnce(hiddenHit as never);
      const { results } = await executeExperienceSearch(on(indexId), { query: 'shirt', includeFields }, { source: 'api' });
      expect(results.hits[0]).toMatchObject({ id: 'p1', source: {} });
      expect(results.hits[0].highlights).toBeUndefined();
    }
  });

  it('still gives an admin signed in to the playground the fields and highlights they ask for', async () => {
    engineSearch.mockResolvedValueOnce(hiddenHit as never);
    const { results } = await executeExperienceSearch(on('idx-hidden'), { query: 'shirt', includeFields: ['costPrice'] }, { source: 'admin_test', signedInAdmin: true });
    expect(engineSearch.mock.lastCall?.[0].request.includeFields).toEqual(['costPrice']);
    expect(results.hits[0].source).toEqual({ name: 'Linen shirt', costPrice: 12 });
    expect(Object.keys(results.hits[0].highlights ?? {})).toEqual(['name', 'costPrice']);
  });
});

describe('an admin signed in to the search playground', () => {
  it('gets the hidden fields they name and every highlight', async () => {
    engineSearch.mockResolvedValueOnce({
      hits: [{ id: 'p1', score: 1, source: { name: 'Linen shirt' }, highlight: { name: ['<em>shirt</em>'], costPrice: ['<em>12</em>'] } }],
      total: { value: 1, relation: 'eq' }, took: 1,
    } as never);
    const { results } = await executeExperienceSearch(experience, { query: 'shirt', includeFields: ['name', 'costPrice'] }, { source: 'admin_test', signedInAdmin: true });
    expect(engineSearch.mock.lastCall?.[0].request.includeFields).toEqual(['name', 'costPrice']);
    expect(Object.keys(results.hits[0].highlights ?? {})).toEqual(['name', 'costPrice']);
  });

  it('is told apart by being signed in, not by where the search is recorded: admin_test traffic alone is kept to the shown fields', async () => {
    await executeExperienceSearch(experience, { query: 'shirt', includeFields: ['name', 'costPrice'] }, { source: 'admin_test' });
    expect(engineSearch.mock.lastCall?.[0].request.includeFields).toEqual(['name']);
  });
});
