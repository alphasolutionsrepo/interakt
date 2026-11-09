// src/features/search/providers/elasticsearch/elasticsearch.client.get-document.test.ts

/**
 * The document lookup the document API and merges call on a managed Elasticsearch index.
 * A document Elasticsearch doesn't have is a miss; a lookup it couldn't answer is a
 * failure with its cause, passed on for the caller to explain and log. Only the client
 * is stubbed.
 */

import { errors as esErrors } from '@elastic/elasticsearch';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { reported, type LogLine } from '@/shared/test/log-recorder';

const es = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('server-only', () => ({}));
const logs = vi.hoisted(() => [] as LogLine[]);
vi.mock('@/shared/logger/logger', async () => (await import('@/shared/test/log-recorder')).recordingLogger(logs));
vi.mock('@elastic/elasticsearch', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@elastic/elasticsearch')>()),
    Client: class {
        indices = { exists: async () => true };
        get = es.get;
    },
}));

import { getDocumentById } from './elasticsearch.client';

beforeEach(() => {
    logs.length = 0;
    es.get.mockReset();
});

describe('getDocumentById on Elasticsearch', () => {
    it('gives a document that is there', async () => {
        es.get.mockResolvedValueOnce({ found: true, _id: 'PROD-1', _source: { title: 'Linen shirt' } });
        expect(await getDocumentById('shop', 'PROD-1')).toEqual({ found: true, id: 'PROD-1', source: { title: 'Linen shirt' } });
    });

    it('answers a document that is not there as a miss', async () => {
        es.get.mockRejectedValueOnce(new esErrors.ResponseError({ body: { found: false }, statusCode: 404, headers: {}, meta: {} as never, warnings: null }));
        expect(await getDocumentById('shop', 'nope')).toEqual({ found: false });
    });

    it("answers a lookup Elasticsearch couldn't answer as a failure, with its cause, and leaves logging it to the caller", async () => {
        const down = new esErrors.ConnectionError('', { meta: {} } as never);
        es.get.mockRejectedValueOnce(down);

        expect(await getDocumentById('shop', 'PROD-1')).toMatchObject({ found: false, error: expect.any(String), cause: down });
        expect(reported(logs)).toEqual([]);
    });
});
