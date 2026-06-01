// src/features/analytics/pipeline/analytics-context-assembly.ts

/**
 * S2: Analytics Context Assembly
 *
 * Loads session, builds sliding window, prepares tool list.
 * No AI calls — pure data loading.
 */

import 'server-only';

import { createLogger } from '@/shared/logger/logger';
import { getAnalyticsConfig } from '../analytics-config';
import { ANALYTICS_TOOL_SUMMARIES } from './analytics-turn-planner';
import type {
  ModuleResult,
  AnalyticsTurnContext,
  AnalyticsTurnMessage,
  AnalyticsToolSummary,
} from './analytics-pipeline.types';

const logger = createLogger('analytics-context-assembly');

// ============================================================================
// HELPERS
// ============================================================================

/** Check if an experience ID belongs to a search experience (vs AI experience) */
async function isSearchExperience(experienceId: string): Promise<boolean> {
  try {
    const { db } = await import('@/db/index');
    const { searchExperiences } = await import('@/db/schema');
    const { eq } = await import('drizzle-orm');

    const [row] = await db
      .select({ id: searchExperiences.id })
      .from(searchExperiences)
      .where(eq(searchExperiences.id, experienceId))
      .limit(1);

    return !!row;
  } catch {
    return false;
  }
}

// ============================================================================
// MAIN
// ============================================================================

export async function assembleAnalyticsContext(input: {
  userMessage: string;
  sessionId?: string;
  experienceId?: string;
  providerId?: string;
  modelId?: number;
}): Promise<ModuleResult<AnalyticsTurnContext>> {
  const startTime = Date.now();

  try {
    const config = getAnalyticsConfig();
    const windowSize = config.analyticsChatWindowSize ?? 5;

    let sessionId = input.sessionId || null;
    let conversationHistory: AnalyticsTurnMessage[] = [];
    let conversationSummary: string | null = null;
    let sessionFacts: Record<string, string> = {};

    // Load existing session if provided
    if (sessionId) {
      const { getSession: getAdminChatSession } = await import('../admin-chat-session.service');
      const session = await getAdminChatSession(sessionId);

      if (session) {
        // Sliding window: take last N messages
        const allMessages = session.messages || [];
        const windowMessages = allMessages.slice(-windowSize);

        conversationHistory = windowMessages.map((m) => ({
          role: m.role,
          content: m.content,
        }));

        // Load summary and facts from session
        conversationSummary = (session as Record<string, unknown>).summary as string | null || null;
        sessionFacts = ((session as Record<string, unknown>).facts as Record<string, string>) || {};
      } else {
        // Session not found, will create new
        sessionId = null;
      }
    }

    // Filter tools based on experience type — search experiences only have
    // searchEvents data, not OTel spans, so pre-computed insights are unavailable
    let availableTools: AnalyticsToolSummary[] = ANALYTICS_TOOL_SUMMARIES;
    if (input.experienceId) {
      const isSearch = await isSearchExperience(input.experienceId);
      if (isSearch) {
        availableTools = ANALYTICS_TOOL_SUMMARIES.filter(t => t.category !== 'precomputed');
      }
    }

    const context: AnalyticsTurnContext = {
      userMessage: input.userMessage,
      sessionId,
      experienceId: input.experienceId || null,
      conversationHistory,
      conversationSummary,
      sessionFacts,
      availableTools,
      providerId: input.providerId || null,
      modelId: input.modelId ? Number(input.modelId) : null,
    };

    return {
      success: true,
      data: context,
      summary: `Context: ${conversationHistory.length} messages in window, ${conversationSummary ? 'has summary' : 'no summary'}`,
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    logger.error('Context assembly failed', { error });
    return {
      success: false,
      summary: `Context assembly failed: ${error instanceof Error ? error.message : 'Unknown'}`,
      durationMs: Date.now() - startTime,
    };
  }
}
