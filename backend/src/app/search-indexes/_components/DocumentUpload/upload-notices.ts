// src/app/search-indexes/_components/DocumentUpload/upload-notices.ts

/**
 * What the upload panel shows when an upload ends. A failed or partial upload gets its
 * notice from the Activity panel (the job outcome), so here it only gets a warning when
 * no embeddings were made; the good news of a clean upload is the panel's own.
 */

import type { IndexDocumentsResponse, IndexingStatusResponse } from '../../_lib/api-client';

export type UploadProgressState = IndexingStatusResponse['status'] | 'partial';

/** The progress card's state: finished with some documents rejected is partial (orange) */
export function uploadProgressState(status: Pick<IndexingStatusResponse, 'status' | 'progress'>): UploadProgressState {
    return status.status === 'completed' && status.progress.failed > 0 ? 'partial' : status.status;
}

export type UploadNotice =
    | { kind: 'success'; message: string; description?: string }
    | { kind: 'warning'; message: string };

export function uploadNotice(result: Pick<IndexDocumentsResponse, 'success' | 'message' | 'embeddingStats'>): UploadNotice | undefined {
    const stats = result.embeddingStats?.enabled ? result.embeddingStats : undefined;
    // The server's message already counts the embeddings made; only problems are added
    const problem = !stats
        ? undefined
        : stats.failed > 0
            ? `⚠️ Embeddings failed for ${stats.failed} documents: they are indexed without one`
            : stats.generated === 0 && stats.skipped > 0
                ? `⚠️ No embeddings generated (${stats.skipped} skipped)`
                : undefined;

    if (!result.success) return problem ? { kind: 'warning', message: problem } : undefined;
    return {
        kind: 'success',
        message: problem ? `${result.message}\n${problem}` : result.message,
        description: stats ? `Embeddings: ${stats.generated} generated, ${stats.skipped} skipped` : undefined,
    };
}
