// src/features/search-index/search-index.reindex.logging.test.ts

/**
 * A reindex that fails is logged once, by the error response, through the real handler
 * and service: with the operation, the index, the error and the request id the index
 * page shows. A reindex that partly worked answers success and is logged once, as a
 * warning. Storage and the search engine are stubbed, as in trigger-reindex.test.ts.
 */

import { errors as esErrors } from '@elastic/elasticsearch';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { reported, type LogLine } from '@/shared/test/log-recorder';

const state = vi.hoisted(() => ({
    bulk: { success: true, indexed: 2, failed: 0, errors: [] as Array<{ index: number; error: string }>, took: 1 } as Record<string, unknown>,
    lastJobs: [] as Array<Record<string, unknown>>,
    updates: [] as Array<Record<string, unknown>>,
    createFails: false,
}));

vi.mock('server-only', () => ({}));
const logs = vi.hoisted(() => [] as LogLine[]);
vi.mock('@/shared/logger/logger', async () => (await import('@/shared/test/log-recorder')).recordingLogger(logs));
vi.mock('@/shared/utils/auth-utils', () => ({ getCurrentUserId: async () => 'admin' }));
vi.mock('@/features/data-source/data-source.service', () => ({ refreshSchemaForSearchIndex: vi.fn() }));
vi.mock('./search-index.repository', () => ({
    getSearchIndexById: async () => ({ id: 'i1', name: 'shop', searchProvider: 'elasticsearch' }),
    updateSearchIndexStatus: vi.fn(),
    setLastJob: async (_id: string, job: Record<string, unknown>) => { state.lastJobs.push(job); },
    updateSearchIndex: async (_id: string, values: Record<string, unknown>) => { state.updates.push(values); },
    markMappingSynced: vi.fn(),
}));
vi.mock('./search-index.cache', () => ({ cache: { delete: vi.fn(), get: vi.fn(), set: vi.fn(), update: vi.fn() }, clearIndexCache: vi.fn(), SEARCH_INDEX_CACHE_TTL: 1 }));
vi.mock('./search-index-fields.service', () => ({ getFieldsBySearchIndexId: async () => [{ fieldName: 'title' }] }));
vi.mock('./provider-settings.utils', () => ({ buildIndexSettingsContext: () => ({}) }));
vi.mock('@/features/search-experience', () => ({ invalidateSearchExperienceCacheBySearchIndex: vi.fn() }));
vi.mock('@/features/document-indexing/document-indexer.service', () => ({
    EMBEDDING_FIELD_NAME: 'content_embedding',
    getEmbeddingConfig: () => ({ enabled: false }),
    generateDocumentEmbeddings: vi.fn(),
}));
vi.mock('@/features/search/providers', () => ({
    getSearchEngineProvider: () => ({
        indexExists: async () => true,
        fetchAllDocuments: async () => ({ success: true, documents: [{ _id: 'a', _source: { title: 'A' } }, { _id: 'b', _source: { title: 'B' } }] }),
        buildIndexSettings: () => ({}),
        deleteIndex: async () => ({ success: true }),
        createIndex: async () => (state.createFails ? { success: false, error: 'resource_already_exists_exception' } : { success: true }),
        bulkIndex: async () => state.bulk,
        refreshIndex: vi.fn(),
    }),
}));

import { handleRecreateEmptyIndex, handleTriggerReindex } from './search-index.api.handlers';
import { handleApiResponse } from '@/shared/api/api-error';

const ID = '7f1c0c56-3a9e-4a51-9b3f-2f7b8c1d2e3f';
const reindex = () => handleTriggerReindex(new NextRequest(`http://localhost/api/search-indexes/${ID}/reindex`, { method: 'POST' }), { params: Promise.resolve({ id: ID }) });

beforeEach(() => {
    logs.length = 0;
    state.lastJobs = [];
    state.createFails = false;
});

