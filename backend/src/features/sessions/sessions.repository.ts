// src/features/sessions/sessions.repository.ts

import { eq, and, desc, asc, lt, count, sql } from 'drizzle-orm';
import { aiSessions, aiSessionMessages } from '@/db/schema';
import { db } from '@/db/index';
import { createLogger } from '@/shared/logger/logger';
import type { ListSessionsQuery } from './sessions.types';

const logger = createLogger('sessions-repository');

// ============================================================================
// SESSION CRUD
// ============================================================================

export async function createSession(data: typeof aiSessions.$inferInsert) {
  try {
    const [created] = await db.insert(aiSessions).values(data).returning();
    return created;
  } catch (error) {
    logger.error('Failed to create session', error as Error, { aiExperienceId: data.aiExperienceId });
    throw error;
  }
}

export async function getSessionById(id: string) {
  try {
    const result = await db.query.aiSessions.findFirst({
      where: eq(aiSessions.id, id),
    });
    return result || null;
  } catch (error) {
    logger.error('Failed to get session by id', error as Error, { id });
    throw error;
  }
}

export async function updateSession(
  id: string,
  data: Partial<typeof aiSessions.$inferInsert>,
) {
  try {
    const [updated] = await db.update(aiSessions)
      .set({ ...data, lastActiveAt: new Date() })
      .where(eq(aiSessions.id, id))
      .returning();
    return updated || null;
  } catch (error) {
    logger.error('Failed to update session', error as Error, { id });
    throw error;
  }
}

export async function deleteSession(id: string) {
  try {
    const [deleted] = await db.delete(aiSessions)
      .where(eq(aiSessions.id, id))
      .returning();
    return deleted || null;
  } catch (error) {
    logger.error('Failed to delete session', error as Error, { id });
    throw error;
  }
}

export async function listSessions(query: ListSessionsQuery) {
  try {
    const conditions = [];

    if (query.aiExperienceId) {
      conditions.push(eq(aiSessions.aiExperienceId, query.aiExperienceId));
    }
    if (query.status) {
      conditions.push(eq(aiSessions.status, query.status));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [countResult] = await db
      .select({ total: count() })
      .from(aiSessions)
      .where(whereClause);
    const totalItems = countResult?.total || 0;

    const sortColumn = query.sortBy === 'createdAt' ? aiSessions.createdAt : aiSessions.lastActiveAt;
    const sortFn = query.sortOrder === 'asc' ? asc : desc;

    const offset = (query.page - 1) * query.pageSize;
    const results = await db.query.aiSessions.findMany({
      where: whereClause,
      orderBy: sortFn(sortColumn),
      limit: query.pageSize,
      offset,
    });

    return {
      sessions: results,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        totalItems,
        totalPages: Math.ceil(totalItems / query.pageSize),
      },
    };
  } catch (error) {
    logger.error('Failed to list sessions', error as Error);
    throw error;
  }
}

// ============================================================================
// MESSAGE OPERATIONS
// ============================================================================

/**
 * Add a message to a session.
 * Returns the created message and increments messageCount atomically.
 */
export async function addMessage(
  sessionId: string,
  data: Omit<typeof aiSessionMessages.$inferInsert, 'sessionId'>,
) {
  try {
    return await db.transaction(async (tx) => {
      const [message] = await tx.insert(aiSessionMessages)
        .values({ ...data, sessionId })
        .returning();

      await tx.update(aiSessions)
        .set({
          messageCount: sql`${aiSessions.messageCount} + 1`,
          lastActiveAt: new Date(),
        })
        .where(eq(aiSessions.id, sessionId));

      return message;
    });
  } catch (error) {
    logger.error('Failed to add message', error as Error, { sessionId });
    throw error;
  }
}

/**
 * Add multiple messages in a single transaction (e.g., user + assistant in one turn).
 */
export async function addMessages(
  sessionId: string,
  messages: Array<Omit<typeof aiSessionMessages.$inferInsert, 'sessionId'>>,
) {
  try {
    return await db.transaction(async (tx) => {
      const created = await tx.insert(aiSessionMessages)
        .values(messages.map(m => ({ ...m, sessionId })))
        .returning();

      await tx.update(aiSessions)
        .set({
          messageCount: sql`${aiSessions.messageCount} + ${messages.length}`,
          lastActiveAt: new Date(),
        })
        .where(eq(aiSessions.id, sessionId));

      return created;
    });
  } catch (error) {
    logger.error('Failed to add messages', error as Error, { sessionId, count: messages.length });
    throw error;
  }
}

/**
 * Load the sliding window: last N messages ordered by turnIndex ascending.
 */
export async function loadMessageWindow(sessionId: string, windowSize: number) {
  try {
    // Get messages ordered by turnIndex desc, limit to windowSize, then reverse
    const messages = await db.query.aiSessionMessages.findMany({
      where: eq(aiSessionMessages.sessionId, sessionId),
      orderBy: desc(aiSessionMessages.turnIndex),
      limit: windowSize,
    });

    // Reverse to get chronological order
    return messages.reverse();
  } catch (error) {
    logger.error('Failed to load message window', error as Error, { sessionId, windowSize });
    throw error;
  }
}

/**
 * Load messages in a turn range (for summarization — get messages being compressed).
 */
