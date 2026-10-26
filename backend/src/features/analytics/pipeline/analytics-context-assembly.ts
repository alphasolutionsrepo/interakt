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
  experienceName?: string;
  timeRange?: string;
  period?: { from: string; to: string };
  timeZone?: string;
  pageSection?: string;
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

      // A conversation stays scoped to the experience it started with — mixing history
      // and facts from one experience into answers about another gives misleading results
      const sessionExperienceId = session?.experienceId ?? null;
      if (session && (session.messageCount ?? 0) > 0 && sessionExperienceId !== (input.experienceId ?? null)) {
        const scope = sessionExperienceId ? `"${session.experienceName ?? 'another experience'}"` : 'all experiences';
        return {
          success: false,
          summary: `This conversation is about ${scope}. Start a new conversation to ask about a different experience.`,
          durationMs: Date.now() - startTime,
        };
      }

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
      // Comparing experiences doesn't fit a conversation about one of them
      availableTools = availableTools.filter(t => t.availability !== 'all-experiences');
      const isSearch = await isSearchExperience(input.experienceId);
      if (isSearch) {
        availableTools = availableTools.filter(t => t.category !== 'precomputed' && t.availability !== 'chat-experiences');
      }
    }

    const context: AnalyticsTurnContext = {
      userMessage: input.userMessage,
      sessionId,
      experienceId: input.experienceId || null,
      experienceName: input.experienceId ? input.experienceName || null : null,
      timeRange: input.timeRange || null,
      period: input.period ? { from: new Date(input.period.from), to: new Date(input.period.to) } : null,
      timeZone: input.timeZone || 'UTC',
      pageSection: input.pageSection || null,
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
