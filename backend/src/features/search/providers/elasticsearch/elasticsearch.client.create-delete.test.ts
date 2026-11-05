// src/features/search/providers/elasticsearch/elasticsearch.client.create-delete.test.ts

/**
 * Creating or deleting an index Elasticsearch fails is passed on with its cause, not
 * logged here: the reindex, recreate, delete or upload it belongs to logs it once, with
 * its request id. Only the client is stubbed.
 */

import { errors as esErrors } from '@elastic/elasticsearch';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { reported, type LogLine } from '@/shared/test/log-recorder';

const es = vi.hoisted(() => ({ exists: false, error: undefined as unknown }));
vi.mock('server-only', () => ({}));
const logs = vi.hoisted(() => [] as LogLine[]);
vi.mock('@/shared/logger/logger', async () => (await import('@/shared/test/log-recorder')).recordingLogger(logs));
vi.mock('@elastic/elasticsearch', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@elastic/elasticsearch')>()),
    Client: class {
        indices = {
            exists: async () => es.exists,
            create: async () => { throw es.error; },
            delete: async () => { throw es.error; },
        };
    },
}));

import { createIndex, deleteIndex } from './elasticsearch.client';

beforeEach(() => {
    logs.length = 0;
    es.error = new esErrors.ConnectionError('connect ECONNREFUSED 127.0.0.1:9200', { meta: {} } as never);
});

describe('an index Elasticsearch fails', () => {
    it('to create is passed on with its cause, not logged', async () => {
        es.exists = false;
        expect(await createIndex('shop')).toEqual({ success: false, error: 'connect ECONNREFUSED 127.0.0.1:9200', cause: es.error });
        expect(reported(logs)).toEqual([]);
    });

    it('to delete is passed on with its cause, not logged', async () => {
        es.exists = true;
        expect(await deleteIndex('shop')).toEqual({ success: false, error: 'connect ECONNREFUSED 127.0.0.1:9200', cause: es.error });
        expect(reported(logs)).toEqual([]);
    });
});
