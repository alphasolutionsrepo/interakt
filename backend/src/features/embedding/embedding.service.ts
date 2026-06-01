// src/features/embedding/embedding.service.ts

/**
 * Shared Embedding Service
 *
 * Thin wrapper around the AI service's embedding functions that adds:
 * - Convenience methods for single text and batch embedding
 * - pgvector-based similarity search helpers
 * - Embed-on-write for session messages (async, non-blocking)
 *
 * This service does NOT own a table. It provides embedding + vector search
 * utilities that other features (sessions, knowledge, etc.) use with their
 * own tables and columns.
 */

import { sql, type SQL } from 'drizzle-orm';
import { generateEmbedding, generateEmbeddings } from '@/features/ai-service/ai-service.service';
import type { EmbeddingOptions } from '@/features/ai-service/ai-service.types';
import { createLogger } from '@/shared/logger/logger';

const logger = createLogger('embedding-service');

// ============================================================================
// EMBEDDING GENERATION
// ============================================================================

/**
 * Generate an embedding vector for a single text.
 * Returns null on failure (non-fatal for embed-on-write flows).
 */
export async function embed(
  text: string,
  options?: EmbeddingOptions,
): Promise<number[] | null> {
  if (!text.trim()) return null;

  try {
    return await generateEmbedding(text, {
      feature: 'embedding_service',
      ...options,
    });
  } catch (error) {
    logger.error('Failed to generate embedding', error as Error);
    return null;
  }
}

/**
 * Generate embedding vectors for multiple texts.
 * Returns null entries for texts that failed to embed.
 */
export async function embedBatch(
  texts: string[],
  options?: EmbeddingOptions,
): Promise<Array<number[] | null>> {
  if (texts.length === 0) return [];

  try {
    const result = await generateEmbeddings(texts, {
      feature: 'embedding_service',
      ...options,
    });
    // Map results back by index, filling nulls for any gaps
    const vectors: Array<number[] | null> = new Array(texts.length).fill(null);
    for (const entry of result.embeddings) {
      vectors[entry.index] = entry.vector;
    }
    return vectors;
  } catch (error) {
    logger.error('Failed to generate batch embeddings', error as Error);
    return new Array(texts.length).fill(null);
  }
}

// ============================================================================
// PGVECTOR SQL HELPERS
// ============================================================================

/**
 * Build a SQL fragment for cosine distance between a vector column and a query vector.
 * Lower distance = more similar. Use in ORDER BY for nearest-neighbor search.
 *
 * Uses the pgvector `<=>` operator (cosine distance).
 */
export function cosineDistanceSql(
  columnName: string,
  queryVector: number[],
): SQL {
  const vectorStr = `[${queryVector.join(',')}]`;
  return sql.raw(`${columnName} <=> '${vectorStr}'`);
}

/**
 * Build a SQL fragment that filters out rows where the cosine distance
 * exceeds a threshold. Use in WHERE for quality gating.
 */
export function withinDistanceSql(
  columnName: string,
  queryVector: number[],
  maxDistance: number,
): SQL {
  const vectorStr = `[${queryVector.join(',')}]`;
  return sql.raw(`${columnName} <=> '${vectorStr}' < ${maxDistance}`);
}

// ============================================================================
// TEXT PREPARATION
// ============================================================================

/**
 * Prepare a session message for embedding.
 * Prefixes the role so the embedding captures the speaker context.
 */
export function prepareMessageText(role: string, content: string): string {
  return `[${role}]: ${content}`;
}
