// src/features/search-experience/search-experience.cache.test.ts

/**
 * A cached search experience carries details of the indexes and external data
 * sources it searches (name, on/off). When one of them changes, every cached
 * experience using it is dropped, so the next request reads the new details.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import * as cache from './search-experience.cache';
import type { SearchExperienceWithIndexes } from './search-experience.types';

function experience(id: string, { indexes = [] as string[], sources = [] as string[] } = {}) {
  return {
    id,
    accessToken: `token-${id}`,
    indexes: indexes.map((searchIndexId) => ({
      searchIndexId,
      searchIndex: { id: searchIndexId, name: searchIndexId, isActive: true },
    })),
    externalSources: sources.map((dataSourceId) => ({
      dataSourceId,
      dataSource: { id: dataSourceId, name: dataSourceId, isActive: true, provider: 'elasticsearch' },
    })),
  } as unknown as SearchExperienceWithIndexes;
}

const cached = (id: string) => ({ byId: cache.getById(id) !== null, byToken: cache.getByToken(`token-${id}`) !== null });

beforeEach(async () => { await cache.clearAll(); });

describe('invalidating by external data source', () => {
  it('drops every cached experience that searches the data source', async () => {
    cache.set(experience('mixed', { indexes: ['idx'], sources: ['ds-1'] }));
    cache.set(experience('external', { sources: ['ds-1'] }));
    cache.set(experience('other', { sources: ['ds-2'] }));

    await cache.invalidateByDataSource('ds-1');

    expect(cached('mixed')).toEqual({ byId: false, byToken: false });
    expect(cached('external')).toEqual({ byId: false, byToken: false });
    expect(cached('other')).toEqual({ byId: true, byToken: true });
  });

  it('follows the sources of the latest cached copy', async () => {
    cache.set(experience('exp', { sources: ['ds-1'] }));
    cache.set(experience('exp', { sources: ['ds-2'] })); // re-cached without ds-1

    await cache.invalidateByDataSource('ds-1');

    expect(cached('exp').byId).toBe(true);
  });

  it('does nothing for a data source no cached experience uses', async () => {
    cache.set(experience('exp', { sources: ['ds-1'] }));
    await cache.invalidateByDataSource('ds-9');
    expect(cached('exp').byId).toBe(true);
  });
});

describe('invalidating by search index', () => {
  it('drops every cached experience that searches the index', async () => {
    cache.set(experience('a', { indexes: ['idx-1'], sources: ['ds-1'] }));
    cache.set(experience('b', { indexes: ['idx-2'] }));

    await cache.invalidateBySearchIndex('idx-1');

    expect(cached('a').byId).toBe(false);
    expect(cached('b').byId).toBe(true);
  });

  it('forgets an invalidated experience for its other dependencies too', async () => {
    cache.set(experience('a', { indexes: ['idx-1'], sources: ['ds-1'] }));
    await cache.invalidateBySearchIndex('idx-1');
    cache.set(experience('b', { sources: ['ds-1'] }));

    await cache.invalidateByDataSource('ds-1');

    expect(cached('b').byId).toBe(false);
    expect(cache.getStats().dependencies).toBe(0);
  });
});
