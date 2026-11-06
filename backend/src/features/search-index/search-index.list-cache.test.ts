// src/features/search-index/search-index.list-cache.test.ts

/**
 * The index lists (the experience source pickers read the active one) are cached. A change
 * to an index clears them, so the next list shows it. Through the real service and cache;
 * storage is stubbed.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const stored = vi.hoisted(() => ({ index: { id: 'i1', name: 'shop', displayName: 'Shop', isActive: true, searchProvider: 'elasticsearch' } as Record<string, unknown> }));

vi.mock('server-only', () => ({}));
vi.mock('@/shared/logger/logger', () => ({
    createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock('@/features/search-experience', () => ({ invalidateSearchExperienceCacheBySearchIndex: vi.fn() }));
vi.mock('@/features/search-experience/query-interpreter.cache', () => ({ invalidateQueryInterpreterCache: vi.fn() }));
vi.mock('./search-index.repository', () => ({
    getSearchIndexById: async () => ({ ...stored.index }),
    listSearchIndexes: async () => ({ items: stored.index.isActive ? [{ ...stored.index }] : [], total: stored.index.isActive ? 1 : 0 }),
    updateSearchIndex: async (_id: string, values: Record<string, unknown>) => {
        stored.index = { ...stored.index, ...values };
        return { ...stored.index };
    },
}));

import { cache } from './search-index.cache';
import { listSearchIndexes, setSearchIndexActive, updateSearchIndex } from './search-index.service';

const activeList = { isActive: true, pageSize: 100 };
const names = async () => (await listSearchIndexes(activeList)).items.map((i) => i.displayName);

beforeEach(async () => {
    await cache.clear();
    stored.index = { id: 'i1', name: 'shop', displayName: 'Shop', isActive: true, searchProvider: 'elasticsearch' };
});

describe('cached index lists', () => {
    it('leave out an index deactivated since they were cached', async () => {
        expect(await names()).toEqual(['Shop']);
        await setSearchIndexActive('i1', false, 'u1');
        expect(await names()).toEqual([]);
    });

    it('include an index activated since they were cached', async () => {
        stored.index = { ...stored.index, isActive: false };
        expect(await names()).toEqual([]);
        await setSearchIndexActive('i1', true, 'u1');
        expect(await names()).toEqual(['Shop']);
    });

    it('show the new name of an index renamed since they were cached', async () => {
        expect(await names()).toEqual(['Shop']);
        await updateSearchIndex('i1', { displayName: 'Store' }, 'u1');
        expect(await names()).toEqual(['Store']);
    });
});
