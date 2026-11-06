// src/features/search-index/search-index.trigger-reindex.test.ts

/**
 * How a reindex ends, through the real triggerReindex: every document written back
 * succeeds, some failing is partial, none written fails (and the count says the index
 * is empty). Storage, the search engine and the field config are stubbed.
 */

import { errors as esErrors } from '@elastic/elasticsearch';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
    bulk: { success: true, indexed: 2, failed: 0, errors: [] as Array<{ index: number; error: string }>, took: 1 } as Record<string, unknown>,
    lastJobs: [] as Array<Record<string, unknown>>,
    updates: [] as Array<Record<string, unknown>>,
    statuses: [] as string[],
    status: 'active',
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
    getSearchIndexById: async () => ({ id: 'i1', name: 'shop', searchProvider: 'elasticsearch', status: state.status }),
    updateSearchIndexStatus: async (_id: string, status: string) => { state.statuses.push(status); },
    setLastJob: async (_id: string, job: Record<string, unknown>) => { state.lastJobs.push(job); },
    updateSearchIndex: async (_id: string, values: Record<string, unknown>) => { state.updates.push(values); },
    markMappingSynced: vi.fn(),
}));
vi.mock('./search-index.cache', () => ({ cache: { delete: vi.fn(), get: vi.fn(), set: vi.fn() }, clearIndexCache: vi.fn(), SEARCH_INDEX_CACHE_TTL: 1 }));
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

import { triggerReindex } from './search-index.service';

beforeEach(() => {
    state.lastJobs = [];
    state.updates = [];
    state.statuses = [];
    state.status = 'active';
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
        const body = { error: { root_cause: [{ type: 'no_shard_available_action_exception', reason: null }], type: 'search_phase_execution_exception', reason: 'all shards failed' }, status: 503 };
        const noShards = new esErrors.ResponseError({ body, statusCode: 503, headers: {}, meta: {} as never, warnings: null });
        state.engine = { fetchAllDocuments: async () => ({ success: false, documents: [], error: noShards.message, cause: noShards }) };
        const thrown = await triggerReindex('i1', 'u1').catch((e: unknown) => e);
        expect(thrown).toMatchObject({ message: "Couldn't read the index's documents, so it was left as it is: all shards failed" });
        expect((thrown as { hint?: string }).hint ?? '').not.toMatch(/endpoint|admin key/);
        expect(state.statuses).toEqual(['indexing', 'active']);
    });

    it('treats a refused delete as no change: the index keeps its status', async () => {
        state.engine = { deleteIndex: async () => ({ success: false, error: 'blocked', cause: refused() }) };
        const thrown = await triggerReindex('i1', 'u1').catch((e: unknown) => e);
        expect(thrown).toMatchObject({ code: 'UPSTREAM_READ_ONLY', message: expect.stringMatching(/^Couldn't reindex the index, so it was left as it is/), details: { status: 403 } });
        expect(state.statuses).toEqual(['indexing', 'active']);
    });

    it('marks the index errored when the failed delete took it away', async () => {
        let exists = true;
        state.engine = {
            indexExists: async () => exists,
            deleteIndex: async () => { exists = false; return { success: false, error: 'timed out', cause: unreachable() }; },
        };
        await triggerReindex('i1', 'u1').catch(() => undefined);
        expect(state.statuses).toEqual(['indexing', 'error']);
    });

    it('marks the index errored when the search service went away at the delete: it may be gone', async () => {
        let checks = 0;
        state.engine = {
            indexExists: async () => { if (checks++ === 0) return true; throw unreachable(); },
            deleteIndex: async () => ({ success: false, error: 'connection lost', cause: unreachable() }),
        };
        const thrown = await triggerReindex('i1', 'u1').catch((e: unknown) => e);
        expect(state.statuses).toEqual(['indexing', 'error']);
        expect((thrown as Error).message).toMatch(/Failed to delete index/);
    });

    it('puts the status back when embedding the documents fails, before anything was deleted', async () => {
        state.embeddings = { enabled: true };
        state.embedded.mockResolvedValue({ stats: { failed: 2, generated: 0, skipped: 0 }, errors: [{ error: 'model not found' }], embeddings: [] });
        const thrown = await triggerReindex('i1', 'u1').catch((e: unknown) => e);
        expect((thrown as Error).message).toMatch(/Embedding generation failed for 2 of 2 documents/);
        expect(state.statuses).toEqual(['indexing', 'active']);
        expect(state.deletes).toBe(0);
    });

    it("never puts back 'indexing' left by another reindex: no job runs for it now", async () => {
        state.status = 'indexing';
        state.engine = { fetchAllDocuments: async () => ({ success: false, error: 'boom', cause: unreachable() }) };
        await triggerReindex('i1', 'u1').catch(() => undefined);
        expect(state.statuses).toEqual(['indexing', 'active']);
    });
});