export async function loadMessageRange(
  sessionId: string,
  fromTurnIndex: number,
  toTurnIndex: number,
) {
  try {
    const messages = await db.query.aiSessionMessages.findMany({
      where: and(
        eq(aiSessionMessages.sessionId, sessionId),
        sql`${aiSessionMessages.turnIndex} >= ${fromTurnIndex}`,
        sql`${aiSessionMessages.turnIndex} <= ${toTurnIndex}`,
      ),
      orderBy: asc(aiSessionMessages.turnIndex),
    });
    return messages;
  } catch (error) {
    logger.error('Failed to load message range', error as Error, { sessionId, fromTurnIndex, toTurnIndex });
    throw error;
  }
}

/**
 * Search messages by content (keyword fallback for memory retrieval tool).
 * Uses SQL ILIKE for basic text search.
 */
export async function searchMessages(
  sessionId: string,
  query: string,
  limit: number = 10,
) {
  try {
    const messages = await db.query.aiSessionMessages.findMany({
      where: and(
        eq(aiSessionMessages.sessionId, sessionId),
        sql`${aiSessionMessages.content} ILIKE ${'%' + query + '%'}`,
      ),
      orderBy: desc(aiSessionMessages.turnIndex),
      limit,
    });
    return messages;
  } catch (error) {
    logger.error('Failed to search messages', error as Error, { sessionId });
    throw error;
  }
}

/**
 * Semantic search using pgvector cosine distance.
 * Falls back gracefully if pgvector is not enabled or no embeddings exist.
 */
export async function searchMessagesByVector(
  sessionId: string,
  queryVector: number[],
  limit: number = 10,
  maxDistance: number = 0.5,
) {
  try {
    const vectorStr = `[${queryVector.join(',')}]`;
    const results = await db
      .select({
        id: aiSessionMessages.id,
        sessionId: aiSessionMessages.sessionId,
        role: aiSessionMessages.role,
        content: aiSessionMessages.content,
        turnIndex: aiSessionMessages.turnIndex,
        metadata: aiSessionMessages.metadata,
        createdAt: aiSessionMessages.createdAt,
        distance: sql<number>`${aiSessionMessages.embedding} <=> ${vectorStr}::vector`,
      })
      .from(aiSessionMessages)
      .where(
        and(
          eq(aiSessionMessages.sessionId, sessionId),
          sql`${aiSessionMessages.embedding} IS NOT NULL`,
          sql`${aiSessionMessages.embedding} <=> ${vectorStr}::vector < ${maxDistance}`,
        ),
      )
      .orderBy(sql`${aiSessionMessages.embedding} <=> ${vectorStr}::vector`)
      .limit(limit);

    return results;
  } catch (error) {
    // If pgvector is not installed or column doesn't exist, return empty
    const msg = (error as Error).message ?? '';
    if (msg.includes('vector') || msg.includes('operator does not exist')) {
      logger.warn('Vector search unavailable, falling back to keyword search', { sessionId });
      return [];
    }
    logger.error('Failed to search messages by vector', error as Error, { sessionId });
    throw error;
  }
}

/**
 * Update the embedding vector for a message.
 * Called async after message insertion.
 */
export async function updateMessageEmbedding(
  messageId: string,
  embedding: number[],
) {
  try {
    await db.update(aiSessionMessages)
      .set({ embedding })
      .where(eq(aiSessionMessages.id, messageId));
  } catch (error) {
    // Non-fatal — embedding is optional
    logger.warn('Failed to update message embedding', { messageId, error: (error as Error).message });
  }
}

/**
 * Get the next turn index for a session.
 */
export async function getNextTurnIndex(sessionId: string): Promise<number> {
  try {
    const [result] = await db
      .select({ maxTurn: sql<number>`COALESCE(MAX(${aiSessionMessages.turnIndex}), -1)` })
      .from(aiSessionMessages)
      .where(eq(aiSessionMessages.sessionId, sessionId));
    return (result?.maxTurn ?? -1) + 1;
  } catch (error) {
    logger.error('Failed to get next turn index', error as Error, { sessionId });
    throw error;
  }
}

// ============================================================================
// SESSION LIFECYCLE
// ============================================================================

/**
 * Expire sessions that have passed their expiresAt timestamp.
 * Returns the number of sessions expired.
 */
export async function expireSessions(): Promise<number> {
  try {
    const expired = await db.update(aiSessions)
      .set({ status: 'expired' })
      .where(
        and(
          eq(aiSessions.status, 'active'),
          lt(aiSessions.expiresAt, new Date()),
        )
      )
      .returning();
    return expired.length;
  } catch (error) {
    logger.error('Failed to expire sessions', error as Error);
    throw error;
  }
}

/**
 * Count active sessions for an experience.
 */
export async function countActiveSessions(aiExperienceId: string): Promise<number> {
  try {
    const [result] = await db
      .select({ total: count() })
      .from(aiSessions)
      .where(
        and(
          eq(aiSessions.aiExperienceId, aiExperienceId),
          eq(aiSessions.status, 'active'),
        )
      );
    return result?.total || 0;
  } catch (error) {
    logger.error('Failed to count active sessions', error as Error, { aiExperienceId });
    throw error;
  }
}
