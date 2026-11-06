// src/features/search-index/search-index.trigger-reindex.test.ts

/**
 * How a reindex ends, through the real triggerReindex: every document written back
 * succeeds, some failing is partial, none written fails (and the count says the index
 * is empty). Storage, the search engine and the field config are stubbed.
 */

import { errors as esErrors } from '@elastic/elasticsearch';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
    bulk: { success: true, indexed: 2, failed: 0, errors: [] as Array<{ index: number; error: string }>, took: 1 } as Record<string, unknown>,
    lastJobs: [] as Array<Record<string, unknown>>,
    updates: [] as Array<Record<string, unknown>>,
    statuses: [] as string[],
    status: 'active',
    /** The job recorded on the index before this reindex */
    lastJob: undefined as Record<string, unknown> | undefined,
    documents: [{ _id: 'a', _source: { title: 'A' } }, { _id: 'b', _source: { title: 'B' } }] as Array<Record<string, unknown>>,
    /** Engine calls a test changes, over the defaults below */
    engine: {} as Record<string, (...args: unknown[]) => Promise<unknown>>,
    embeddings: { enabled: false } as Record<string, unknown>,
    embedded: vi.fn(),
    deletes: 0,
}));

vi.mock('server-only', () => ({}));
vi.mock('@/shared/logger/logger', () => ({
    createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock('./search-index.repository', () => ({
    getSearchIndexById: async () => ({ id: 'i1', name: 'shop', searchProvider: 'elasticsearch', status: state.status, lastJob: state.lastJob }),
    updateSearchIndexStatus: async (_id: string, status: string) => { state.statuses.push(status); },
    setLastJob: async (_id: string, job: Record<string, unknown>) => { state.lastJobs.push(job); },
    updateSearchIndex: async (_id: string, values: Record<string, unknown>) => { state.updates.push(values); },
    markMappingSynced: vi.fn(),
}));
vi.mock('./search-index.cache', () => ({ cache: { delete: vi.fn(), get: vi.fn(), set: vi.fn() }, clearIndexCache: vi.fn(), clearCachedIndexRecord: vi.fn(), SEARCH_INDEX_CACHE_TTL: 1 }));
vi.mock('./search-index-fields.service', () => ({
    getFieldsBySearchIndexId: async () => [{ fieldName: 'title' }],
    getVectorSourceFields: async () => [{ fieldName: 'title' }],
}));
vi.mock('./provider-settings.utils', () => ({ buildIndexSettingsContext: () => ({}) }));
vi.mock('@/features/search-experience', () => ({ invalidateSearchExperienceCacheBySearchIndex: vi.fn() }));
vi.mock('@/features/document-indexing/document-indexer.service', () => ({
    EMBEDDING_FIELD_NAME: 'content_embedding',
    getEmbeddingConfig: () => state.embeddings,
    generateDocumentEmbeddings: (...args: unknown[]) => state.embedded(...args),
}));
vi.mock('@/features/search/providers', () => ({
    getSearchEngineProvider: () => ({
        indexExists: async () => true,
        fetchAllDocuments: async () => ({ success: true, documents: state.documents }),
        buildIndexSettings: () => ({}),
        deleteIndex: async () => { state.deletes++; return { success: true }; },
        createIndex: async () => ({ success: true }),
        bulkIndex: async () => state.bulk,
        refreshIndex: vi.fn(),
        ...state.engine,
    }),
}));

import { DELETE_SETTLE, REINDEX_RUNNING_LIMIT_MS, triggerReindex } from './search-index.service';

beforeEach(() => {
    state.lastJobs = [];
    state.updates = [];
    state.statuses = [];
    state.status = 'active';
    state.lastJob = undefined;
    state.documents = [{ _id: 'a', _source: { title: 'A' } }, { _id: 'b', _source: { title: 'B' } }];
    state.engine = {};
    state.embeddings = { enabled: false };
    state.deletes = 0;
});

const refused = () => new esErrors.ResponseError({
    body: { error: { type: 'cluster_block_exception', reason: 'index [shop] blocked by: [FORBIDDEN/5/index read-only (api)];' }, status: 403 },
    statusCode: 403, headers: {}, meta: {}, warnings: null,
} as never);
const unreachable = () => new esErrors.ConnectionError('', { body: null, statusCode: 0, headers: {}, meta: {}, warnings: null } as never);

describe('triggerReindex', () => {
    it('succeeds when every document is written back', async () => {
        state.bulk = { success: true, indexed: 2, failed: 0, errors: [], took: 1 };
        const result = await triggerReindex('i1', 'u1');
        expect(result).toMatchObject({ documentCount: 2, outcome: { status: 'succeeded', summary: '2 documents reindexed' } });
        expect(state.lastJobs.at(-1)).toMatchObject({ status: 'succeeded' });
    });

    it('is partial when some documents fail, counting only those written', async () => {
        state.bulk = { success: false, indexed: 1, failed: 1, errors: [{ index: 1, error: 'mapper_parsing_exception' }], took: 1 };
        const result = await triggerReindex('i1', 'u1');
        expect(result).toMatchObject({ documentCount: 1, outcome: { status: 'partial', summary: '1 of 2 documents reindexed, 1 failed: mapper_parsing_exception' } });
        expect(state.lastJobs.at(-1)).toMatchObject({ status: 'partial' });
    });

    it('fails when nothing is written back, records the index as empty, and says what to do', async () => {
        state.bulk = { success: false, indexed: 0, failed: 2, errors: [{ index: 0, error: 'index [shop] blocked by: [FORBIDDEN/8/index write (api)];' }], took: 1 };
        const thrown = await triggerReindex('i1', 'u1').catch((e: unknown) => e);
        expect(thrown).toMatchObject({ code: 'REINDEX_FAILED' });
        expect((thrown as { hint?: string }).hint).toMatch(/read-only/);
        expect(state.updates.at(-1)).toMatchObject({ documentCount: 0 });
        expect(state.lastJobs.at(-1)).toMatchObject({ status: 'failed', error: { code: 'REINDEX_FAILED' } });
    });

    it('explains a write that failed as a whole, from the error itself (it timed out)', async () => {
        const timedOut = new esErrors.TimeoutError('Request timed out', { body: null, statusCode: 0, headers: {}, meta: {}, warnings: null } as never);
        state.bulk = { success: false, indexed: 0, failed: 2, errors: [{ index: 0, error: 'Request timed out' }, { index: 1, error: 'Request timed out' }], took: 1, writeError: timedOut };
        const thrown = await triggerReindex('i1', 'u1').catch((e: unknown) => e);
        expect(thrown).toMatchObject({ code: 'REINDEX_FAILED', message: "None of the 2 documents could be written back: Elasticsearch didn't respond in time." });
        expect((thrown as { hint?: string }).hint).toMatch(/fewer documents/);
        expect(state.lastJobs.at(-1)).toMatchObject({ status: 'failed', error: { code: 'REINDEX_FAILED', hint: expect.stringMatching(/fewer documents/) } });
    });

    it('says an empty index is empty, as a reindex that finished with problems', async () => {
        state.documents = [];
        state.bulk = { success: true, indexed: 0, failed: 0, errors: [], took: 1 };
        const result = await triggerReindex('i1', 'u1');
        expect(result.outcome).toMatchObject({ status: 'partial', summary: expect.stringMatching(/^The index is empty/) });
        expect(state.lastJobs.at(-1)).toMatchObject({ status: 'partial' });
    });
});

describe('triggerReindex stopped before it changed the index', () => {
    it('puts the status back and says the index was left as it is when the search service is unreachable', async () => {
        state.engine = { indexExists: async () => { throw unreachable(); } };
        const thrown = await triggerReindex('i1', 'u1').catch((e: unknown) => e);
        expect(thrown).toMatchObject({ code: 'UPSTREAM_UNAVAILABLE', message: "Couldn't reindex the index, so it was left as it is: Elasticsearch couldn't be reached." });
        expect(state.statuses).toEqual(['indexing', 'active']);
        expect(state.lastJobs.at(-1)).toMatchObject({ status: 'failed', error: { code: 'UPSTREAM_UNAVAILABLE', details: { provider: 'Elasticsearch' } } });
    });

    it("gives Azure AI Search's own reason when it refuses reading the documents", async () => {
        const refusal = Object.assign(new Error("Invalid expression: '$skip' must be less than 100000."), {
            name: 'RestError', statusCode: 400,
            response: { status: 400, bodyAsText: JSON.stringify({ error: { message: "Invalid expression: '$skip' must be less than 100000." } }) },
        });
        state.engine = { fetchAllDocuments: async () => ({ success: false, error: refusal.message, cause: refusal }) };
        const thrown = await triggerReindex('i1', 'u1').catch((e: unknown) => e);
        expect(thrown).toMatchObject({
            message: "Couldn't read the index's documents, so it was left as it is: Invalid expression: '$skip' must be less than 100000.",
            details: { provider: 'Azure AI Search', status: 400 },
        });
        expect(state.statuses).toEqual(['indexing', 'active']);
    });

    it("gives the engine's text when a failed read carries no error to explain", async () => {
        state.engine = { fetchAllDocuments: async () => ({ success: false, error: 'scroll context lost' }) };
        const thrown = await triggerReindex('i1', 'u1').catch((e: unknown) => e);
        expect(thrown).toMatchObject({ code: 'REINDEX_FAILED', status: 502, message: "Couldn't read the index's documents, so it was left as it is: scroll context lost" });
        expect(state.statuses).toEqual(['indexing', 'active']);
    });

    it('leaves the index as it is when Elasticsearch gave only some of its documents', async () => {
        const partial = new Error("Elasticsearch couldn't read 1 of the index's 2 shards");
        state.engine = { fetchAllDocuments: async () => ({ success: false, documents: [], error: partial.message, cause: partial }) };
        const thrown = await triggerReindex('i1', 'u1').catch((e: unknown) => e);
        expect(thrown).toMatchObject({ code: 'REINDEX_FAILED', status: 502, message: "Couldn't read the index's documents, so it was left as it is: Elasticsearch couldn't read 1 of the index's 2 shards" });
        expect(state.statuses).toEqual(['indexing', 'active']);
    });

    it("leaves the index as it is when its shards aren't available, with Elasticsearch's reason", async () => {
        // What the read gets from a real Elasticsearch 9 (6 Nov), asking for complete results
        const body = { error: { root_cause: [], type: 'search_phase_execution_exception', reason: '', caused_by: { type: 'search_phase_execution_exception', reason: 'Search rejected due to missing shards [[shop][0]]. Consider using `allow_partial_search_results` setting to bypass this error.' } }, status: 503 };
        const noShards = new esErrors.ResponseError({ body, statusCode: 503, headers: {}, meta: {} as never, warnings: null });
        state.engine = { fetchAllDocuments: async () => ({ success: false, documents: [], error: noShards.message, cause: noShards }) };
        const thrown = await triggerReindex('i1', 'u1').catch((e: unknown) => e);
        expect(thrown).toMatchObject({ message: "Couldn't read the index's documents, so it was left as it is: Search rejected due to missing shards [[shop][0]]." });
        expect((thrown as { hint?: string }).hint ?? '').not.toMatch(/endpoint|admin key/);
        expect(state.statuses).toEqual(['indexing', 'active']);
    });

    it('treats a refused delete as no change: the index keeps its status', async () => {
        state.engine = { deleteIndex: async () => ({ success: false, error: 'blocked', cause: refused() }) };
        const thrown = await triggerReindex('i1', 'u1').catch((e: unknown) => e);
        expect(thrown).toMatchObject({ code: 'UPSTREAM_READ_ONLY', message: expect.stringMatching(/^Couldn't reindex the index, so it was left as it is/), details: { status: 403 } });
        expect(state.statuses).toEqual(['indexing', 'active']);
    });

    describe('when the delete breaks off with no answer', () => {
        beforeEach(() => { DELETE_SETTLE.intervalMs = 1; });
        afterEach(() => { DELETE_SETTLE.intervalMs = 1000; });
        const timedOut = () => new esErrors.TimeoutError('Request timed out', { body: null, statusCode: 0, headers: {}, meta: {}, warnings: null } as never);

        it('carries on when the delete had gone through: the documents are written back', async () => {
            state.bulk = { success: true, indexed: 2, failed: 0, errors: [], took: 1 };
            let exists = true;
            state.engine = {
                indexExists: async () => exists,
                deleteIndex: async () => { exists = false; return { success: false, error: 'timed out', cause: timedOut() }; },
            };
            const result = await triggerReindex('i1', 'u1');
            expect(result).toMatchObject({ documentCount: 2, outcome: { status: 'succeeded' } });
        });

        it('carries on when the delete goes through a moment after we gave up', async () => {
            // What Elasticsearch 9 did (6 Nov): the index still there right after the client timed out, gone soon after
            state.bulk = { success: true, indexed: 2, failed: 0, errors: [], took: 1 };
            let checksAfterDelete = 0;
            let deleted = false;
            state.engine = {
                indexExists: async () => !deleted || checksAfterDelete++ < 2,
                deleteIndex: async () => { deleted = true; return { success: false, error: 'timed out', cause: timedOut() }; },
            };
            const result = await triggerReindex('i1', 'u1');
            expect(result).toMatchObject({ documentCount: 2, outcome: { status: 'succeeded' } });
        });

        it('asks again when the index is still there after the wait, and carries on when that goes through', async () => {
            state.bulk = { success: true, indexed: 2, failed: 0, errors: [], took: 1 };
            let deletes = 0;
            state.engine = {
                indexExists: async () => true,
                deleteIndex: async () => (++deletes === 1 ? { success: false, error: 'timed out', cause: timedOut() } : { success: true }),
            };
            const result = await triggerReindex('i1', 'u1');
            expect(deletes).toBe(2);
            expect(result).toMatchObject({ documentCount: 2, outcome: { status: 'succeeded' } });
        });

        it('leaves the index as it is when the service refuses the second delete and the index is there', async () => {
            let deletes = 0;
            state.engine = {
                indexExists: async () => true,
                deleteIndex: async () => (++deletes === 1 ? { success: false, error: 'timed out', cause: timedOut() } : { success: false, error: 'blocked', cause: refused() }),
            };
            const thrown = await triggerReindex('i1', 'u1').catch((e: unknown) => e);
            expect((thrown as Error).message).toMatch(/left as it is/);
            expect(state.statuses).toEqual(['indexing', 'active']);
        });

        it.each([[504, 'Gateway Timeout'], [503, 'Service Unavailable']])('watches a delete a gateway answered %s, which says nothing of the delete, and carries on when it went through', async (statusCode, text) => {
            state.bulk = { success: true, indexed: 2, failed: 0, errors: [], took: 1 };
            const gateway = new esErrors.ResponseError({ body: text, statusCode, headers: {}, meta: {}, warnings: null } as never);
            let checksAfterDelete = 0;
            let deleted = false;
            state.engine = {
                indexExists: async () => !deleted || checksAfterDelete++ < 1,
                deleteIndex: async () => { deleted = true; return { success: false, error: text, cause: gateway }; },
            };
            const result = await triggerReindex('i1', 'u1');
            expect(result).toMatchObject({ documentCount: 2, outcome: { status: 'succeeded' } });
        });

        it('puts the status back when the second delete breaks off too and the index is still there, and says the delete may still go through', async () => {
            state.engine = {
                indexExists: async () => true,
                deleteIndex: async () => ({ success: false, error: 'timed out', cause: timedOut() }),
            };
            const thrown = await triggerReindex('i1', 'u1').catch((e: unknown) => e);
            // Not 'as it is': the delete may yet take it
            expect((thrown as Error).message).not.toMatch(/left as it is/);
            expect((thrown as Error).message).toMatch(/still there at the last check/);
            expect(state.statuses).toEqual(['indexing', 'active']);
            expect(state.lastJobs.at(-1)).toMatchObject({
                status: 'failed',
                error: { code: 'UPSTREAM_TIMEOUT', hint: expect.stringMatching(/^The delete may still go through on the search service\. Check the index/) },
            });
        });

        it("marks the index errored when the second delete breaks off and whether the index is there can't be checked", async () => {
            // The first look, five while waiting (still there), then none after the second delete
            let checks = 0;
            state.engine = {
                indexExists: async () => { if (++checks > 6) throw unreachable(); return true; },
                deleteIndex: async () => ({ success: false, error: 'timed out', cause: timedOut() }),
            };
            const thrown = await triggerReindex('i1', 'u1').catch((e: unknown) => e);
            expect(checks).toBe(7);
            expect(state.statuses).toEqual(['indexing', 'error']);
            expect((thrown as { hint?: string }).hint).toMatch(/upload its documents again/);
        });
    });

    it('looks once after a delete the search service refused', async () => {
        let checksAfterDelete = 0;
        let asked = false;
        state.engine = {
            indexExists: async () => { if (asked) checksAfterDelete++; return true; },
            deleteIndex: async () => { asked = true; return { success: false, error: 'blocked', cause: refused() }; },
        };
        await triggerReindex('i1', 'u1').catch(() => undefined);
        expect(checksAfterDelete).toBe(1);
    });

    it('marks the index errored when the search service went away at the delete: it may be gone', async () => {
        let checks = 0;
        state.engine = {
            indexExists: async () => { if (checks++ === 0) return true; throw unreachable(); },
            deleteIndex: async () => ({ success: false, error: 'connection lost', cause: unreachable() }),
        };
        const thrown = await triggerReindex('i1', 'u1').catch((e: unknown) => e);
        expect(state.statuses).toEqual(['indexing', 'error']);
        expect(thrown).toMatchObject({
            code: 'UPSTREAM_UNAVAILABLE',
            message: "Reindex failed. Couldn't tell whether the index was deleted: Elasticsearch couldn't be reached.",
            hint: expect.stringMatching(/if it is gone, reindex it and upload its documents again\.$/),
        });
    });

    it('puts the status back when embedding the documents fails, before anything was deleted', async () => {
        state.embeddings = { enabled: true };
        state.embedded.mockResolvedValue({ stats: { failed: 2, generated: 0, skipped: 0 }, errors: [{ error: 'model not found' }], embeddings: [] });
        const thrown = await triggerReindex('i1', 'u1').catch((e: unknown) => e);
        expect((thrown as Error).message).toMatch(/Embedding generation failed for 2 of 2 documents/);
        expect(state.statuses).toEqual(['indexing', 'active']);
        expect(state.deletes).toBe(0);
    });

    it('says the documents must be uploaded again when the index was deleted and creating it again was refused', async () => {
        state.engine = { createIndex: async () => ({ success: false, error: 'blocked', cause: refused() }) };
        const thrown = await triggerReindex('i1', 'u1').catch((e: unknown) => e);
        expect(state.deletes).toBe(1);
        expect(thrown).toMatchObject({
            code: 'UPSTREAM_READ_ONLY',
            message: "Reindex failed. The index was deleted to rebuild it, but couldn't be created again: Elasticsearch is refusing writes to this index.",
            details: { status: 403 },
        });
        // The search service's advice, then the upload, and no "try again": another reindex has nothing to read
        const hint = (thrown as { hint?: string }).hint ?? '';
        expect(hint).toMatch(/clear the read-only block on the index\. Its documents were deleted with it: upload them again once it's created\.$/);
        expect(hint).not.toMatch(/try again/);
        expect(state.statuses).toEqual(['indexing', 'error']);
        expect(state.lastJobs.at(-1)).toMatchObject({ status: 'failed', error: { code: 'UPSTREAM_READ_ONLY', hint } });
    });

    it("never puts back 'indexing' left by another reindex: no job runs for it now", async () => {
        state.status = 'indexing';
        state.engine = { fetchAllDocuments: async () => ({ success: false, error: 'boom', cause: unreachable() }) };
        await triggerReindex('i1', 'u1').catch(() => undefined);
        expect(state.statuses).toEqual(['indexing', 'active']);
    });
});

describe('triggerReindex while another reindex is running', () => {
    const running = (minutesAgo: number) => ({ kind: 'reindex', status: 'running', startedAt: new Date(Date.now() - minutesAgo * 60_000).toISOString() });

    it('is refused as a conflict, changing nothing', async () => {
        state.status = 'indexing';
        state.lastJob = running(2);
        const thrown = await triggerReindex('i1', 'u1').catch((e: unknown) => e);
        expect(thrown).toMatchObject({ code: 'CONFLICT', status: 409, message: 'A reindex is already running for this index' });
        expect(state.statuses).toEqual([]);
        expect(state.lastJobs).toEqual([]);
        expect(state.deletes).toBe(0);
    });

    it('goes ahead when the running reindex started longer ago than the limit: it was cut off', async () => {
        expect(REINDEX_RUNNING_LIMIT_MS).toBe(30 * 60_000);
        state.status = 'indexing';
        state.lastJob = running(31);
        const result = await triggerReindex('i1', 'u1');
        expect(result.outcome).toMatchObject({ status: 'succeeded' });
        expect(state.statuses).toEqual(['indexing', 'active']);
    });

    it('goes ahead when the index is indexing for something other than a running reindex', async () => {
        state.status = 'indexing';
        state.lastJob = { kind: 'reindex', status: 'failed', startedAt: new Date().toISOString() };
        const result = await triggerReindex('i1', 'u1');
        expect(result.outcome).toMatchObject({ status: 'succeeded' });
    });
});
