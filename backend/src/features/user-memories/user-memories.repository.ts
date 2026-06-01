// src/features/user-memories/user-memories.repository.ts

/**
 * User Memories Repository — Episodic Memory (Sprint 5 / Phase D)
 *
 * CRUD + semantic retrieval for cross-session user facts.
 *
 * All queries are scoped to (userId, aiExperienceId) — memories never
 * leak across users or experiences.
 */

import { eq, and, desc, asc, sql } from 'drizzle-orm';
import { db } from '@/db/index';
import { userMemories } from '@/db/schema';
import type { UserMemory, NewUserMemory } from '@/db/schema';
import { cosineDistanceSql, withinDistanceSql } from '@/features/embedding/embedding.service';
import { createLogger } from '@/shared/logger/logger';

const logger = createLogger('user-memories-repository');

// ============================================================================
// WRITE OPERATIONS
// ============================================================================

/**
 * Insert a new memory fact for a user.
 * The caller is responsible for generating the embedding before calling this.
 */
export async function createMemory(data: NewUserMemory): Promise<UserMemory> {
  const [created] = await db.insert(userMemories).values(data).returning();
  return created;
}

/**
 * Bulk-insert extracted memory facts (post-session extraction pass).
 * Returns the created records.
 */
export async function createMemories(data: NewUserMemory[]): Promise<UserMemory[]> {
  if (data.length === 0) return [];
  return db.insert(userMemories).values(data).returning();
}

/**
 * Update the embedding for a memory (async backfill if embedding was deferred).
 */
export async function updateMemoryEmbedding(
  id: string,
  embedding: number[],
): Promise<void> {
  await db
    .update(userMemories)
    .set({ embedding: embedding as any })
    .where(eq(userMemories.id, id));
}

/**
 * Delete a specific memory by ID.
 * Used by the admin "forget" UI.
 */
export async function deleteMemory(id: string): Promise<void> {
  await db.delete(userMemories).where(eq(userMemories.id, id));
}

/**
 * Delete all memories for a user within an experience.
 * Used when a user requests full data deletion.
 */
export async function deleteAllMemories(
  userId: string,
  aiExperienceId: string,
): Promise<void> {
  await db
    .delete(userMemories)
    .where(
      and(
        eq(userMemories.userId, userId),
        eq(userMemories.aiExperienceId, aiExperienceId),
      ),
    );
}

// ============================================================================
// READ OPERATIONS
// ============================================================================

/**
 * List all memories for a user in an experience, newest first.
 * Used by the admin "what does the AI know about me?" UI.
 */
export async function listMemories(
  userId: string,
  aiExperienceId: string,
): Promise<UserMemory[]> {
  return db
    .select()
    .from(userMemories)
    .where(
      and(
        eq(userMemories.userId, userId),
        eq(userMemories.aiExperienceId, aiExperienceId),
      ),
    )
    .orderBy(desc(userMemories.createdAt));
}

/**
 * Semantic retrieval — find the top-K most relevant memories for a query vector.
 * Returns memories ordered by cosine similarity (closest first).
 * Memories without an embedding are excluded.
 *
 * @param userId          External user identifier
 * @param aiExperienceId  Experience scope
 * @param queryVector     Embedding of the current user message
 * @param limit           Max memories to return (default 5)
 * @param maxDistance     Cosine distance threshold — memories further than this
 *                        are excluded (default 0.45, same as memory-retrieval tool)
 */
export async function searchMemories(
  userId: string,
  aiExperienceId: string,
  queryVector: number[],
  limit = 5,
  maxDistance = 0.45,
): Promise<UserMemory[]> {
  try {
    const distanceExpr = cosineDistanceSql('user_memories.embedding', queryVector);
    const withinExpr = withinDistanceSql('user_memories.embedding', queryVector, maxDistance);

    const rows = await db
      .select()
      .from(userMemories)
      .where(
        and(
          eq(userMemories.userId, userId),
          eq(userMemories.aiExperienceId, aiExperienceId),
          sql`${userMemories.embedding} IS NOT NULL`,
          withinExpr,
        ),
      )
      .orderBy(asc(distanceExpr))
      .limit(limit);

    return rows;
  } catch (error) {
    logger.error('Vector search failed for user memories — skipping', error as Error, {
      userId,
      aiExperienceId,
    });
    return [];
  }
}

/**
 * Increment retrievalCount and set lastRetrievedAt for a set of memories.
 * Called after memories are injected into the pipeline context.
 * Fire-and-forget — failures are logged but not surfaced.
 */
export async function recordRetrievals(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  try {
    await db
      .update(userMemories)
      .set({
        retrievalCount: sql`${userMemories.retrievalCount} + 1`,
        lastRetrievedAt: sql`now()`,
      })
      .where(sql`${userMemories.id} = ANY(ARRAY[${sql.join(ids.map(id => sql`${id}::uuid`), sql`, `)}])`);
  } catch (error) {
    logger.error('Failed to record memory retrievals', error as Error);
  }
}
