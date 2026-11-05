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
}));

vi.mock('server-only', () => ({}));
vi.mock('@/shared/logger/logger', () => ({
    createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
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
        createIndex: async () => ({ success: true }),
        bulkIndex: async () => state.bulk,
        refreshIndex: vi.fn(),
    }),
}));

import { triggerReindex } from './search-index.service';

beforeEach(() => {
    state.lastJobs = [];
    state.updates = [];
});

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
});
