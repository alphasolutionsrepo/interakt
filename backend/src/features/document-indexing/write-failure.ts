// src/features/document-indexing/write-failure.ts

import type { DocumentWriteResult } from './document-writer.service';

import { currentRequestId } from '@/shared/api/request-id';
import { explainWriteFailure, scrub } from '@/shared/errors/upstream';

export interface WriteFailure {
    code: 'WRITE_FAILED';
    message: string;
    hint?: string;
    requestId: string;
}

/**
 * Why a document write wrote nothing, as uploads explain it: from the error when the
 * write failed as a whole (the search service couldn't be reached), otherwise from the
 * first document's error. Undefined when anything was written.
 */
export function writeFailure(result: DocumentWriteResult): WriteFailure | undefined {
    if (result.success || result.succeeded > 0) return undefined;
    const { reason, hint } = explainWriteFailure(result.writeError, result.errors[0]?.error);
    return {
        code: 'WRITE_FAILED',
        message: scrub(reason ?? 'No documents were written'),
        ...(hint && { hint }),
        requestId: currentRequestId(),
    };
}
