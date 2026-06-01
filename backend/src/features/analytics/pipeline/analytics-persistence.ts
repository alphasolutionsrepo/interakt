// src/features/analytics/pipeline/analytics-persistence.ts

/**
 * D4: Analytics Persistence
 *
 * Saves messages, updates session facts, triggers summarization.
 */

import 'server-only';

import { createLogger } from '@/shared/logger/logger';
import { getAnalyticsConfig } from '../analytics-config';
import type { AdminChatMessage, AdminChatAnalyticsData } from '@/db/analytics-schema/admin-chat-sessions.schema';
import type { ModuleResult, ChatFn } from './analytics-pipeline.types';

const logger = createLogger('analytics-persistence');

// ============================================================================
// MAIN
// ============================================================================

export async function persistAnalyticsTurn(input: {
  sessionId: string | null;
  userMessage: string;
  responseText: string;
  toolsUsed: string[];
  analyticsData: AdminChatAnalyticsData[];
  usage: { inputTokens: number; outputTokens: number; totalTokens: number };
  facts: Record<string, string>;
  providerId?: string | null;
  modelId?: number | null;
  chat: ChatFn;
}): Promise<ModuleResult<{ sessionId: string }>> {
  const startTime = Date.now();

  try {
    const {
      createSession: createAdminChatSession,
      getSession: getAdminChatSession,
      addMessages: addAdminChatMessages,
    } = await import('../admin-chat-session.service');

    // Create session if needed
    let sessionId = input.sessionId;
    if (!sessionId) {
      const newSession = await createAdminChatSession({
        providerId: input.providerId || undefined,
        modelId: input.modelId || undefined,
      });
      sessionId = newSession.id;
    }

    // Build messages
    const userMsg: AdminChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: input.userMessage,
      timestamp: new Date().toISOString(),
    };

    const assistantMsg: AdminChatMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: input.responseText,
      timestamp: new Date().toISOString(),
      toolsUsed: input.toolsUsed.length > 0 ? input.toolsUsed : undefined,
      analyticsData: input.analyticsData.length > 0 ? input.analyticsData : undefined,
      usage: input.usage.totalTokens > 0 ? input.usage : undefined,
    };

    // Save messages
    await addAdminChatMessages(sessionId, [userMsg, assistantMsg], input.usage);

    // Update facts
    await updateSessionFacts(sessionId, input.facts);

    // Check if summarization is needed (async, non-blocking)
    triggerSummarizationIfNeeded(sessionId, input.chat).catch((err) =>
      logger.warn('Summarization trigger failed (non-fatal)', { error: err })
    );

    return {
      success: true,
      data: { sessionId },
      summary: `Saved 2 messages to session ${sessionId.slice(0, 8)}`,
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    logger.error('Persistence failed', { error });
    return {
      success: false,
      summary: `Persistence failed: ${error instanceof Error ? error.message : 'Unknown'}`,
      durationMs: Date.now() - startTime,
    };
  }
}

// ============================================================================
// SESSION FACTS UPDATE
// ============================================================================

async function updateSessionFacts(
  sessionId: string,
  newFacts: Record<string, string>
): Promise<void> {
  if (Object.keys(newFacts).length === 0) return;

  try {
    const { analyticsDB } = await import('@/db/index');
    const { adminChatSessions } = await import('@/db/analytics-schema');
    const { eq, sql } = await import('drizzle-orm');

    if (!analyticsDB) return;

    // Merge new facts with existing
    await analyticsDB
      .update(adminChatSessions)
      .set({
        facts: sql`COALESCE(${adminChatSessions.facts}, '{}'::jsonb) || ${JSON.stringify(newFacts)}::jsonb`,
        updatedAt: new Date(),
      })
      .where(eq(adminChatSessions.id, sessionId));
  } catch (error) {
    logger.warn('Failed to update session facts (non-fatal)', { error });
  }
}

// ============================================================================
// SUMMARIZATION (async, non-blocking)
// ============================================================================

async function triggerSummarizationIfNeeded(
  sessionId: string,
  chat: ChatFn
): Promise<void> {
  const config = getAnalyticsConfig();
  const windowSize = config.analyticsChatWindowSize ?? 5;
  const threshold = config.analyticsChatSummaryThreshold ?? 10;

  const { getSession } = await import('../admin-chat-session.service');
  const session = await getSession(sessionId);
  if (!session) return;

  const messageCount = session.messages?.length || 0;
  if (messageCount < threshold) return;

  logger.info('Triggering conversation summarization', { sessionId, messageCount, threshold });

  // Take messages outside the window
  const messages = session.messages || [];
  const olderMessages = messages.slice(0, messages.length - windowSize);

  if (olderMessages.length === 0) return;

  const transcript = olderMessages
    .map((m) => `${m.role}: ${m.content.slice(0, 200)}`)
    .join('\n');

  try {
    const result = await chat(
      [
        {
          role: 'system',
          content: 'Summarize this analytics conversation in 2-3 sentences. Focus on topics discussed and key findings. Be factual and concise.',
        },
        { role: 'user', content: transcript },
      ],
      { maxTokens: 200, temperature: 0.2, feature: 'analytics-summarization' }
    );

    const summary = typeof result.message.content === 'string'
      ? result.message.content
      : String(result.message.content);

    // Save summary and trim messages
    const { analyticsDB } = await import('@/db/index');
    const { adminChatSessions } = await import('@/db/analytics-schema');
    const { eq } = await import('drizzle-orm');

    if (!analyticsDB) return;

    const trimmedMessages = messages.slice(-windowSize);

    await analyticsDB
      .update(adminChatSessions)
      .set({
        summary,
        messages: trimmedMessages,
        messageCount: trimmedMessages.length,
        updatedAt: new Date(),
      })
      .where(eq(adminChatSessions.id, sessionId));

    logger.info('Conversation summarized', {
      sessionId,
      summarizedMessages: olderMessages.length,
      remainingMessages: trimmedMessages.length,
    });
  } catch (error) {
    logger.warn('Summarization failed (non-fatal)', { error });
  }
}
