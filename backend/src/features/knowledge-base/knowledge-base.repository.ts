// src/features/knowledge-base/knowledge-base.repository.ts

/**
 * Knowledge Base Repository — Domain Knowledge Base (Sprint 6 / Phase E)
 *
 * CRUD + semantic retrieval for knowledge documents and chunks.
 * All queries are scoped to dataSourceId.
 */

import { eq, and, desc, asc, sql } from 'drizzle-orm';
import { db } from '@/db/index';
import { knowledgeDocuments, knowledgeChunks } from '@/db/schema';
import type { KnowledgeDocument, NewKnowledgeDocument, KnowledgeChunk, NewKnowledgeChunk } from '@/db/schema';
import { cosineDistanceSql, withinDistanceSql } from '@/features/embedding/embedding.service';
import { createLogger } from '@/shared/logger/logger';

const logger = createLogger('knowledge-base-repository');

// ============================================================================
// DOCUMENT OPERATIONS
// ============================================================================

export async function createDocument(data: NewKnowledgeDocument): Promise<KnowledgeDocument> {
  const [doc] = await db.insert(knowledgeDocuments).values(data).returning();
  return doc;
}

export async function getDocumentById(id: string): Promise<KnowledgeDocument | null> {
  const [doc] = await db
    .select()
    .from(knowledgeDocuments)
    .where(eq(knowledgeDocuments.id, id));
  return doc ?? null;
}

export async function listDocuments(dataSourceId: string): Promise<KnowledgeDocument[]> {
  return db
    .select()
    .from(knowledgeDocuments)
    .where(eq(knowledgeDocuments.dataSourceId, dataSourceId))
    .orderBy(desc(knowledgeDocuments.createdAt));
}

export async function updateDocumentStatus(
  id: string,
  status: 'pending' | 'processing' | 'ready' | 'failed',
  opts?: { chunkCount?: number; errorMessage?: string; processedAt?: Date },
): Promise<void> {
  await db
    .update(knowledgeDocuments)
    .set({
      status,
      ...(opts?.chunkCount !== undefined ? { chunkCount: opts.chunkCount } : {}),
      ...(opts?.errorMessage !== undefined ? { errorMessage: opts.errorMessage } : {}),
      ...(opts?.processedAt !== undefined ? { processedAt: opts.processedAt } : {}),
    })
    .where(eq(knowledgeDocuments.id, id));
}

export async function deleteDocument(id: string): Promise<void> {
  // Chunks cascade-delete via FK
  await db.delete(knowledgeDocuments).where(eq(knowledgeDocuments.id, id));
}

// ============================================================================
// CHUNK OPERATIONS
// ============================================================================

export async function createChunks(chunks: NewKnowledgeChunk[]): Promise<void> {
  if (chunks.length === 0) return;
  // Insert in batches of 100 to avoid parameter limits
  const BATCH = 100;
  for (let i = 0; i < chunks.length; i += BATCH) {
    await db.insert(knowledgeChunks).values(chunks.slice(i, i + BATCH));
  }
}

export async function getChunkById(id: string): Promise<KnowledgeChunk | null> {
  const [chunk] = await db
    .select()
    .from(knowledgeChunks)
    .where(eq(knowledgeChunks.id, id));
  return chunk ?? null;
}

/**
 * Semantic search over knowledge chunks for a data source.
 * Returns chunks ordered by cosine similarity (closest first).
 * Falls back gracefully to an empty array if pgvector is unavailable.
 *
 * @param dataSourceId  Scope the search to a specific file_store data source
 * @param queryVector   Embedding of the query text
 * @param limit         Max chunks to return (default 10)
 * @param maxDistance   Cosine distance cutoff (default 0.45)
 */
export async function searchChunks(
  dataSourceId: string,
  queryVector: number[],
  limit = 10,
  maxDistance = 0.45,
): Promise<Array<KnowledgeChunk & { documentName: string }>> {
  try {
    const distanceExpr = cosineDistanceSql('knowledge_chunks.embedding', queryVector);
    const withinExpr = withinDistanceSql('knowledge_chunks.embedding', queryVector, maxDistance);

    const rows = await db
      .select({
        id: knowledgeChunks.id,
        documentId: knowledgeChunks.documentId,
        dataSourceId: knowledgeChunks.dataSourceId,
        chunkIndex: knowledgeChunks.chunkIndex,
        content: knowledgeChunks.content,
        embedding: knowledgeChunks.embedding,
        createdAt: knowledgeChunks.createdAt,
        documentName: knowledgeDocuments.name,
      })
      .from(knowledgeChunks)
      .innerJoin(knowledgeDocuments, eq(knowledgeChunks.documentId, knowledgeDocuments.id))
      .where(
        and(
          eq(knowledgeChunks.dataSourceId, dataSourceId),
          eq(knowledgeDocuments.status, 'ready'),
          sql`${knowledgeChunks.embedding} IS NOT NULL`,
          withinExpr,
        ),
      )
      .orderBy(asc(distanceExpr))
      .limit(limit);

    return rows as Array<KnowledgeChunk & { documentName: string }>;
  } catch (error) {
    logger.error('Vector search failed for knowledge chunks', error as Error, { dataSourceId });
    return [];
  }
}

/**
 * Keyword fallback search over knowledge chunks.
 * Used when the query vector is unavailable or as a complement to semantic search.
 */
export async function keywordSearchChunks(
  dataSourceId: string,
  query: string,
  limit = 10,
): Promise<Array<KnowledgeChunk & { documentName: string }>> {
  const rows = await db
    .select({
      id: knowledgeChunks.id,
      documentId: knowledgeChunks.documentId,
      dataSourceId: knowledgeChunks.dataSourceId,
      chunkIndex: knowledgeChunks.chunkIndex,
      content: knowledgeChunks.content,
      embedding: knowledgeChunks.embedding,
      createdAt: knowledgeChunks.createdAt,
      documentName: knowledgeDocuments.name,
    })
    .from(knowledgeChunks)
    .innerJoin(knowledgeDocuments, eq(knowledgeChunks.documentId, knowledgeDocuments.id))
    .where(
      and(
        eq(knowledgeChunks.dataSourceId, dataSourceId),
        eq(knowledgeDocuments.status, 'ready'),
        sql`${knowledgeChunks.content} ILIKE ${'%' + query + '%'}`,
      ),
    )
    .orderBy(asc(knowledgeChunks.chunkIndex))
    .limit(limit);

  return rows as Array<KnowledgeChunk & { documentName: string }>;
}
