// src/features/search/providers/elasticsearch/elasticsearch.client.bulk-errors.test.ts

/**
 * A bulk request that fails as a whole (the cluster is down, the request timed out)
 * fails every document in it with the same text. The result keeps the error itself
 * too, so an upload or reindex can say what happened and what to do.
 */

import { errors as esErrors } from '@elastic/elasticsearch';
import { describe, expect, it, vi } from 'vitest';

import { reported, type LogLine } from '@/shared/test/log-recorder';

const bulk = vi.hoisted(() => ({ error: undefined as unknown }));
vi.mock('server-only', () => ({}));
const logs = vi.hoisted(() => [] as LogLine[]);
vi.mock('@/shared/logger/logger', async () => (await import('@/shared/test/log-recorder')).recordingLogger(logs));
vi.mock('@elastic/elasticsearch', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@elastic/elasticsearch')>()),
    Client: class {
        async bulk() { throw bulk.error; }
    },
}));

import { bulkWrite } from './elasticsearch.client';

describe('a bulk write that fails as a whole', () => {
    it('keeps the client error, alongside the per-document text', async () => {
        const clientError = new esErrors.ConnectionError('connect ECONNREFUSED 127.0.0.1:9200', { body: null, statusCode: 0, headers: {}, meta: {}, warnings: null } as never);
        bulk.error = clientError;

        const result = await bulkWrite('shop', [{ action: 'upload', _id: '1', document: { title: 'Linen shirt' } }]);

        expect(result).toMatchObject({ indexed: 0, failed: 1, writeError: clientError });
        expect(result.errors[0].error).toMatch(/ECONNREFUSED/);
        // The upload, reindex or write it belongs to logs it, with its request id
        expect(reported(logs)).toEqual([]);
    });

    it('gives each document a reason when the error has no message (Elasticsearch stopped)', async () => {
        bulk.error = new esErrors.ConnectionError('', { body: null, statusCode: 0, headers: {}, meta: {}, warnings: null } as never);

        const result = await bulkWrite('shop', [{ action: 'upload', _id: '1', document: { title: 'Linen shirt' } }]);

        expect(result.errors).toEqual([{ index: 0, error: 'ConnectionError' }]);
    });
});
