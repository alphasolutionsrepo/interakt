// src/features/document-indexing/document-indexing.upload-logging.handler.test.ts

/**
 * A failed upload is logged once, by the handler, with the error and the id the index
 * page shows. The indexer passes on what went wrong (a thrown error, a write that failed
 * as a whole, documents left without embeddings) and the answer explains it.
 * Through the real indexer: only storage, the engine and the embedding model are stubbed.
 */

import { errors as esErrors } from '@elastic/elasticsearch';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { handleIndexDocuments } from './document-indexing.api.handlers';

import { reported, type LogLine } from '@/shared/test/log-recorder';

const logs = vi.hoisted(() => [] as LogLine[]);
vi.mock('@/shared/logger/logger', async () => (await import('@/shared/test/log-recorder')).recordingLogger(logs));
vi.mock('./document-actor', () => ({
    resolveDocumentActor: async () => ({ actor: { kind: 'user', userId: 'u1' } }),
    actorCan: () => true,
    actorLogContext: () => ({}),
    actorAuditColumns: () => ({ createdBy: 'u1' }),
}));
const row = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock('@/db/index', () => ({
    db: {
        select: () => ({ from: () => ({ where: () => ({ limit: async () => [row.value] }) }) }),
        insert: () => ({ values: () => ({ returning: async () => [{ id: 'b1' }] }) }),
        update: () => ({ set: () => ({ where: async () => undefined }) }),
    },
}));
const provider = vi.hoisted(() => ({
    indexExists: vi.fn(async () => true),
    getIndexMapping: vi.fn(async () => ({ success: true, embeddingDimensions: 3 })),
    bulkIndex: vi.fn(async (): Promise<Record<string, unknown>> => ({ indexed: 1, failed: 0, errors: [] })),
    getIndexStats: vi.fn(async () => null),
}));
vi.mock('@/features/search/providers', () => ({ getSearchEngineProvider: () => provider }));
vi.mock('@/features/search-index/search-index-fields.service', () => ({ getFieldsBySearchIndexId: async () => [{ fieldName: 'name', sourceFieldName: 'name', sourceFieldPath: 'name', fieldType: 'text', isVectorSource: true }] }));
vi.mock('@/features/search-index/search-index-fields.repository', () => ({ getVectorSourceFields: async () => [{ fieldName: 'name', sourceFieldPath: 'name' }] }));
const embed = vi.hoisted(() => ({ fail: undefined as Error | undefined }));
vi.mock('@/features/ai-service', () => ({
    generateEmbeddings: vi.fn(async (texts: string[]) => {
        if (embed.fail) throw embed.fail;
        return { embeddings: texts.map(() => [0.1, 0.2, 0.3]) };
    }),
}));
const recorded = vi.hoisted(() => [] as Array<Record<string, unknown>>);
vi.mock('@/features/search-index/search-index.service', async () => ({
    recordLastJob: async (_id: string, job: Record<string, unknown>) => { recorded.push(job); },
    jobError: (await vi.importActual<typeof import('@/features/search-index/search-index.service')>('@/features/search-index/search-index.service')).jobError,
}));


const lexical = { id: 'idx', name: 'products', searchProvider: 'elasticsearch', searchType: 'lexical', documentCount: 0 };
const hybrid = { ...lexical, searchType: 'hybrid', aiProviderId: 'p1', aiModelId: 1, embeddingDimensions: 3 };

async function upload() {
    const res = await handleIndexDocuments(
        new NextRequest('http://localhost/api/search-indexes/x/documents', {
            method: 'POST',
            body: JSON.stringify({ documents: [{ id: 'd0', name: 'Linen shirt' }], sourceFileName: 'upload.json' }),
        }),
        { params: Promise.resolve({ id: crypto.randomUUID() }) }
    );
    return { status: res.status, body: await res.json() };
}

const unreachable = () => new esErrors.ConnectionError('connect ECONNREFUSED 127.0.0.1:9200', { meta: {} } as never);

beforeEach(() => {
    logs.length = 0;
    recorded.length = 0;
    row.value = lexical;
    embed.fail = undefined;
    provider.indexExists.mockReset().mockResolvedValue(true);
    provider.bulkIndex.mockReset().mockResolvedValue({ indexed: 1, failed: 0, errors: [] });
});

describe('a failed upload', () => {
    it('that threw because the search service is down is logged once, as an error, with the error and the id the index page shows', async () => {
        const down = unreachable();
        provider.indexExists.mockRejectedValueOnce(down);
        const { body } = await upload();

        expect(body.data.outcome).toMatchObject({ status: 'failed', error: { message: expect.stringContaining("couldn't be reached") } });
        expect(reported(logs)).toEqual([
            expect.objectContaining({ level: 'error', context: expect.objectContaining({ err: down, requestId: body.data.outcome.error.requestId }) }),
        ]);
    });

    it('whose write failed as a whole is explained from that error, and logged once with it, as an error', async () => {
        const down = unreachable();
        provider.bulkIndex.mockResolvedValueOnce({ indexed: 0, failed: 1, errors: [{ index: 0, id: 'd0', error: 'ConnectionError' }], writeError: down });
        const { body } = await upload();

        expect(body.data.outcome).toMatchObject({ status: 'failed', error: { message: expect.stringContaining("Elasticsearch couldn't be reached") } });
        expect(reported(logs)).toEqual([
            expect.objectContaining({ level: 'error', context: expect.objectContaining({ err: down, requestId: body.data.outcome.error.requestId }) }),
        ]);
    });
});

describe('an upload that threw something unexpected (a bug)', () => {
    it('is logged once, as an error, with the error', async () => {
        const bug = new TypeError("Cannot read properties of undefined (reading 'map')");
        provider.indexExists.mockRejectedValueOnce(bug);
        await upload();

        expect(reported(logs)).toEqual([expect.objectContaining({ level: 'error', context: expect.objectContaining({ err: bug }) })]);
    });
});

describe('an upload the search service refused document by document', () => {
    it('is logged once, as a warning, with the first reason', async () => {
        provider.bulkIndex.mockResolvedValueOnce({ indexed: 0, failed: 1, errors: [{ index: 0, id: 'd0', error: 'mapper_parsing_exception: failed to parse field [price]' }] });
        await upload();

        expect(reported(logs)).toEqual([
            expect.objectContaining({ level: 'warn', context: expect.objectContaining({ firstError: expect.stringContaining('mapper_parsing_exception') }) }),
        ]);
    });
});

describe('an upload whose embedding model failed and whose document was refused', () => {
    it("gives the refusal as the first reason, not the embedding's", async () => {
        row.value = hybrid;
        embed.fail = new Error('model "nomic-embed-text" not found');
        provider.bulkIndex.mockResolvedValueOnce({ indexed: 0, failed: 1, errors: [{ index: 0, id: 'd0', error: 'mapper_parsing_exception: failed to parse field [price]' }] });
        await upload();

        expect(reported(logs).at(-1)?.context).toMatchObject({ firstError: expect.stringContaining('mapper_parsing_exception') });
    });
});

describe('an upload whose embedding model failed', () => {
    it('says the documents went in without embeddings, and why', async () => {
        row.value = hybrid;
        embed.fail = new Error('model "nomic-embed-text" not found');
        const { body } = await upload();

        expect(body.data.outcome).toMatchObject({ status: 'succeeded' });
        expect(body.data.warnings).toEqual([expect.stringContaining('the embedding model failed (model "nomic-embed-text" not found)')]);
    });
});
