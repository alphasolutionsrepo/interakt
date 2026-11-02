// src/features/document-indexing/document-indexing.upload-outcome.handler.test.ts

/**
 * The upload endpoint returns how the upload ended (outcome), the same value it keeps
 * on the index. The Activity panel trusts it: a 207 answer alone doesn't say whether
 * anything went in.
 */

import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ result: undefined as unknown, recorded: [] as unknown[], logged: [] as Array<{ level: string; context: Record<string, unknown> }> }));

vi.mock('@/shared/logger/logger', () => {
    const logger = {
        info: (_m: string, context: Record<string, unknown>) => state.logged.push({ level: 'info', context }),
        warn: (_m: string, context: Record<string, unknown>) => state.logged.push({ level: 'warn', context }),
        error: vi.fn(), debug: vi.fn(),
    };
    return { createLogger: () => logger, logger };
});

vi.mock('./document-actor', () => ({
    resolveDocumentActor: async () => ({ actor: { kind: 'user', userId: 'u1' } }),
    actorCan: () => true,
    actorLogContext: () => ({}),
    actorAuditColumns: () => ({ createdBy: 'u1' }),
}));
vi.mock('./document-indexer.service', () => ({
    indexDocuments: async () => { if (state.result instanceof Error) throw state.result; return state.result; },
    getIndexingProgress: vi.fn(),
    listBatches: vi.fn(),
    cancelBatch: vi.fn(),
}));
vi.mock('./document-writer.service', () => ({
    getDocument: vi.fn(), listDocuments: vi.fn(), writeDocuments: vi.fn(), deleteDocumentsByFilter: vi.fn(),
    SearchIndexNotFoundError: class extends Error {}, IndexNotProvisionedError: class extends Error {},
}));
vi.mock('@/features/search-index/search-index.service', async () => ({
    recordLastJob: async (_id: string, job: unknown) => { state.recorded.push(job); },
    // The real one: it gives the failure the id the response then shows
    jobError: (await vi.importActual<typeof import('@/features/search-index/search-index.service')>('@/features/search-index/search-index.service')).jobError,
}));

import { handleIndexDocuments } from './document-indexing.api.handlers';

function post() {
    return handleIndexDocuments(
        new NextRequest('http://localhost/api/search-indexes/x/documents', {
            method: 'POST',
            body: JSON.stringify({ documents: [{ id: 'd0' }], sourceFileName: 'upload.json' }),
        }),
        { params: Promise.resolve({ id: crypto.randomUUID() }) }
    );
}

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
    beforeEach(() => { state.recorded = []; state.logged = []; });

    it('says an upload where nothing went in failed, as recorded on the index', async () => {
        const { status, body } = await upload(0, 2);
        expect(status).toBe(207);
        expect(body.data.outcome).toMatchObject({ status: 'failed', error: { code: 'INDEXING_FAILED' } });
        expect(state.recorded.at(-1)).toEqual(body.data.outcome);
        // The id on the index page is on a warning log line, so support can find it
        expect(state.logged.at(-1)).toMatchObject({ level: 'warn', context: { requestId: body.data.outcome.error.requestId } });
    });

    it('says an upload with some documents rejected is partial', async () => {
        const { body } = await upload(1, 1);
        expect(body.data.outcome).toMatchObject({ status: 'partial', summary: '1 of 2 documents indexed from upload.json, 1 failed: No source field configured' });
        expect(state.logged.at(-1)?.level).toBe('warn');
    });

    it('says a clean upload succeeded', async () => {
        const { status, body } = await upload(2, 0);
        expect(status).toBe(200);
        expect(body.data.outcome).toMatchObject({ status: 'succeeded' });
        expect(state.logged.at(-1)?.level).toBe('info');
        // The upload panel's notice relies on the message counting the embeddings
        expect(body.data.message).toBe('Successfully indexed 2 documents (2 embeddings generated)');
    });

    it('answers a thrown upload failure with the id it recorded on the index', async () => {
        state.result = new Error('connect ECONNREFUSED 127.0.0.1:9200');
        const res = await post();
        const body = await res.json();
        expect(res.status).toBe(500);
        const recorded = state.recorded.at(-1) as { status: string; error: { requestId: string } };
        expect(recorded.status).toBe('failed');
        expect(recorded.error.requestId).toBe(body.requestId);
    });
});
