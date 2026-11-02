// src/features/document-indexing/document-indexing.upload-outcome.handler.test.ts

/**
 * The upload endpoint returns how the upload ended (outcome), the same value it keeps
 * on the index. The Activity panel trusts it: a 207 answer alone doesn't say whether
 * anything went in.
 */

import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ result: undefined as unknown, recorded: [] as unknown[] }));

vi.mock('./document-actor', () => ({
    resolveDocumentActor: async () => ({ actor: { kind: 'user', userId: 'u1' } }),
    actorCan: () => true,
    actorLogContext: () => ({}),
    actorAuditColumns: () => ({ createdBy: 'u1' }),
}));
vi.mock('./document-indexer.service', () => ({
    indexDocuments: async () => state.result,
    getIndexingProgress: vi.fn(),
    listBatches: vi.fn(),
    cancelBatch: vi.fn(),
}));
vi.mock('./document-writer.service', () => ({
    getDocument: vi.fn(), listDocuments: vi.fn(), writeDocuments: vi.fn(), deleteDocumentsByFilter: vi.fn(),
    SearchIndexNotFoundError: class extends Error {}, IndexNotProvisionedError: class extends Error {},
}));
vi.mock('@/features/search-index/search-index.service', () => ({
    recordLastJob: async (_id: string, job: unknown) => { state.recorded.push(job); },
    jobError: vi.fn(),
}));

import { handleIndexDocuments } from './document-indexing.api.handlers';

async function upload(indexed: number, failed: number) {
    state.result = {
        success: failed === 0, batchId: 'b1', totalDocuments: indexed + failed, indexedDocuments: indexed, failedDocuments: failed,
        errors: failed ? [{ documentIndex: 0, error: 'No source field configured', field: 'customFields' }] : [],
        warnings: [], durationMs: 5,
        embeddingStats: { enabled: true, generated: indexed, failed: 0, skipped: 0 },
    };
    const res = await handleIndexDocuments(
        new NextRequest('http://localhost/api/search-indexes/x/documents', {
            method: 'POST',
            body: JSON.stringify({ documents: Array.from({ length: indexed + failed }, (_, i) => ({ id: `d${i}` })), sourceFileName: 'upload.json' }),
        }),
        { params: Promise.resolve({ id: crypto.randomUUID() }) }
    );
    return { status: res.status, body: await res.json() };
}

describe('upload outcome in the response', () => {
    beforeEach(() => { state.recorded = []; });

    it('says an upload where nothing went in failed, as recorded on the index', async () => {
        const { status, body } = await upload(0, 2);
        expect(status).toBe(207);
        expect(body.data.outcome).toMatchObject({ status: 'failed', error: { code: 'INDEXING_FAILED' } });
        expect(state.recorded.at(-1)).toEqual(body.data.outcome);
    });

    it('says an upload with some documents rejected is partial', async () => {
        const { body } = await upload(1, 1);
        expect(body.data.outcome).toMatchObject({ status: 'partial', summary: '1 of 2 documents indexed from upload.json, 1 failed: No source field configured' });
    });

    it('says a clean upload succeeded', async () => {
        const { status, body } = await upload(2, 0);
        expect(status).toBe(200);
        expect(body.data.outcome).toMatchObject({ status: 'succeeded' });
        // The upload panel's notice relies on the message counting the embeddings
        expect(body.data.message).toBe('Successfully indexed 2 documents (2 embeddings generated)');
    });
});
