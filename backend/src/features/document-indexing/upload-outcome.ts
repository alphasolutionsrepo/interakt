// src/features/document-indexing/upload-outcome.ts

import type { indexDocuments } from './document-indexer.service';

import type { IndexLastJob } from '@/db/schema/search-index.schema';
import { currentRequestId } from '@/shared/api/request-id';
import { EMBEDDING_FIELD_NAME } from '@/shared/constants/search-index.constants';
import { explainWriteFailure, leadingReason, scrub } from '@/shared/errors/upstream';

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
    // Embedding errors are on documents that were still indexed (without a vector), so
    // they don't say why any document failed
    const reason = leadingReason(result.errors.filter((e) => e.field !== EMBEDDING_FIELD_NAME).map((e) => e.error));
    if (result.indexedDocuments > 0) {
        const indexed = `${result.indexedDocuments} of ${result.totalDocuments} documents indexed${from}`;
        if (result.failedDocuments === 0) return { ...base, status: 'succeeded', summary: indexed };
        // A batch that failed as a whole is explained from its error, as a failed upload is
        const { reason: why, hint } = explainWriteFailure(result.writeError, reason);
        return {
            ...base,
            status: 'partial',
            summary: scrub(`${indexed}, ${result.failedDocuments} failed${why ? `: ${why}` : ''}`),
            ...(hint && { hint }),
        };
    }
    // A write that failed as a whole is explained from its error (the search service
    // couldn't be reached, timed out); otherwise from the search service's text
    const { reason: because, hint } = explainWriteFailure(result.writeError, reason);
    return {
        ...base,
        status: 'failed',
        error: {
            code: 'INDEXING_FAILED',
            // What to do about it, when the search service's reason is one we recognise
            ...(hint && { hint }),
            message: scrub(result.totalDocuments > 0
                ? `None of the ${result.totalDocuments} documents${from} were indexed${because ? `: ${because}` : ''}`
                : because ?? 'No documents were indexed'),
            requestId: currentRequestId(),
        },
    };
}
