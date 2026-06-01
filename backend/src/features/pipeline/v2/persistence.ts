// src/features/pipeline/v2/persistence.ts

/**
 * D4: Persistence — Deterministic Pipeline V2
 *
 * Persists the complete turn in a single synchronous write:
 * - User message + AI response → ai_session_messages
 * - Result memory + session facts → ai_sessions.pipelineState / facts
 *
 * Async fire-and-forget (after response stream closes):
 * - Episodic memory extraction
 * - Conversation summarization
 *
 * See: docs/platform-evolution/DETERMINISTIC-PIPELINE-V2.md § D4
 */

import { createLogger } from '@/shared/logger/logger';
import type {
  PersistenceInput,
  ModuleResult,
} from './v2.types';

const logger = createLogger('v2:persistence');

// ============================================================================
// DEPENDENCY INTERFACES
// ============================================================================

export interface PersistenceDeps {
  /** Persist user + assistant messages in one transaction */
  addMessages: (
    sessionId: string,
    messages: Array<{
      role: string;
      content: string;
      metadata?: Record<string, unknown>;
    }>,
  ) => Promise<void>;

  /** Update session state (pipelineState, facts, lastToolResults) */
  updateSession: (
    sessionId: string,
    updates: {
      pipelineState?: Record<string, unknown>;
      facts?: Record<string, string>;
      lastToolResults?: Record<string, unknown>;
    },
  ) => Promise<void>;

  /** Fire-and-forget: extract episodic memories from this turn */
  triggerMemoryExtraction?: (sessionId: string, userId: string, experienceId: string) => void;

  /** Fire-and-forget: summarize conversation if needed */
  triggerSummarization?: (sessionId: string) => void;
}

// ============================================================================
// MODULE ENTRY POINT
// ============================================================================

/**
 * Persist the complete turn — user message, AI response, results, and state.
 */
export async function persistTurn(
  input: PersistenceInput,
  deps: PersistenceDeps,
): Promise<ModuleResult<void>> {
  const startTime = Date.now();

  try {
    // 1. Persist messages (user + assistant) in one transaction
    await deps.addMessages(input.sessionId, [
      { role: 'user', content: input.userMessage },
      {
        role: 'assistant',
        content: input.synthesisResult.responseText,
        metadata: {
          tokenUsage: input.tokenUsage,
          responseData: input.synthesisResult.preset !== 'rich_text'
            ? {
                preset: input.synthesisResult.preset,
                presetPayload: input.synthesisResult.presetPayload,
              }
            : undefined,
          sources: input.synthesisResult.responseMetadata.sources,
          suggestedActions: input.synthesisResult.responseMetadata.suggestedActions,
        },
      },
    ]);

    // 2. Update session state
    const lastToolResults: Record<string, unknown> = {};
    for (const action of input.actionResults) {
      if (action.result.success) {
        lastToolResults[action.toolSlug] = {
          toolId: action.toolId,
          toolName: action.toolName,
          result: action.result.data,
          executedAt: new Date().toISOString(),
        };
      }
    }

    await deps.updateSession(input.sessionId, {
      pipelineState: {
        result_memory: input.resultMemory,
        turn_log: input.turnLog,
      },
      facts: input.sessionFacts,
      lastToolResults: Object.keys(lastToolResults).length > 0 ? lastToolResults : undefined,
    });

    const durationMs = Date.now() - startTime;

    logger.info('Turn persisted', {
      sessionId: input.sessionId,
      actionCount: input.actionResults.length,
      durationMs,
    });

    return {
      success: true,
      summary: `Persisted turn (${input.actionResults.length} actions)`,
      durationMs,
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('Persistence failed', err, { sessionId: input.sessionId });

    return {
      success: false,
      summary: `Persistence failed: ${err.message}`,
      durationMs,
    };
  }
}

// ============================================================================
// PRODUCTION DEPENDENCY FACTORY
// ============================================================================

export function createProductionPersistenceDeps(
  experienceId: string,
  providerId?: string,
  modelId?: number,
): PersistenceDeps {
  return {
    async addMessages(sessionId, messages) {
      const sessionsService = await import('@/features/sessions/sessions.service');
      await sessionsService.addMessages(sessionId, messages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
        metadata: m.metadata,
      })));
    },

    async updateSession(sessionId, updates) {
      const sessionsService = await import('@/features/sessions/sessions.service');
      await sessionsService.updateSession(sessionId, updates as any);
    },

    triggerMemoryExtraction(sessionId, userId, expId) {
      import('@/features/user-memories/memory-extraction.service').then(({ extractMemoriesFromSession }) => {
        extractMemoriesFromSession(sessionId, userId, expId, { providerId, modelId })
          .catch((err: Error) => logger.error('Async memory extraction failed', err, { sessionId }));
      });
    },

    triggerSummarization(sessionId) {
      import('@/features/sessions/summarization.service').then(({ summarizeSession }) => {
        summarizeSession(sessionId, 20, { providerId, modelId })
          .catch((err: Error) => logger.error('Async summarization failed', err, { sessionId }));
      });
    },
  };
}
