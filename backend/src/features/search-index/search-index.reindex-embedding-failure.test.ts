// src/features/search-index/search-index.reindex-embedding-failure.test.ts

/**
 * A reindex stopped by the embedding model, through the real handler, service, document
 * embedding, AI service and Ollama adapter: the answer and the index's last job say the
 * embedding model failed and why, from the provider's own error, and the index is kept.
 * Storage, the search engine and the provider lookup are stubbed, as in
 * search-index.reindex.logging.test.ts; the network answers as it does for real (fetch
 * rejecting for a closed port, Ollama's own 404 for a model it doesn't have).
 */

import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
vi.mock('@/features/ai-service/ai-service.analytics', () => ({ trackUsage: vi.fn(), updateRealtimeMetrics: vi.fn() }));
// The index's embedding model, on a local Ollama
vi.mock('@/features/ai-providers/ai-providers.service', () => ({
    getProviderConfigById: async () => ({ id: 'p1', providerKey: 'ollama', isEnabled: true, baseUrl: 'http://127.0.0.1:11434', settings: {} }),
    getModelById: async () => ({ id: 1, modelKey: 'nomic-embed-text', capabilities: {} }),
    getProviderByKey: vi.fn(),
    getResolvedDefaults: vi.fn(),
}));

import { handleTriggerReindex } from './search-index.api.handlers';
import { triggerReindex } from './search-index.service';

import { resetCircuit } from '@/features/ai-service/ai-service.resilience';

const ID = '7f1c0c56-3a9e-4a51-9b3f-2f7b8c1d2e3f';
const reindex = () => handleTriggerReindex(new NextRequest(`http://localhost/api/search-indexes/${ID}/reindex`, { method: 'POST' }), { params: Promise.resolve({ id: ID }) });

/** Nothing listens on Ollama's port: Node's fetch rejects with a TypeError whose cause is the refused connection */
const ollamaStopped = vi.fn(async () => {
    const refused = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:11434'), {
        errno: -61, code: 'ECONNREFUSED', syscall: 'connect', address: '127.0.0.1', port: 11434,
    });
    throw new TypeError('fetch failed', { cause: refused });
});

/** Ollama is running but doesn't have the model: what it answers on /api/embed, then on the older /api/embeddings */
const modelMissing = vi.fn(async (url: string) => new Response(
    JSON.stringify({ error: url.endsWith('/api/embed') ? "model 'nomic-embed-text' not found" : 'model "nomic-embed-text" not found, try pulling it first' }),
    { status: 404, headers: { 'Content-Type': 'application/json' } },
));

/** The reindex, with the AI service's waits before each retry passed at once */
async function settled<T>(work: Promise<T>): Promise<unknown> {
    const outcome = work.catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(60_000);
    return outcome;
}

beforeEach(() => {
    state.lastJobs = [];
    state.statuses = [];
    state.deleted = 0;
    resetCircuit('p1');
    vi.useFakeTimers();
});
afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe("a reindex stopped by the embedding model's server not running", () => {
    beforeEach(() => {
        vi.stubGlobal('fetch', ollamaStopped);
    });

    it("says Ollama couldn't be reached, with what to check, and keeps the index", async () => {
        const thrown = await settled(triggerReindex('i1', 'u1'));

        expect(thrown).toMatchObject({
            code: 'UPSTREAM_UNAVAILABLE',
            status: 503,
            message: "The embedding model failed for 2 of 2 documents, so the index was left as it is: Ollama couldn't be reached.",
            hint: "Check that the service is running and that the provider's settings under AI Providers are correct, then try again.",
            details: { provider: 'Ollama', code: 'ECONNREFUSED', message: 'connect ECONNREFUSED 127.0.0.1:11434' },
        });
        expect(state.deleted).toBe(0);
        expect(state.statuses).toEqual(['indexing', 'active']);
        expect(state.lastJobs.at(-1)).toMatchObject({
            status: 'failed',
            error: { code: 'UPSTREAM_UNAVAILABLE', message: (thrown as Error).message, hint: (thrown as { hint: string }).hint },
        });
    });

    it('answers through the API with the explanation, not an internal error', async () => {
        const res = await settled(reindex()) as Response;
        const body = await res.json();

        expect(res.status).toBe(503);
        expect(body).toMatchObject({ code: 'UPSTREAM_UNAVAILABLE', message: expect.stringMatching(/^The embedding model failed for 2 of 2 documents.*Ollama couldn't be reached/) });
        expect(state.deleted).toBe(0);
    });
});

describe('a reindex stopped by the embedding model missing from Ollama', () => {
    beforeEach(() => {
        vi.stubGlobal('fetch', modelMissing);
    });

    it("gives Ollama's own words for the missing model, and keeps the index", async () => {
        const thrown = await settled(triggerReindex('i1', 'u1'));

        expect(thrown).toMatchObject({
            code: 'UPSTREAM_ERROR',
            message: 'The embedding model failed for 2 of 2 documents, so the index was left as it is: model "nomic-embed-text" not found, try pulling it first',
            details: { provider: 'Ollama', status: 404 },
        });
        expect(modelMissing).toHaveBeenCalledTimes(2); // not retried: the model won't appear on its own
        expect(state.deleted).toBe(0);
        expect(state.statuses).toEqual(['indexing', 'active']);
        expect(state.lastJobs.at(-1)).toMatchObject({ status: 'failed', error: { code: 'UPSTREAM_ERROR', message: (thrown as Error).message } });
    });
});
