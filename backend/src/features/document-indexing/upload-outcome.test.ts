// src/features/document-indexing/upload-outcome.test.ts

/** How an upload ended: nothing indexed failed, some documents rejected partial, all in succeeded */

import { errors as esErrors } from '@elastic/elasticsearch';
import { describe, expect, it } from 'vitest';

import { uploadOutcome } from './upload-outcome';

type Result = Parameters<typeof uploadOutcome>[0];

function result(indexed: number, failed: number, errors: string[] = []): Result {
    return {
        totalDocuments: indexed + failed,
        indexedDocuments: indexed,
        failedDocuments: failed,
        errors: errors.map((error, documentIndex) => ({ documentIndex, error })),
    } as unknown as Result;
}

const startedAt = '2026-11-02T10:00:00.000Z';

describe('uploadOutcome', () => {
    it('fails when nothing was indexed, with the reason', () => {
        const outcome = uploadOutcome(result(0, 2, ['No source field configured']), startedAt, 'upload.json');
        expect(outcome).toMatchObject({
            kind: 'upload',
            status: 'failed',
            error: { code: 'INDEXING_FAILED', message: 'None of the 2 documents from upload.json were indexed: No source field configured' },
        });
    });

    it('says what to do when the search service refused the writes (a full disk)', () => {
        const outcome = uploadOutcome(result(0, 1, ['index [shop] blocked by: [TOO_MANY_REQUESTS/12/disk usage exceeded flood-stage watermark, index has read-only-allow-delete block];']), startedAt);
        expect(outcome.error?.hint).toMatch(/disk space/);
    });

    it('says what to do about a full disk even when another document failed first, for another reason', () => {
        const full = 'index [shop] blocked by: [TOO_MANY_REQUESTS/12/disk usage exceeded flood-stage watermark, index has read-only-allow-delete block];';
        const outcome = uploadOutcome(result(0, 3, ['Required field "sku" has no value', full, full]), startedAt);
        expect(outcome.error?.hint).toMatch(/disk space/);
        expect(outcome.error?.message).toContain('flood-stage');
    });

    it('explains a write that failed as a whole, from the error itself (the cluster is down)', () => {
        const down = new esErrors.ConnectionError('', { body: null, statusCode: 0, headers: {}, meta: {}, warnings: null } as never);
        const outcome = uploadOutcome({ ...result(0, 2, ['', '']), writeError: down }, startedAt, 'upload.json');
        expect(outcome).toMatchObject({
            status: 'failed',
            error: { code: 'INDEXING_FAILED', message: "None of the 2 documents from upload.json were indexed: Elasticsearch couldn't be reached." },
        });
        expect(outcome.error?.hint).toMatch(/running/);
    });

    it("gives no search-service hint for our own field mapping problems", () => {
        expect(uploadOutcome(result(0, 2, ['No source field configured']), startedAt).error?.hint).toBeUndefined();
        expect(uploadOutcome(result(0, 1, ['Invalid field mapping for "price"']), startedAt).error?.hint).toBeUndefined();
    });

    it('leaves out an empty reason', () => {
        expect(uploadOutcome(result(0, 1, ['']), startedAt).error?.message).toBe('None of the 1 documents were indexed');
    });

    it('is partial when some documents failed, with how many and why', () => {
        const outcome = uploadOutcome(result(1, 1, ['Required field has no value']), startedAt, 'upload.json');
        expect(outcome).toMatchObject({
            status: 'partial',
            summary: '1 of 2 documents indexed from upload.json, 1 failed: Required field has no value',
        });
        expect(outcome.error).toBeUndefined();
    });

    it('gives the reason a document failed, not an embedding problem on one that went in', () => {
        const r = result(1, 1);
        (r as unknown as { errors: unknown[] }).errors = [
            { documentIndex: 0, error: 'Embedding failed: rate limited', field: 'content_embedding' },
            { documentIndex: 1, error: 'Required field has no value', field: 'uniqueId' },
        ];
        expect(uploadOutcome(r, startedAt).summary).toBe('1 of 2 documents indexed, 1 failed: Required field has no value');
    });

    it('gives no reason when only embeddings failed', () => {
        const r = result(1, 1);
        (r as unknown as { errors: unknown[] }).errors = [{ documentIndex: 0, error: 'Embedding failed: rate limited', field: 'content_embedding' }];
        expect(uploadOutcome(r, startedAt).summary).toBe('1 of 2 documents indexed, 1 failed');
    });

    it('succeeds when every document went in', () => {
        expect(uploadOutcome(result(2, 0), startedAt)).toMatchObject({ status: 'succeeded', summary: '2 of 2 documents indexed' });
    });
});
