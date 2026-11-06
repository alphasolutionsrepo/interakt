// src/features/document-indexing/document-indexer.index-stats.cache.test.ts

/**
 * After an upload or a document write updates the index's count and status, the cached
 * index (by id and by name) and the cached index lists are gone, so the next read shows
 * them. Through the real search index cache; storage and the search engine are stubbed.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const stored = vi.hoisted(() => ({
    index: { id: 'i1', name: 'shop', searchProvider: 'elasticsearch', documentCount: 0, indexSizeBytes: 0, status: 'ready' },
    written: [] as Array<Record<string, unknown>>,
}));
vi.mock('@/db/index', () => ({
    db: {
        select: () => ({ from: () => ({ where: () => ({ limit: async () => [stored.index] }) }) }),
        update: () => ({ set: (values: Record<string, unknown>) => ({ where: async () => { stored.written.push(values); } }) }),
    },
}));
vi.mock('@/features/search/providers', () => ({
    getSearchEngineProvider: () => ({ getIndexStats: async () => ({ documentCount: 3, sizeInBytes: 10 }) }),
}));
vi.mock('@/features/search-index/search-index-fields.service', () => ({}));
vi.mock('@/features/search-index/search-index-fields.repository', () => ({}));
vi.mock('@/features/ai-service', () => ({ generateEmbeddings: vi.fn() }));
vi.mock('@/features/search-experience/query-interpreter.cache', () => ({ invalidateQueryInterpreterCache: vi.fn() }));

import { updateIndexStats } from './document-indexer.service';

import { cache } from '@/features/search-index/search-index.cache';

beforeEach(async () => {
    await cache.clear();
    stored.written = [];
});

describe('updating an index after documents are written', () => {
    it('drops the cached index and the cached lists that show its count and status', async () => {
        cache.set('index:i1', { ...stored.index });
        cache.set('index:name:shop', { ...stored.index });
        cache.set('list:{"page":1}', { items: [{ ...stored.index }] });
        cache.set('list:active', [{ ...stored.index }]);

        await updateIndexStats('i1', 3);

        expect(stored.written).toEqual([expect.objectContaining({ documentCount: 3, status: 'ready' })]);
        expect(cache.get('index:i1')).toBeNull();
        expect(cache.get('index:name:shop')).toBeNull();
        expect(cache.get('list:{"page":1}')).toBeNull();
        expect(cache.get('list:active')).toBeNull();
    });
});
