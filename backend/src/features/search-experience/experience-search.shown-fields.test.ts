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

describe('an admin search names the fields it wants', () => {
  it('still gets a field kept out of public responses', async () => {
    await searchById('idx', { query: 'shirt', includeFields: ['name', 'costPrice'] });
    expect(engineSearch.mock.lastCall?.[0].request.includeFields).toEqual(['name', 'costPrice']);
  });
});
