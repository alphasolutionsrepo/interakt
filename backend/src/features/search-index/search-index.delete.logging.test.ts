// src/features/search-index/search-index.delete.logging.test.ts

/**
 * Deleting a search index, or changing its AI configuration, deletes its index in the
 * search engine. When the engine fails that, the request is logged once, by the error
 * response, with the engine's error and the request id. Through the real handler and
 * service: storage and the search engine are stubbed, as in reindex.logging.test.ts.
 */

import { errors as esErrors } from '@elastic/elasticsearch';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { reported, type LogLine } from '@/shared/test/log-recorder';

const engine = vi.hoisted(() => ({ deleteResult: {} as Record<string, unknown> }));

vi.mock('server-only', () => ({}));
const logs = vi.hoisted(() => [] as LogLine[]);
vi.mock('@/shared/logger/logger', async () => (await import('@/shared/test/log-recorder')).recordingLogger(logs));
vi.mock('@/shared/utils/auth-utils', () => ({ getCurrentUserId: async () => 'admin' }));
vi.mock('@/features/data-source/data-source.service', () => ({ refreshSchemaForSearchIndex: vi.fn() }));
vi.mock('./search-index.repository', () => ({
    getSearchIndexById: async () => ({ id: 'i1', name: 'shop', searchProvider: 'elasticsearch', searchType: 'hybrid' }),
    findSearchIndexReferences: async () => [],
    deleteSearchIndex: vi.fn(),
    updateSearchIndex: vi.fn(),
    updateSearchIndexStatus: vi.fn(),
}));
vi.mock('./search-index.cache', () => ({ cache: { delete: vi.fn(), clear: vi.fn() }, clearIndexCache: vi.fn(), SEARCH_INDEX_CACHE_TTL: 1 }));
vi.mock('@/features/search-experience', () => ({ invalidateSearchExperienceCacheBySearchIndex: vi.fn() }));
vi.mock('@/features/search/providers', () => ({
    getSearchEngineProvider: () => ({
        indexExists: async () => true,
        getIndexStats: async () => ({ documentCount: 2 }),
        deleteIndex: async () => engine.deleteResult,
    }),
}));

import { handleChangeAIConfig, handleDeleteSearchIndex } from './search-index.api.handlers';

const ID = '7f1c0c56-3a9e-4a51-9b3f-2f7b8c1d2e3f';
const context = { params: Promise.resolve({ id: ID }) };
const down = new esErrors.ConnectionError('connect ECONNREFUSED 127.0.0.1:9200', { meta: {} } as never);

beforeEach(() => {
    logs.length = 0;
    engine.deleteResult = { success: false, error: down.message, cause: down };
});

describe('an index the search engine fails to delete', () => {
    it('when deleting the search index is logged once, as an error, with the error and the request id', async () => {
        const res = await handleDeleteSearchIndex(new NextRequest(`http://localhost/api/search-indexes/${ID}`, { method: 'DELETE' }), context);
        const { requestId } = await res.json();

        expect(res.ok).toBe(false);
        const [line, ...rest] = reported(logs);
        expect(rest).toEqual([]);
        expect(line).toMatchObject({ level: 'error', context: { requestId, operation: 'deleteSearchIndex' } });
        expect((line.context.err as Error).cause).toBe(down);
    });

    it('when changing the AI configuration is logged once, as an error, with the error and the request id', async () => {
        const body = JSON.stringify({ aiProviderId: '0b5c6f3e-8d1a-4c2b-9e7f-1a2b3c4d5e6f', aiModelId: 1, embeddingDimensions: 768, confirmText: 'CONFIRM' });
        const res = await handleChangeAIConfig(new NextRequest(`http://localhost/api/search-indexes/${ID}/ai-config`, { method: 'POST', body }), context);
        const { requestId } = await res.json();

        expect(res.ok).toBe(false);
        const [line, ...rest] = reported(logs);
        expect(rest).toEqual([]);
        expect(line).toMatchObject({ level: 'error', context: { requestId, operation: 'changeAIConfig' } });
        expect((line.context.err as Error).cause).toBe(down);
    });
});
