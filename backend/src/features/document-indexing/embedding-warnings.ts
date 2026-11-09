// src/features/document-indexing/embedding-warnings.ts

import { scrub } from '@/shared/errors/upstream';

/**
 * What to tell the user about documents that were indexed without an embedding: the
 * embedding model failed (with its reason), or the document had no text to embed.
 * These are the upload's only embedding notices; the upload panel shows them as they are.
 */
export function embeddingWarnings(
    stats: { failed: number; skipped: number },
    firstError?: string
): string[] {
    const warnings: string[] = [];
    if (stats.failed > 0) {
        const reason = firstError ? scrub(firstError.replace(/^Embedding failed:\s*/, '')) : '';
        warnings.push(`${stats.failed} documents indexed without embeddings: the embedding model failed${reason ? ` (${reason})` : ''}`);
    }
    if (stats.skipped > 0) {
        warnings.push(`${stats.skipped} documents indexed without embeddings (no vector source content)`);
    }
    return warnings;
}
