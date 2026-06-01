// src/features/knowledge-base/knowledge-base.service.ts

/**
 * Knowledge Base Service — Domain Knowledge Base (Sprint 6 / Phase E)
 *
 * Orchestrates document upload: receive text → chunk → embed → store.
 *
 * Chunking strategy:
 *   1. Split by double newlines (paragraph boundaries)
 *   2. Merge short paragraphs with the next (target ≥ MIN_CHUNK_CHARS)
 *   3. Split paragraphs that exceed MAX_CHUNK_CHARS at sentence boundaries
 *
 * This keeps chunks semantically coherent (paragraph-level) while bounding
 * their size so embeddings remain effective.
 */

import { createLogger } from '@/shared/logger/logger';
import { embedBatch } from '@/features/embedding/embedding.service';
import * as repository from './knowledge-base.repository';
import type { KnowledgeDocument, NewKnowledgeChunk } from '@/db/schema';

const logger = createLogger('knowledge-base-service');

// ============================================================================
// CONSTANTS
// ============================================================================

/** Minimum characters in a chunk before merging with the next */
const MIN_CHUNK_CHARS = 200;
/** Maximum characters per chunk before splitting further */
const MAX_CHUNK_CHARS = 1200;

// ============================================================================
// PUBLIC API
// ============================================================================

export interface UploadDocumentInput {
  dataSourceId: string;
  name: string;
  content: string;
  mimeType?: string;
}

export interface UploadDocumentResult {
  document: KnowledgeDocument;
  chunkCount: number;
  embeddedCount: number;
}

/**
 * Upload a document to a file_store data source.
 * Chunks the content, embeds each chunk, and persists everything.
 * The document status reflects the outcome: 'ready' or 'failed'.
 */
export async function uploadDocument(input: UploadDocumentInput): Promise<UploadDocumentResult> {
  const { dataSourceId, name, content, mimeType } = input;

  // 1. Create document record (status: pending)
  const document = await repository.createDocument({
    dataSourceId,
    name,
    mimeType: mimeType ?? null,
    sizeBytes: Buffer.byteLength(content, 'utf8'),
    status: 'processing',
  });

  try {
    // 2. Chunk the content
    const chunks = chunkText(content);

    if (chunks.length === 0) {
      await repository.updateDocumentStatus(document.id, 'failed', {
        errorMessage: 'Document produced no text chunks',
        processedAt: new Date(),
      });
      return { document: { ...document, status: 'failed' }, chunkCount: 0, embeddedCount: 0 };
    }

    // 3. Embed all chunks in one batch call
    const embeddings = await embedBatch(chunks, { feature: 'knowledge_base' } as any);

    // 4. Build chunk rows
    const chunkRows: NewKnowledgeChunk[] = chunks.map((text, i) => ({
      documentId: document.id,
      dataSourceId,
      chunkIndex: i,
      content: text,
      embedding: embeddings[i] as any ?? null,
    }));

    // 5. Persist chunks
    await repository.createChunks(chunkRows);

    const embeddedCount = embeddings.filter(Boolean).length;

    // 6. Mark document ready
    await repository.updateDocumentStatus(document.id, 'ready', {
      chunkCount: chunks.length,
      processedAt: new Date(),
    });

    logger.info('Document uploaded and processed', {
      documentId: document.id,
      dataSourceId,
      name,
      chunks: chunks.length,
      embedded: embeddedCount,
    });

    return {
      document: { ...document, status: 'ready', chunkCount: chunks.length },
      chunkCount: chunks.length,
      embeddedCount,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Document processing failed', error as Error, { documentId: document.id });

    await repository.updateDocumentStatus(document.id, 'failed', {
      errorMessage: message,
      processedAt: new Date(),
    }).catch(() => {
      // Non-fatal — status update failure shouldn't mask the original error
    });

    return { document: { ...document, status: 'failed' }, chunkCount: 0, embeddedCount: 0 };
  }
}

export async function listDocuments(dataSourceId: string): Promise<KnowledgeDocument[]> {
  return repository.listDocuments(dataSourceId);
}

export async function deleteDocument(documentId: string): Promise<void> {
  await repository.deleteDocument(documentId);
}

// ============================================================================
// CHUNKING
// ============================================================================

/**
 * Split document text into semantically coherent chunks.
 *
 * Algorithm:
 * 1. Split on paragraph boundaries (2+ newlines)
 * 2. Merge short paragraphs (< MIN_CHUNK_CHARS) into the next
 * 3. Split paragraphs that are too long (> MAX_CHUNK_CHARS) at sentence ends
 */
export function chunkText(text: string): string[] {
  const paragraphs = text
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(p => p.length > 0);

  // Merge short paragraphs with their successor
  const merged: string[] = [];
  let current = '';

  for (const para of paragraphs) {
    if (current.length === 0) {
      current = para;
    } else if (current.length < MIN_CHUNK_CHARS) {
      current = `${current}\n\n${para}`;
    } else {
      merged.push(current);
      current = para;
    }
  }
  if (current.length > 0) {
    merged.push(current);
  }

  // Split oversized chunks at sentence boundaries
  const chunks: string[] = [];
  for (const chunk of merged) {
    if (chunk.length <= MAX_CHUNK_CHARS) {
      chunks.push(chunk);
    } else {
      chunks.push(...splitLongChunk(chunk));
    }
  }

  return chunks.filter(c => c.trim().length > 0);
}

function splitLongChunk(text: string): string[] {
  // Split at sentence boundaries: '. ', '! ', '? '
  const sentences = text.split(/(?<=[.!?])\s+/);
  const parts: string[] = [];
  let current = '';

  for (const sentence of sentences) {
    if ((current + ' ' + sentence).trim().length > MAX_CHUNK_CHARS && current.length > 0) {
      parts.push(current.trim());
      current = sentence;
    } else {
      current = current ? `${current} ${sentence}` : sentence;
    }
  }
  if (current.trim().length > 0) {
    parts.push(current.trim());
  }

  return parts;
}
