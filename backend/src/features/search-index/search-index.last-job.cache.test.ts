// src/features/search-index/search-index.last-job.cache.test.ts

/**
 * Recording a job puts it on the cached index, looked up by id and by name, without
 * clearing it: the index page sees the job straight away, and searches on the index
 * keep reading the cached index while an upload records a job per batch. Through the
 * real service and cache; storage is stubbed.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const stored = vi.hoisted(() => ({ lastJob: null as Record<string, unknown> | null, reads: 0 }));
vi.mock('./search-index.repository', () => {
    const read = async () => {
        stored.reads++;
        return { id: 'i1', name: 'shop', lastJob: stored.lastJob };
    };
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
    stored.reads = 0;
});

describe('recording the last job on an index', () => {
    it('shows it on the index looked up by id and by name, without reading the index again', async () => {
        await getSearchIndexById('i1');
        await getSearchIndexByName('shop');
        const running = { kind: 'upload' as const, status: 'running' as const, startedAt: '2026-11-05T21:00:00.000Z' };
        const done = { ...running, status: 'succeeded' as const, finishedAt: '2026-11-05T21:00:01.000Z' };

        await recordLastJob('i1', running);
        await recordLastJob('i1', done);

        expect((await getSearchIndexById('i1'))?.lastJob).toEqual(done);
        expect((await getSearchIndexByName('shop'))?.lastJob).toEqual(done);
        expect(stored.reads).toBe(2);
    });
});
