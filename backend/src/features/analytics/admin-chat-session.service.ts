// src/features/analytics/admin-chat-session.service.ts

/**
 * Admin Chat Session Service
 *
 * Manages persistence for analytics chat sessions between admins and the AI assistant.
 * Sessions are stored in the analytics database for history and review.
 */

import 'server-only';

import { eq, desc, sql } from 'drizzle-orm';
import { createLogger } from '@/shared/logger/logger';

const logger = createLogger('admin-chat-session-service');

// ============================================================================
// TYPES (re-exported from schema)
// ============================================================================

export type {
  AdminChatSession,
  AdminChatMessage,
  AdminChatAnalyticsData,
  AdminChatSessionSummary,
} from '@/db/analytics-schema';

import type {
  AdminChatSession,
  InsertAdminChatSession,
  AdminChatMessage,
  AdminChatSessionSummary,
} from '@/db/analytics-schema';

export interface CreateSessionInput {
  title?: string;
  providerId?: string;
  modelId?: number;
}

export interface UpdateSessionInput {
  messages?: AdminChatMessage[];
  title?: string;
  tokenUsage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
}

export interface ListSessionsOptions {
  limit?: number;
  offset?: number;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Generate a title from the first user message
 */
function generateTitleFromMessage(message: string): string {
  // Remove extra whitespace and truncate
  const cleaned = message.trim().replace(/\s+/g, ' ');
  if (cleaned.length <= 50) {
    return cleaned;
  }
  return cleaned.substring(0, 47) + '...';
}

/**
 * Get analytics DB and schema via dynamic import
 */
async function getDB() {
  const { analyticsDB } = await import('@/db/index');
  if (!analyticsDB) {
    throw new Error('Analytics database is not configured');
  }
  const { adminChatSessions } = await import('@/db/analytics-schema');
  return { db: analyticsDB, adminChatSessions };
}

// ============================================================================
// SERVICE FUNCTIONS
// ============================================================================

/**
 * Create a new admin chat session
 */
export async function createSession(input: CreateSessionInput = {}): Promise<AdminChatSession> {
  const { db, adminChatSessions } = await getDB();

  const sessionData: InsertAdminChatSession = {
    title: input.title || 'New Chat',
    messages: [],
    providerId: input.providerId,
    modelId: input.modelId,
    totalTokens: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    messageCount: 0,
  };

  const [session] = await db
    .insert(adminChatSessions)
    .values(sessionData)
    .returning();

  logger.info('Created admin chat session', { sessionId: session.id });
  return session;
}

/**
 * Get a session by ID
 */
export async function getSession(sessionId: string): Promise<AdminChatSession | null> {
  const { db, adminChatSessions } = await getDB();

  const [session] = await db
    .select()
    .from(adminChatSessions)
    .where(eq(adminChatSessions.id, sessionId))
    .limit(1);

  return session || null;
}

/**
 * List sessions for the sidebar (summary only, no full messages)
 */
export async function listSessions(options: ListSessionsOptions = {}): Promise<AdminChatSessionSummary[]> {
  const { db, adminChatSessions } = await getDB();
  const { limit = 50, offset = 0 } = options;

  const sessions = await db
    .select({
      id: adminChatSessions.id,
      title: adminChatSessions.title,
      messageCount: adminChatSessions.messageCount,
      lastMessageAt: adminChatSessions.lastMessageAt,
      createdAt: adminChatSessions.createdAt,
    })
    .from(adminChatSessions)
    .orderBy(desc(adminChatSessions.lastMessageAt), desc(adminChatSessions.createdAt))
    .limit(limit)
    .offset(offset);

  return sessions;
}

/**
 * Update a session (add messages, update token usage)
 */
export async function updateSession(
  sessionId: string,
  input: UpdateSessionInput
): Promise<AdminChatSession | null> {
  const { db, adminChatSessions } = await getDB();

  // Build update object
  const updateData: Partial<InsertAdminChatSession> & { updatedAt: Date; lastMessageAt?: Date } = {
    updatedAt: new Date(),
  };

  if (input.title) {
    updateData.title = input.title;
  }

  if (input.messages) {
    updateData.messages = input.messages;
    updateData.messageCount = input.messages.length;
    updateData.lastMessageAt = new Date();
  }

  if (input.tokenUsage) {
    // Use SQL for atomic increment
    const [updated] = await db
      .update(adminChatSessions)
      .set({
        ...updateData,
        totalInputTokens: sql`${adminChatSessions.totalInputTokens} + ${input.tokenUsage.inputTokens}`,
        totalOutputTokens: sql`${adminChatSessions.totalOutputTokens} + ${input.tokenUsage.outputTokens}`,
        totalTokens: sql`${adminChatSessions.totalTokens} + ${input.tokenUsage.totalTokens}`,
      })
      .where(eq(adminChatSessions.id, sessionId))
      .returning();

    return updated || null;
  }

  const [updated] = await db
    .update(adminChatSessions)
    .set(updateData)
    .where(eq(adminChatSessions.id, sessionId))
    .returning();

  return updated || null;
}

/**
 * Add messages to a session
 */
export async function addMessages(
  sessionId: string,
  newMessages: AdminChatMessage[],
  tokenUsage?: { inputTokens: number; outputTokens: number; totalTokens: number }
): Promise<AdminChatSession | null> {
  // Get existing session
  const session = await getSession(sessionId);
  if (!session) {
    logger.warn('Session not found for adding messages', { sessionId });
    return null;
  }

  // Combine messages
  const allMessages = [...(session.messages || []), ...newMessages];

  // Update title if this is the first user message
  let newTitle = session.title;
  if (session.messageCount === 0 && newMessages.length > 0) {
    const firstUserMessage = newMessages.find(m => m.role === 'user');
    if (firstUserMessage) {
      newTitle = generateTitleFromMessage(firstUserMessage.content);
    }
  }

  return updateSession(sessionId, {
    messages: allMessages,
    title: newTitle !== session.title ? newTitle : undefined,
    tokenUsage,
  });
}

/**
 * Delete a session
 */
export async function deleteSession(sessionId: string): Promise<boolean> {
  const { db, adminChatSessions } = await getDB();

  const result = await db
    .delete(adminChatSessions)
    .where(eq(adminChatSessions.id, sessionId))
    .returning({ id: adminChatSessions.id });

  const deleted = result.length > 0;
  if (deleted) {
    logger.info('Deleted admin chat session', { sessionId });
  }
  return deleted;
}

/**
 * Get total session count
 */
export async function getSessionCount(): Promise<number> {
  const { db, adminChatSessions } = await getDB();

  const [result] = await db
    .select({ count: sql<number>`count(*)` })
    .from(adminChatSessions);

  return result?.count || 0;
}
