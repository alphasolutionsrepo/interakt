// src/features/search-index/search-index.reindex-outcome.test.ts

/** How a reindex ended: some documents failing to write back is partial, with why */

import { errors as esErrors } from '@elastic/elasticsearch';
import { describe, expect, it } from 'vitest';

import { reindexOutcome, reindexWriteFailure } from './search-index.service';

const startedAt = '2026-11-02T10:00:00.000Z';

describe('reindexOutcome', () => {
    it('succeeds when every document was written back', () => {
        expect(reindexOutcome({ indexed: 7, failed: 0 }, startedAt)).toMatchObject({ kind: 'reindex', status: 'succeeded', summary: '7 documents reindexed' });
    });

    it('explains a partial reindex whose later batch failed as a whole, from that error', () => {
        const down = new esErrors.ConnectionError('', { body: null, statusCode: 0, headers: {}, meta: {}, warnings: null } as never);
        expect(reindexOutcome({ indexed: 5, failed: 2, reason: '', writeError: down }, startedAt)).toMatchObject({
            status: 'partial',
            summary: "5 of 7 documents reindexed, 2 failed: Elasticsearch couldn't be reached.",
        });
    });

    it('is partial when some documents failed, with how many and the first reason', () => {
        expect(reindexOutcome({ indexed: 5, failed: 2, reason: 'mapper_parsing_exception: failed to parse field [price]' }, startedAt)).toMatchObject({
            status: 'partial',
            summary: '5 of 7 documents reindexed, 2 failed: mapper_parsing_exception: failed to parse field [price]',
        });
    });
});

describe('a partial reindex a write block stopped', () => {
    it('says what to do about it', () => {
        expect(reindexOutcome({ indexed: 1, failed: 1, reason: 'index [products] blocked by: [FORBIDDEN/8/index write (api)];' }, startedAt)).toMatchObject({ status: 'partial', hint: expect.stringContaining('read-only') });
    });
});

describe('a reindex of an empty index', () => {
    it('says the index is empty and to upload its documents, in orange rather than as a success', () => {
        expect(reindexOutcome({ indexed: 0, failed: 0 }, startedAt)).toMatchObject({
            status: 'partial',
            summary: 'The index is empty: there was nothing to reindex. Upload its documents to fill it.',
        });
    });
});

describe('reindexWriteFailure', () => {
    it('fails a reindex where nothing could be written back, with what to do about a full disk', () => {
        const err = reindexWriteFailure({
            indexed: 0, failed: 7,
            reason: 'index [shop] blocked by: [TOO_MANY_REQUESTS/12/disk usage exceeded flood-stage watermark, index has read-only-allow-delete block];',
        });
        expect(err).toMatchObject({ code: 'REINDEX_FAILED', status: 502 });
        expect(err?.message).toMatch(/^None of the 7 documents could be written back: index \[shop\] blocked by/);
        expect(err?.hint).toMatch(/disk space/);
    });

    it('leaves a reindex that wrote something to the partial outcome', () => {
        expect(reindexWriteFailure({ indexed: 1, failed: 6 })).toBeUndefined();
        expect(reindexWriteFailure({ indexed: 0, failed: 0 })).toBeUndefined();
    });

    it('answers through the API with its own message and hint', async () => {
        const { apiResponse } = await import('@/shared/api/response');
        const body = await apiResponse.error(reindexWriteFailure({ indexed: 0, failed: 2, reason: 'index [shop] blocked by: [FORBIDDEN/8/index write (api)];' })).json();
        expect(body).toMatchObject({ code: 'REINDEX_FAILED', message: expect.stringMatching(/could be written back/) });
        expect(body.hint).toMatch(/read-only/);
    });
});

describe('a reindex that wrote nothing back', () => {
  it('says to upload the documents again, since another reindex finds the index empty', () => {
    const down = new esErrors.ConnectionError('', { body: null, statusCode: 0, headers: {}, meta: {}, warnings: null } as never);
    const err = reindexWriteFailure({ indexed: 0, failed: 3, writeError: down });
    expect(err?.hint).toMatch(/upload its documents again/);
    expect(err?.hint).not.toMatch(/try again/);
  });
});
