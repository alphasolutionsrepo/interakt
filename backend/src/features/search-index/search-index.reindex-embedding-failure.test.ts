// src/features/search-index/search-index.reindex-embedding-failure.test.ts

/**
 * A reindex stopped by the embedding model, through the real handler, service and
 * document embedding: the answer and the index's last job say the embedding model failed
 * and why, from the provider's own error, and the index is kept. Storage, the search
 * engine and the AI service are stubbed, as in search-index.reindex.logging.test.ts.
 */

import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
    lastJobs: [] as Array<Record<string, unknown>>,
    statuses: [] as string[],
    deleted: 0,
}));

vi.mock('server-only', () => ({}));
vi.mock('@/shared/logger/logger', () => ({
    createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock('@/shared/utils/auth-utils', () => ({ getCurrentUserId: async () => 'admin' }));
vi.mock('@/features/data-source/data-source.service', () => ({ refreshSchemaForSearchIndex: vi.fn() }));
vi.mock('./search-index.repository', () => ({
    getSearchIndexById: async () => ({
        id: 'i1', name: 'shop', searchProvider: 'elasticsearch', status: 'active',
        searchType: 'semantic', aiProviderId: 'p1', aiModelId: 1, embeddingDimensions: 768,
    }),
    updateSearchIndexStatus: async (_id: string, status: string) => { state.statuses.push(status); },
    setLastJob: async (_id: string, job: Record<string, unknown>) => { state.lastJobs.push(job); },
    updateSearchIndex: vi.fn(),
    markMappingSynced: vi.fn(),
}));
vi.mock('./search-index.cache', () => ({ cache: { delete: vi.fn(), get: vi.fn(), set: vi.fn() }, clearIndexCache: vi.fn(), clearCachedIndexRecord: vi.fn(), SEARCH_INDEX_CACHE_TTL: 1 }));
vi.mock('./search-index-fields.service', () => ({
    getFieldsBySearchIndexId: async () => [{ fieldName: 'title' }],
    getVectorSourceFields: async () => [{ fieldName: 'title' }],
}));
vi.mock('./provider-settings.utils', () => ({ buildIndexSettingsContext: () => ({}) }));
vi.mock('@/features/search-experience', () => ({ invalidateSearchExperienceCacheBySearchIndex: vi.fn() }));
vi.mock('@/features/search/providers', () => ({
    getSearchEngineProvider: () => ({
        indexExists: async () => true,
        fetchAllDocuments: async () => ({ success: true, documents: [{ _id: 'a', _source: { title: 'A' } }, { _id: 'b', _source: { title: 'B' } }] }),
        buildIndexSettings: () => ({}),
        deleteIndex: async () => { state.deleted++; return { success: true }; },
        createIndex: async () => ({ success: true }),
        bulkIndex: async () => ({ success: true, indexed: 2, failed: 0, errors: [], took: 1 }),
        refreshIndex: vi.fn(),
    }),
}));
// The embedding provider is down, as our Ollama adapter reports it
const ollamaDown = vi.hoisted(() => Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:11434'), { name: 'AdapterError', providerKey: 'ollama' }));
vi.mock('@/features/ai-service', () => ({ generateEmbeddings: vi.fn(async () => { throw ollamaDown; }) }));

import { handleTriggerReindex } from './search-index.api.handlers';
import { triggerReindex } from './search-index.service';

const ID = '7f1c0c56-3a9e-4a51-9b3f-2f7b8c1d2e3f';
const reindex = () => handleTriggerReindex(new NextRequest(`http://localhost/api/search-indexes/${ID}/reindex`, { method: 'POST' }), { params: Promise.resolve({ id: ID }) });

beforeEach(() => {
    state.lastJobs = [];
    state.statuses = [];
    state.deleted = 0;
});

describe('a reindex stopped by the embedding model', () => {
    it('says the embedding model failed and why, from the provider, and keeps the index', async () => {
        const thrown = await triggerReindex('i1', 'u1').catch((e: unknown) => e);

        expect(thrown).toMatchObject({
            code: 'UPSTREAM_UNAVAILABLE',
            message: expect.stringMatching(/^The embedding model failed for 2 of 2 documents, so the index was left as it is: Ollama/),
            details: { provider: 'Ollama' },
        });
        expect((thrown as Error).cause).toBe(ollamaDown);
        expect(state.deleted).toBe(0);
        expect(state.statuses).toEqual(['indexing', 'active']);
        expect(state.lastJobs.at(-1)).toMatchObject({
            status: 'failed',
            error: { code: 'UPSTREAM_UNAVAILABLE', message: (thrown as Error).message },
        });
    });

    it('answers through the API with the explanation, not an internal error', async () => {
        const res = await reindex();
        const body = await res.json();

        expect(res.status).not.toBe(500);
        expect(body).toMatchObject({ code: 'UPSTREAM_UNAVAILABLE', message: expect.stringMatching(/^The embedding model failed/) });
        expect(body.code).not.toBe('INTERNAL_ERROR');
        expect(state.deleted).toBe(0);
    });
});
