// src/features/document-indexing/document-writer.merge-lookup.handler.test.ts

/**
 * A merge into a document whose vector has to be rebuilt reads the stored document first.
 * When the engine can't answer that read, only that merge fails, explained; the other
 * operations in the batch are still written. Through the real writer and bulk handler.
 */

import { errors as esErrors } from '@elastic/elasticsearch';
import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';

import { reported, type LogLine } from '@/shared/test/log-recorder';

const logs = vi.hoisted(() => [] as LogLine[]);
vi.mock('@/shared/logger/logger', async () => (await import('@/shared/test/log-recorder')).recordingLogger(logs));
vi.mock('./document-actor', () => ({
    resolveDocumentActor: async () => ({ actor: { kind: 'user', userId: 'u1' } }),
    actorCan: () => true,
    actorLogContext: () => ({}),
    actorAuditColumns: () => ({ createdBy: 'u1' }),
}));
vi.mock('@/db/index', () => {
    const row = { id: 'idx', name: 'products', searchProvider: 'elasticsearch', searchType: 'hybrid', aiProviderId: 'p1', aiModelId: 1, embeddingDimensions: 3 };
    return { db: {
        select: () => ({ from: () => ({ where: () => ({ limit: async () => [row] }) }) }),
        update: () => ({ set: () => ({ where: async () => undefined }) }),
    } };
});
const provider = vi.hoisted(() => ({
    indexExists: async () => true,
    getDocumentById: vi.fn(),
    bulkWrite: vi.fn(async (_index: string, ops: unknown[]) => ({ success: true, indexed: ops.length, failed: 0, errors: [], counts: { upload: ops.length, merge: 0, delete: 0 } })),
    getIndexStats: async () => null,
}));
vi.mock('@/features/search/providers', () => ({ getSearchEngineProvider: () => provider }));
vi.mock('@/features/search-index/search-index-fields.service', () => ({ getFieldsBySearchIndexId: async () => [{ fieldName: 'name', sourceFieldName: 'name', sourceFieldPath: 'name', fieldType: 'text' }] }));
vi.mock('@/features/search-index/search-index-fields.repository', () => ({ getVectorSourceFields: async () => [{ fieldName: 'name', sourceFieldPath: 'name' }] }));
vi.mock('@/features/search-index/search-index.service', () => ({ recordLastJob: vi.fn(), jobError: vi.fn(), updateIndexStats: vi.fn() }));
vi.mock('@/features/ai-service', () => ({ generateEmbeddings: vi.fn(async (texts: string[]) => ({ embeddings: texts.map(() => ({ vector: [0.1, 0.2, 0.3] })) })) }));

import { handleBulkWriteDocuments } from './document-indexing.api.handlers';

describe('a bulk write whose merge lookup the engine could not answer', () => {
    it('fails that merge, explained, writes the rest, and logs it once as an error with the search service\'s error', async () => {
        const down = new esErrors.ConnectionError('', { meta: {} } as never);
        provider.getDocumentById.mockResolvedValueOnce({ found: false, error: 'ConnectionError', cause: down });
        const res = await handleBulkWriteDocuments(
            new NextRequest('http://localhost/api/search-indexes/x/documents/bulk', {
                method: 'POST',
                body: JSON.stringify({ operations: [
                    { action: 'upload', documentId: 'a', document: { name: 'Linen shirt' } },
                    { action: 'merge', documentId: 'b', document: { name: 'Wool coat' } },
                ] }),
            }),
            { params: Promise.resolve({ id: crypto.randomUUID() }) }
        );
        const body = await res.json();

        expect(res.status).toBe(207);
        expect(body.data.summary).toMatchObject({ succeeded: 1, failed: 1 });
        expect(body.data.errors).toEqual([expect.objectContaining({ documentId: 'b', error: expect.stringContaining("Elasticsearch couldn't be reached") })]);
        expect(provider.bulkWrite).toHaveBeenCalledWith('products', [expect.objectContaining({ action: 'upload', _id: 'a' })], expect.anything());
        const [line, ...more] = reported(logs);
        expect(more).toEqual([]);
        expect(line).toMatchObject({ level: 'error', message: 'Bulk document write completed' });
        expect((line.context.err as Error).cause).toBe(down);
    });
});

describe('a bulk write whose embedding model failed', () => {
    it("fails the documents that needed a vector and logs it once, as an error, with the model's error", async () => {
        logs.length = 0;
        const { generateEmbeddings } = await import('@/features/ai-service');
        const modelError = new Error('model "nomic-embed-text" not found');
        vi.mocked(generateEmbeddings).mockRejectedValueOnce(modelError);
        const res = await handleBulkWriteDocuments(
            new NextRequest('http://localhost/api/search-indexes/x/documents/bulk', {
                method: 'POST',
                body: JSON.stringify({ operations: [{ action: 'upload', documentId: 'a', document: { name: 'Linen shirt' } }] }),
            }),
            { params: Promise.resolve({ id: crypto.randomUUID() }) }
        );
        const body = await res.json();

        expect(res.status).toBe(207);
        expect(body.data.errors).toEqual([expect.objectContaining({ documentId: 'a', error: expect.stringContaining('Embedding failed') })]);
        expect(reported(logs)).toEqual([
            expect.objectContaining({ level: 'error', message: 'Bulk document write completed', context: expect.objectContaining({ err: modelError }) }),
        ]);
    });
});
