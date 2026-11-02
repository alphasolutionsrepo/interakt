// src/features/document-indexing/upload-outcome.ts

import type { indexDocuments } from './document-indexer.service';

import type { IndexLastJob } from '@/db/schema/search-index.schema';
import { currentRequestId } from '@/shared/api/request-id';
import { scrub } from '@/shared/errors/upstream';

/**
 * How an upload ended, for the index page and the Activity panel. Nothing indexed is
 * a failure, with the reason the indexer gave (index setup, mappings) or the first
 * document error; some documents failing is partial, with the first reason.
 */
export function uploadOutcome(
    result: Awaited<ReturnType<typeof indexDocuments>>,
    startedAt: string,
    sourceFileName?: string
): IndexLastJob {
    const from = sourceFileName ? ` from ${sourceFileName}` : '';
    const base = { kind: 'upload' as const, startedAt, finishedAt: new Date().toISOString() };
    const reason = result.errors[0]?.error;
    if (result.indexedDocuments > 0) {
        const indexed = `${result.indexedDocuments} of ${result.totalDocuments} documents indexed${from}`;
        if (result.failedDocuments === 0) return { ...base, status: 'succeeded', summary: indexed };
        return {
            ...base,
            status: 'partial',
            summary: scrub(`${indexed}, ${result.failedDocuments} failed${reason ? `: ${reason}` : ''}`),
        };
    }
    return {
        ...base,
        status: 'failed',
        error: {
            code: 'INDEXING_FAILED',
            message: scrub(result.totalDocuments > 0
                ? `None of the ${result.totalDocuments} documents${from} were indexed${reason ? `: ${reason}` : ''}`
                : reason ?? 'No documents were indexed'),
            requestId: currentRequestId(),
        },
    };
}