describe('a reindex', () => {
    it('that wrote nothing back is logged once, with the operation, the index and the id the index page shows', async () => {
        state.bulk = { success: false, indexed: 0, failed: 2, errors: [{ index: 0, error: 'mapper_parsing_exception' }], took: 1 };
        const res = await reindex();
        const { requestId } = await res.json();

        expect(res.ok).toBe(false);
        expect(state.lastJobs.at(-1)).toMatchObject({ status: 'failed', error: { requestId } });
        expect(reported(logs)).toEqual([
            expect.objectContaining({ level: 'error', context: expect.objectContaining({ requestId, operation: 'triggerReindex', indexId: ID }) }),
        ]);
    });

    it("that wrote nothing back because the search service failed logs that service's error as the cause", async () => {
        const timedOut = new Error('Request timed out');
        state.bulk = { success: false, indexed: 0, failed: 2, errors: [{ index: 0, error: timedOut.message }], took: 1, writeError: timedOut };
        await reindex();

        const [line] = reported(logs);
        expect(line).toMatchObject({ level: 'error' });
        expect((line.context.err as Error).cause).toBe(timedOut);
    });

    it('that a write block stopped is explained by the block, whichever document failed first', async () => {
        state.bulk = {
            success: false, indexed: 0, failed: 2, took: 1,
            errors: [
                { index: 0, error: 'mapper_parsing_exception: failed to parse field [price]' },
                { index: 1, error: 'index [shop] blocked by: [FORBIDDEN/8/index write (api)];' },
            ],
        };
        const res = await reindex();
        const body = await res.json();

        expect(body.message).toContain('blocked by');
        expect(body.hint).toContain('read-only');
    });

    it('that partly worked before the search service blocked writes is logged once, as an error', async () => {
        state.bulk = { success: false, indexed: 1, failed: 1, took: 1, errors: [{ index: 1, error: 'index [shop] blocked by: [FORBIDDEN/8/index write (api)];' }] };
        const res = await reindex();

        expect(res.ok).toBe(true);
        expect(reported(logs)).toEqual([expect.objectContaining({ level: 'error', message: 'Some documents failed to reindex' })]);
    });

    it('that partly worked answers success and is logged once, as a warning', async () => {
        state.bulk = { success: true, indexed: 1, failed: 1, errors: [{ index: 1, error: 'mapper_parsing_exception' }], took: 1 };
        const res = await reindex();

        expect(res.ok).toBe(true);
        expect(reported(logs)).toEqual([expect.objectContaining({ level: 'warn' })]);
        // As the admin client reads it: the Activity panel takes a job's outcome at its word
        const answer = await handleApiResponse<{ outcome?: { status: string; summary?: string } }>(res);
        expect(answer.outcome).toMatchObject({ status: 'partial', summary: expect.stringContaining('mapper_parsing_exception') });
        expect(state.lastJobs.at(-1)).toEqual(answer.outcome);
    });

    it('where one batch failed because the search service did logs it once, as an error, with that error', async () => {
        const down = new esErrors.ConnectionError('connect ECONNREFUSED 127.0.0.1:9200', { meta: {} } as never);
        state.bulk = { success: false, indexed: 1, failed: 1, errors: [{ index: 1, error: down.message }], took: 1, writeError: down };
        await reindex();

        expect(reported(logs)).toEqual([expect.objectContaining({ level: 'error', context: expect.objectContaining({ err: down }) })]);
    });
});

describe('recreating an empty index', () => {
    it('that fails is logged once, with the operation, the index and the id the index page shows', async () => {
        state.createFails = true;
        const res = await handleRecreateEmptyIndex(new NextRequest(`http://localhost/api/search-indexes/${ID}/recreate-index`, { method: 'POST' }), { params: Promise.resolve({ id: ID }) });
        const { requestId } = await res.json();

        expect(res.ok).toBe(false);
        expect(state.lastJobs.at(-1)).toMatchObject({ kind: 'recreate', status: 'failed', error: { requestId } });
        expect(reported(logs)).toEqual([
            expect.objectContaining({ level: 'error', context: expect.objectContaining({ requestId, operation: 'recreateEmptyIndex', indexId: ID }) }),
        ]);
    });
});
