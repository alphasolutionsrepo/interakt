// src/features/search/providers/elasticsearch/elasticsearch.client.create-delete.test.ts

/**
 * Creating or deleting an index Elasticsearch fails is passed on with its cause, not
 * logged here: the reindex, recreate, delete or upload it belongs to logs it once, with
 * its request id. Only the client is stubbed.
 */

import { errors as esErrors } from '@elastic/elasticsearch';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { reported, type LogLine } from '@/shared/test/log-recorder';

const es = vi.hoisted(() => ({ exists: false, error: undefined as unknown, pages: [] as Record<string, unknown>[], cleared: [] as string[] }));
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
        search = async () => { if (es.pages.length === 0) throw es.error; return es.pages.shift(); };
        scroll = async () => es.pages.shift();
        clearScroll = async ({ scroll_id }: { scroll_id: string }) => { es.cleared.push(scroll_id); };
    },
}));

import { createIndex, deleteIndex, fetchAllDocuments } from './elasticsearch.client';

beforeEach(() => {
    logs.length = 0;
    es.pages = [];
    es.cleared = [];
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

describe("an index whose documents Elasticsearch fails to give a reindex", () => {
    it('is passed on with its cause, not logged', async () => {
        es.exists = true;
        expect(await fetchAllDocuments('shop')).toEqual({ success: false, documents: [], error: 'connect ECONNREFUSED 127.0.0.1:9200', cause: es.error });
        expect(reported(logs)).toEqual([]);
    });
});

describe('an index Elasticsearch gives a reindex only part of', () => {
    const page = (ids: string[], extra: Record<string, unknown> = {}) => ({
        _scroll_id: 'scroll-1', timed_out: false, _shards: { total: 2, successful: 2, failed: 0 },
        hits: { hits: ids.map((id) => ({ _id: id, _source: { id } })) }, ...extra,
    });

    it('when a shard failed is a failed read, its scroll cleared', async () => {
        es.exists = true;
        es.pages = [page(['a'], { _shards: { total: 2, successful: 1, failed: 1 } })];

        const result = await fetchAllDocuments('shop');

        expect(result).toMatchObject({ success: false, documents: [], error: "Elasticsearch couldn't read 1 of the index's 2 shards" });
        expect(es.cleared).toEqual(['scroll-1']);
    });

    it('when a later page timed out is a failed read', async () => {
        es.exists = true;
        es.pages = [page(['a', 'b']), page(['c'], { timed_out: true })];

        expect(await fetchAllDocuments('shop')).toMatchObject({ success: false, documents: [], error: 'Elasticsearch timed out reading the documents and gave only some of them' });
    });

    it('in full is read whole', async () => {
        es.exists = true;
        es.pages = [page(['a', 'b']), page(['c']), page([])];

        const result = await fetchAllDocuments('shop');

        expect(result).toMatchObject({ success: true });
        expect(result.documents.map((d) => d._id)).toEqual(['a', 'b', 'c']);
    });
});
