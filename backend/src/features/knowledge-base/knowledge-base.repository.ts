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
 * Words too common to discriminate between chunks. Matching on these returns most of the
 * corpus ranked by nothing, which is worse than returning less.
 */
const KEYWORD_STOP_WORDS = new Set([
  'a', 'about', 'all', 'an', 'and', 'any', 'are', 'as', 'at', 'be', 'been', 'but', 'by',
  'can', 'do', 'does', 'doing', 'for', 'from', 'get', 'has', 'have', 'how', 'i', 'if', 'in',
  'into', 'is', 'it', 'its', 'me', 'my', 'no', 'not', 'of', 'on', 'or', 'our', 'out', 'so',
  'some', 'that', 'the', 'their', 'them', 'then', 'there', 'these', 'they', 'this', 'to', 'up',
  'use', 'want', 'was', 'we', 'were', 'what', 'when', 'where', 'which', 'why', 'will', 'with',
  'would', 'you', 'your',
]);

/** Significant search terms from a natural-language question, longest first. */
export function keywordTermsFrom(query: string, max = 6): string[] {
  const seen = new Set<string>();
  return query
    .toLowerCase()
    .split(/[^a-z0-9-]+/i)
    .filter((w) => w.length > 2 && !KEYWORD_STOP_WORDS.has(w) && !seen.has(w) && seen.add(w))
    .sort((a, b) => b.length - a.length)
    .slice(0, max);
}

/**
 * Keyword search over knowledge chunks, ranked by how many query terms a chunk contains.
 *
 * This used to be `ILIKE '%<the entire query>%'`, which meant it could only ever fire when a
 * user typed a literal substring of a chunk. Against a question — "how do I stop my assistant
 * answering off-topic questions?" — it matched nothing, every time. So the "hybrid" search was
 * semantic-only in practice, and a question that scored just outside the vector cutoff
 * returned zero results even when the exact words were sitting in the corpus.
 *
 * Ranking by term-hit count keeps the failure mode sane: partial matches surface in a sensible
 * order rather than all-or-nothing.
 */
export async function keywordSearchChunks(
  dataSourceId: string,
  query: string,
  limit = 10,
): Promise<Array<KnowledgeChunk & { documentName: string }>> {
  const terms = keywordTermsFrom(query);
  if (terms.length === 0) return [];

  const matches = terms.map((t) => sql`(${knowledgeChunks.content} ILIKE ${'%' + t + '%'})`);
  const anyMatch = sql.join(matches, sql` OR `);
  // One point per distinct term present, so a chunk covering more of the question ranks above
  // one that happens to repeat a single word.
  const hitScore = sql.join(
    terms.map((t) => sql`(CASE WHEN ${knowledgeChunks.content} ILIKE ${'%' + t + '%'} THEN 1 ELSE 0 END)`),
    sql` + `,
  );

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
        sql`(${anyMatch})`,
      ),
    )
    .orderBy(sql`(${hitScore}) DESC`, asc(knowledgeChunks.chunkIndex))
    .limit(limit);

  return rows as Array<KnowledgeChunk & { documentName: string }>;
}
