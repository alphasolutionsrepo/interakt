// src/features/document-indexing/upload-outcome.test.ts

/** How an upload ended: nothing indexed failed, some documents rejected partial, all in succeeded */

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

    it('succeeds when every document went in', () => {
        expect(uploadOutcome(result(2, 0), startedAt)).toMatchObject({ status: 'succeeded', summary: '2 of 2 documents indexed' });
    });
});
