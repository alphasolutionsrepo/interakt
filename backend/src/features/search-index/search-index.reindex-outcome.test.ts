// src/features/search-index/search-index.reindex-outcome.test.ts

/** How a reindex ended: some documents failing to write back is partial, with why */

import { describe, expect, it } from 'vitest';

import { reindexOutcome } from './search-index.service';

const startedAt = '2026-11-02T10:00:00.000Z';

describe('reindexOutcome', () => {
    it('succeeds when every document was written back', () => {
        expect(reindexOutcome({ indexed: 7, failed: 0 }, startedAt)).toMatchObject({ kind: 'reindex', status: 'succeeded', summary: '7 documents reindexed' });
    });

    it('is partial when some documents failed, with how many and the first reason', () => {
        expect(reindexOutcome({ indexed: 5, failed: 2, firstError: 'mapper_parsing_exception: failed to parse field [price]' }, startedAt)).toMatchObject({
            status: 'partial',
            summary: '5 of 7 documents reindexed, 2 failed: mapper_parsing_exception: failed to parse field [price]',
        });
    });
});
