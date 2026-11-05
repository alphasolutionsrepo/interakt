// src/features/search-index/search-index.last-job.cache.test.ts

/**
 * Recording a job refreshes the cached index, looked up by id and by name: both show the
 * job straight away, and what the job wrote to the index with it (a reindex's status, an
 * upload's stats). Through the real service and cache; storage is stubbed.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const stored = vi.hoisted(() => ({ lastJob: null as Record<string, unknown> | null, status: 'ready' }));
vi.mock('./search-index.repository', () => {
    const read = async () => ({ id: 'i1', name: 'shop', status: stored.status, lastJob: stored.lastJob });
    return {
        getSearchIndexById: read,
        getSearchIndexByName: read,
        setLastJob: async (_id: string, job: Record<string, unknown>) => {
            stored.lastJob = job;
            return 'shop';
        },
    };
});
vi.mock('@/features/search-experience', () => ({ invalidateSearchExperienceCacheBySearchIndex: vi.fn() }));
vi.mock('@/features/search-experience/query-interpreter.cache', () => ({ invalidateQueryInterpreterCache: vi.fn() }));

import { cache } from './search-index.cache';
import { getSearchIndexById, getSearchIndexByName, recordLastJob } from './search-index.service';

beforeEach(async () => {
    await cache.clear();
    stored.lastJob = null;
    stored.status = 'ready';
});

describe('recording the last job on an index', () => {
    it('shows it on the index looked up by id and by name, with the status the job set', async () => {
        await getSearchIndexById('i1');
        await getSearchIndexByName('shop');
        const running = { kind: 'reindex' as const, status: 'running' as const, startedAt: '2026-11-05T21:00:00.000Z' };

        // A reindex sets the status straight in storage, then records its job
        stored.status = 'indexing';
        await recordLastJob('i1', running);

        expect(await getSearchIndexById('i1')).toMatchObject({ status: 'indexing', lastJob: running });
        expect(await getSearchIndexByName('shop')).toMatchObject({ status: 'indexing', lastJob: running });
    });
});
