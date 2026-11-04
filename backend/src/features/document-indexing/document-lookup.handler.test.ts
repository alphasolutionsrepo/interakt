// src/features/document-indexing/document-lookup.handler.test.ts

/**
 * Reading, merging or deleting one document looks it up first. A lookup the search
 * engine couldn't answer is a failure, explained as one ("Elasticsearch couldn't be
 * reached."), not "Document not found"; a document that isn't there is still not found.
 * Through the real document writer: only storage and the engine are stubbed.
 */

import { errors as esErrors } from '@elastic/elasticsearch';
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
vi.mock('@/db/index', () => {
    const row = { id: 'idx', name: 'products', searchProvider: 'elasticsearch', searchType: 'lexical' };
    return { db: { select: () => ({ from: () => ({ where: () => ({ limit: async () => [row] }) }) }) } };
});
const lookup = vi.hoisted(() => ({ result: { found: false } as Record<string, unknown> }));
const provider = vi.hoisted(() => ({
    indexExists: async () => true,
    getDocumentById: vi.fn(async () => lookup.result),
    bulkWrite: vi.fn(async () => ({ indexed: 1, failed: 0, errors: [] })),
}));
vi.mock('@/features/search/providers', () => ({ getSearchEngineProvider: () => provider }));
vi.mock('@/features/search-index/search-index-fields.service', () => ({ getFieldsBySearchIndexId: async () => [{ fieldName: 'name', sourceFieldName: 'name', sourceFieldPath: 'name', fieldType: 'text' }] }));
vi.mock('@/features/search-index/search-index-fields.repository', () => ({ getVectorSourceFields: async () => [] }));
vi.mock('@/features/search-index/search-index.service', () => ({ recordLastJob: vi.fn(), jobError: vi.fn() }));

import { handleDeleteDocument, handleGetDocument, handleMergeDocument } from './document-indexing.api.handlers';

const ID = crypto.randomUUID();
const url = `http://localhost/api/search-indexes/${ID}/documents/d1`;
const params = { params: Promise.resolve({ id: ID, documentId: 'd1' }) };
const routes = [
    { name: 'reading', call: () => handleGetDocument(new NextRequest(url), params) },
    { name: 'merging', call: () => handleMergeDocument(new NextRequest(url, { method: 'PATCH', body: JSON.stringify({ document: { name: 'Linen' } }) }), params) },
    { name: 'deleting', call: () => handleDeleteDocument(new NextRequest(url, { method: 'DELETE' }), params) },
];

const unreachable = () => new esErrors.ConnectionError('', { meta: {} } as never);

beforeEach(() => {
    logs.length = 0;
});

describe.each(routes)('$name a document', ({ call }) => {
    it("when the engine couldn't be reached is a failure, explained, and logged once", async () => {
        const down = unreachable();
        lookup.result = { found: false, error: 'ConnectionError', cause: down };
        const res = await call();
        const body = await res.json();

        expect(res.status).toBe(503);
        expect(body).toMatchObject({ code: 'UPSTREAM_UNAVAILABLE', message: "Elasticsearch couldn't be reached." });
        expect(reported(logs)).toEqual([expect.objectContaining({ level: 'error', context: expect.objectContaining({ requestId: body.requestId }) })]);
    });

    it('that is not there is still not found', async () => {
        lookup.result = { found: false };
        const res = await call();
        expect(res.status).toBe(404);
    });
});
