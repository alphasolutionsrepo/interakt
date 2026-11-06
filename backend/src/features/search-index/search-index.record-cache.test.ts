// src/features/search-index/search-index.record-cache.test.ts

/**
 * The cached index lists show each index's status and document count, so a write to
 * either clears them: a reindex as it starts, a stats read that syncs the engine's count,
 * and a recorded job (a reindex or recreate ends with one, after its last status). So do
 * deactivating an index and changing its AI configuration, which clear the index's cache.
 * Through the real service and cache; storage and the search engine are stubbed.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/shared/logger/logger', () => ({
    createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
const stored = vi.hoisted(() => ({
    index: { id: 'i1', name: 'shop', displayName: 'Shop', searchProvider: 'elasticsearch', status: 'active', documentCount: 0, indexSizeBytes: 0, isActive: true },
    engineCount: 0,
    jobRecordFails: false,
    /** What the active list showed while the reindex was running */
    duringRun: undefined as unknown,
    /** Whether the engine has the index; undefined stops a reindex at its first look */
    engineHasIndex: undefined as boolean | undefined,
}));
vi.mock('./search-index.repository', () => ({
    getSearchIndexById: async () => ({ ...stored.index }),
    listSearchIndexes: async () => ({ items: [{ ...stored.index }], total: 1 }),
    getAllActiveSearchIndexes: async () => [{ ...stored.index }],
    updateSearchIndexStatus: async (_id: string, status: string) => { stored.index.status = status; },
    updateSearchIndex: async (_id: string, values: Record<string, unknown>) => { Object.assign(stored.index, values); },
    setLastJob: async () => {
        if (stored.jobRecordFails) throw new Error('connection reset');
        return 'shop';
    },
}));
vi.mock('./search-index-fields.service', () => ({}));
vi.mock('@/features/search-experience', () => ({ invalidateSearchExperienceCacheBySearchIndex: vi.fn() }));
vi.mock('@/features/search-experience/query-interpreter.cache', () => ({ invalidateQueryInterpreterCache: vi.fn() }));
vi.mock('@/features/search/providers', () => ({
    getSearchEngineProvider: () => ({
        getIndexStats: async () => ({ documentCount: stored.engineCount, sizeInBytes: 10 }),
        // The run reads the list while it is going, then stops before changing anything
        indexExists: async () => {
            if (stored.engineHasIndex !== undefined) return stored.engineHasIndex;
            stored.duringRun = (await getAllActiveSearchIndexes()).map(index => index.status);
            throw new Error('stop here');
        },
    }),
}));

import { cache } from './search-index.cache';
import { changeAIConfiguration, getAllActiveSearchIndexes, getIndexStats, listSearchIndexes, recordLastJob, setSearchIndexActive, triggerReindex } from './search-index.service';

beforeEach(async () => {
    await cache.clear();
    stored.index = { ...stored.index, status: 'active', documentCount: 0, indexSizeBytes: 0 };
    stored.engineCount = 0;
    stored.jobRecordFails = false;
    stored.duringRun = undefined;
    stored.engineHasIndex = undefined;
});

const listed = async () => (await listSearchIndexes({ page: 1, pageSize: 25 } as never)).items[0];

describe('cached index lists', () => {
    it('show a reindex as running while it runs', async () => {
        expect(await getAllActiveSearchIndexes()).toEqual([expect.objectContaining({ status: 'active' })]);

        await triggerReindex('i1', 'u1').catch(() => undefined);

        expect(stored.duringRun).toEqual(['indexing']);
    });

    it('show a reindex as running even when its job could not be recorded', async () => {
        expect(await getAllActiveSearchIndexes()).toEqual([expect.objectContaining({ status: 'active' })]);
        stored.jobRecordFails = true;

        await triggerReindex('i1', 'u1').catch(() => undefined);

        expect(stored.duringRun).toEqual(['indexing']);
    });

    it('show the document count a stats read synced from the engine', async () => {
        expect(await listed()).toMatchObject({ documentCount: 0 });
        stored.engineCount = 5;

        await getIndexStats('i1');

        expect(await listed()).toMatchObject({ documentCount: 5 });
    });

    it('leave out an index deactivated since they were cached', async () => {
        expect(await listed()).toMatchObject({ isActive: true });

        await setSearchIndexActive('i1', false, 'u1');

        expect(await listed()).toMatchObject({ isActive: false });
    });

    it('show the AI configuration and status an index was changed to', async () => {
        stored.index = { ...stored.index, searchType: 'semantic', aiModelId: 'old-model' } as typeof stored.index;
        stored.engineHasIndex = false;
        expect(await listed()).toMatchObject({ aiModelId: 'old-model', status: 'active' });

        await changeAIConfiguration('i1', { aiProviderId: 'p2', aiModelId: 'new-model', embeddingDimensions: 768 } as never, 'u1');

        expect(await listed()).toMatchObject({ aiModelId: 'new-model', status: 'ready' });
    });

    it('show the status a job set, once the job is recorded', async () => {
        expect(await listed()).toMatchObject({ status: 'active' });

        // A reindex or recreate sets its last status straight in storage, then records its job
        stored.index.status = 'error';
        await recordLastJob('i1', { kind: 'reindex', status: 'failed', startedAt: '2026-11-06T10:00:00.000Z' });

        expect(await listed()).toMatchObject({ status: 'error' });
    });
});
