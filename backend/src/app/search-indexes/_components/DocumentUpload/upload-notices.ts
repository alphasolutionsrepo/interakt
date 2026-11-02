// src/app/search-indexes/_components/DocumentUpload/upload-notices.ts

/**
 * What the upload panel shows when an upload ends. A failed or partial upload gets its
 * notice from the Activity panel (the job outcome); the good news of a clean upload is
 * the panel's own.
 */

import type { IndexDocumentsResponse, IndexingStatusResponse } from '../../_lib/api-client';

export type UploadProgressState = IndexingStatusResponse['status'] | 'partial';

/** The progress card's state: finished with some documents rejected is partial (orange) */
export function uploadProgressState(status: Pick<IndexingStatusResponse, 'status' | 'progress'>): UploadProgressState {
    return status.status === 'completed' && status.progress.failed > 0 ? 'partial' : status.status;
}

export interface UploadNotice {
    message: string;
    description?: string;
}

/**
 * The notice for a clean upload. Embedding problems come from the server as warnings
 * (embedding-warnings.ts), and a failed or partial upload from the Activity panel.
 */
export function uploadNotice(result: Pick<IndexDocumentsResponse, 'success' | 'message' | 'embeddingStats'>): UploadNotice | undefined {
    if (!result.success) return undefined;
    const stats = result.embeddingStats?.enabled ? result.embeddingStats : undefined;
    const failed = stats && stats.failed > 0 ? `, ${stats.failed} failed` : '';
    return {
        // The server's message already counts the embeddings made
        message: result.message,
        description: stats ? `Embeddings: ${stats.generated} generated${failed}, ${stats.skipped} skipped` : undefined,
    };
}
