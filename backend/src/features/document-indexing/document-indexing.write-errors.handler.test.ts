// src/features/document-indexing/document-indexing.write-errors.handler.test.ts

/**
 * A document read or write that fails on our side is logged once, by the error
 * response, with the request id and the operation. A missing index answers 404 as
 * before.
 */

import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { reported, type LogLine } from '@/shared/test/log-recorder';

const logs = vi.hoisted(() => [] as LogLine[]);
vi.mock('@/shared/logger/logger', async () => (await import('@/shared/test/log-recorder')).recordingLogger(logs));
vi.mock('./document-actor', () => ({
    resolveDocumentActor: async () => ({ actor: { kind: 'user', userId: 'u1' } }),
    actorCan: () => true,
    actorLogContext: () => ({}),
    actorAuditColumns: () => ({ createdBy: 'u1' }),
}));
vi.mock('./document-indexer.service', () => ({
    indexDocuments: vi.fn(), getIndexingProgress: vi.fn(), listBatches: vi.fn(), cancelBatch: vi.fn(),
}));
const writer = vi.hoisted(() => ({
    getDocument: vi.fn(), listDocuments: vi.fn(), writeDocuments: vi.fn(), deleteDocumentsByFilter: vi.fn(),
    SearchIndexNotFoundError: class SearchIndexNotFoundError extends Error {},
    IndexNotProvisionedError: class IndexNotProvisionedError extends Error {},
}));
vi.mock('./document-writer.service', () => writer);
vi.mock('@/features/search-index/search-index.service', () => ({ recordLastJob: vi.fn(), jobError: vi.fn() }));

import { handleDeleteDocumentsByFilter, handleGetDocument } from './document-indexing.api.handlers';

const ID = crypto.randomUUID();
const deleteByFilter = () => handleDeleteDocumentsByFilter(
    new NextRequest(`http://localhost/api/search-indexes/${ID}/documents/delete-by-filter`, {
        method: 'POST',
        body: JSON.stringify({ filters: [{ field: 'brand', operator: 'eq', value: 'Acme' }] }),
    }),
    { params: Promise.resolve({ id: ID }) }
);
const getDocument = () => handleGetDocument(
    new NextRequest(`http://localhost/api/search-indexes/${ID}/documents/d1`),
    { params: Promise.resolve({ id: ID, documentId: 'd1' }) }
);

beforeEach(() => { logs.length = 0; });

describe('a document request that fails on our side', () => {
    it.each([
        { operation: 'deleteIndexDocumentsByFilter', work: () => writer.deleteDocumentsByFilter, call: deleteByFilter },
        { operation: 'getIndexDocument', work: () => writer.getDocument, call: getDocument },
    ])('$operation logs it once, as an error with the request id, the operation and the error', async ({ operation, work, call }) => {
        const down = new Error('connect ECONNREFUSED 127.0.0.1:9200');
        work().mockRejectedValue(down);
        const res = await call();
        const body = await res.json();

        expect(res.status).toBe(500);
        expect(reported(logs)).toEqual([
            expect.objectContaining({ level: 'error', context: expect.objectContaining({ requestId: body.requestId, operation, err: down }) }),
        ]);
    });

    it('answers a missing index with 404, as before', async () => {
        writer.deleteDocumentsByFilter.mockRejectedValue(new writer.SearchIndexNotFoundError(`Search index ${ID} not found`));
        const res = await deleteByFilter();

        expect(res.status).toBe(404);
        expect(await res.json()).toMatchObject({ code: 'NOT_FOUND', message: `Search index ${ID} not found` });
    });
});
