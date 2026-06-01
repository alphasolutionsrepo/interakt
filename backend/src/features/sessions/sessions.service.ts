// src/features/sessions/sessions.service.ts

import { createLogger } from '@/shared/logger/logger';
import * as repository from './sessions.repository';
import * as aiExperienceService from '../ai-experience/ai-experience.service';
import { embed, prepareMessageText } from '@/features/embedding';
import type {
  CreateSessionDTO,
  AddMessageDTO,
  UpdateSessionDTO,
  ListSessionsQuery,
  SessionWithMessages,
  SessionListResponse,
} from './sessions.types';
import type { SessionMessageMetadata } from '@/db/schema';

const logger = createLogger('sessions-service');

// ============================================================================
// SESSION LIFECYCLE
// ============================================================================

/**
 * Create a new session for an AI experience.
 * Validates the experience exists and is active, computes expiry from sessionConfig.
 */
export async function createSession(input: CreateSessionDTO) {
  const experience = await aiExperienceService.getAIExperienceById(input.aiExperienceId);
  if (!experience) {
    throw new Error('AI Experience not found');
  }
  if (!experience.isActive) {
    throw new Error('AI Experience is not active');
  }

  const expiresAt = new Date(Date.now() + input.ttlMinutes * 60 * 1000);

  const created = await repository.createSession({
    aiExperienceId: input.aiExperienceId,
    clientMetadata: input.clientMetadata as any,
    userContext: input.userContext as any,
    expiresAt,
  });

  logger.info('Created session', { sessionId: created.id, aiExperienceId: input.aiExperienceId });
  return created;
}

/**
 * Get a session by ID. Returns null if not found or expired.
 * Performs lazy expiry check — if session is past expiresAt, marks it expired.
 */
export async function getSessionById(id: string) {
  const session = await repository.getSessionById(id);
  if (!session) return null;

  // Lazy expiry
  if (session.status === 'active' && session.expiresAt < new Date()) {
    await repository.updateSession(id, { status: 'expired' });
    return { ...session, status: 'expired' as const };
  }

  return session;
}

/**
 * Get a session with its sliding window of recent messages.
 * This is the primary load path — called at the start of every turn.
 */
export async function getSessionWithWindow(
  sessionId: string,
  windowSize: number,
): Promise<SessionWithMessages | null> {
  const session = await getSessionById(sessionId);
  if (!session) return null;

  const messages = await repository.loadMessageWindow(sessionId, windowSize);

  return {
    session: session as SessionWithMessages['session'],
    messages: messages as SessionWithMessages['messages'],
  };
}

/**
 * List sessions with pagination and filtering.
 */
export async function listSessions(query: ListSessionsQuery): Promise<SessionListResponse> {
  const result = await repository.listSessions(query);
  return {
    sessions: result.sessions as any[],
    pagination: result.pagination,
  };
}

// ============================================================================
// MESSAGE OPERATIONS
// ============================================================================

/**
 * Add a single message to a session.
 * Automatically assigns the next turn index.
 */
export async function addMessage(sessionId: string, input: AddMessageDTO) {
  const session = await getSessionById(sessionId);
  if (!session) {
    throw new Error('Session not found');
  }
  if (session.status !== 'active') {
    throw new Error(`Session is ${session.status}`);
  }

  const turnIndex = await repository.getNextTurnIndex(sessionId);

  const message = await repository.addMessage(sessionId, {
    role: input.role,
    content: input.content,
    turnIndex,
    metadata: input.metadata as SessionMessageMetadata,
  });

  // Embed async (fire-and-forget) for semantic search
  embedMessageAsync(message.id, input.role, input.content);

  return message;
}

/**
 * Add multiple messages in one transaction (e.g., user message + assistant response).
 * Automatically assigns sequential turn indexes.
 */
export async function addMessages(
  sessionId: string,
  inputs: AddMessageDTO[],
) {
  const session = await getSessionById(sessionId);
  if (!session) {
    throw new Error('Session not found');
  }
  if (session.status !== 'active') {
    throw new Error(`Session is ${session.status}`);
  }

  const startTurnIndex = await repository.getNextTurnIndex(sessionId);

  const messages = await repository.addMessages(
    sessionId,
    inputs.map((input, i) => ({
      role: input.role,
      content: input.content,
      turnIndex: startTurnIndex + i,
      metadata: input.metadata as SessionMessageMetadata,
    })),
  );

  // Embed all messages async (fire-and-forget)
  for (let i = 0; i < messages.length; i++) {
    embedMessageAsync(messages[i].id, inputs[i].role, inputs[i].content);
  }

  return messages;
}

/**
 * Load the sliding window for a session (recent N messages).
 */
export async function loadMessageWindow(sessionId: string, windowSize: number) {
  return repository.loadMessageWindow(sessionId, windowSize);
}

/**
 * Search messages in a session (for memory retrieval tool).
 */
export async function searchMessages(sessionId: string, query: string, limit?: number) {
  return repository.searchMessages(sessionId, query, limit);
}

// ============================================================================
// SESSION STATE UPDATES
// ============================================================================

/**
 * Update session working memory (summary, facts, pipeline state, tool results).
 * Called after each turn by the pipeline orchestrator.
 */
export async function updateSession(sessionId: string, input: UpdateSessionDTO) {
  const session = await repository.getSessionById(sessionId);
  if (!session) {
    throw new Error('Session not found');
  }

  const updateData: Record<string, unknown> = {};

  if (input.summary !== undefined) updateData.summary = input.summary;
  if (input.facts !== undefined) updateData.facts = input.facts;
  if (input.pipelineState !== undefined) updateData.pipelineState = input.pipelineState;
  if (input.lastToolResults !== undefined) updateData.lastToolResults = input.lastToolResults;
  if (input.userContext !== undefined) updateData.userContext = input.userContext;
  if (input.status !== undefined) updateData.status = input.status;
  if (input.summarizedUpTo !== undefined) updateData.summarizedUpTo = input.summarizedUpTo;

  const updated = await repository.updateSession(sessionId, updateData as any);
  return updated;
}

/**
 * Update pipeline state for a specific step (merge into existing state).
 * Convenience method so step handlers can update their own namespace without overwriting others.
 */
export async function updatePipelineStepState(
  sessionId: string,
  stepId: string,
  stepState: Record<string, unknown>,
) {
  const session = await repository.getSessionById(sessionId);
  if (!session) {
    throw new Error('Session not found');
  }

  const currentState = (session.pipelineState as Record<string, Record<string, unknown>>) || {};
  const mergedState = {
    ...currentState,
    [stepId]: { ...(currentState[stepId] || {}), ...stepState },
  };

  return repository.updateSession(sessionId, { pipelineState: mergedState as any });
}

/**
 * Update last tool results (merge — keeps results from different tools).
 */
export async function updateLastToolResults(
  sessionId: string,
  toolKey: string,
  result: { toolId: string; toolName: string; result: unknown },
) {
  const session = await repository.getSessionById(sessionId);
  if (!session) {
    throw new Error('Session not found');
  }

  const current = (session.lastToolResults as Record<string, unknown>) || {};
  const merged = {
    ...current,
    [toolKey]: {
      ...result,
      executedAt: new Date().toISOString(),
    },
  };

  return repository.updateSession(sessionId, { lastToolResults: merged as any });
}

// ============================================================================
// SUMMARIZATION SUPPORT
// ============================================================================

/**
 * Load messages that need summarization (between summarizedUpTo and the window boundary).
 */
export async function loadMessagesForSummarization(
  sessionId: string,
  windowSize: number,
) {
  const session = await repository.getSessionById(sessionId);
  if (!session) {
    throw new Error('Session not found');
  }

  // Messages to summarize: from summarizedUpTo to (messageCount - windowSize)
  const summarizeUpTo = session.messageCount - windowSize;
  if (summarizeUpTo <= session.summarizedUpTo) {
    return []; // Nothing to summarize
  }

  return repository.loadMessageRange(sessionId, session.summarizedUpTo, summarizeUpTo - 1);
}

/**
 * Check if summarization should be triggered.
 */
export function shouldSummarize(messageCount: number, summaryThreshold: number): boolean {
  return messageCount > summaryThreshold;
}

// ============================================================================
// SESSION CLEANUP
// ============================================================================

/**
 * Expire all sessions that have passed their expiresAt.
 * Called by background job or lazily on read.
 */
export async function expireSessions(): Promise<number> {
  const count = await repository.expireSessions();
  if (count > 0) {
    logger.info('Expired sessions', { count });
  }
  return count;
}

/**
 * Count active sessions for an experience (for rate limiting / max sessions check).
 */
export async function countActiveSessions(aiExperienceId: string): Promise<number> {
  return repository.countActiveSessions(aiExperienceId);
}

// ============================================================================
// EMBED ON WRITE (async, non-blocking)
// ============================================================================

/**
 * Generate and store an embedding for a message.
 * Fire-and-forget — failures are logged but never block the response.
 */
function embedMessageAsync(messageId: string, role: string, content: string): void {
  // Only embed user and assistant messages (skip system/tool_result — low search value)
  if (role !== 'user' && role !== 'assistant') return;

  const text = prepareMessageText(role, content);

  embed(text)
    .then((vector) => {
      if (vector) {
        return repository.updateMessageEmbedding(messageId, vector);
      }
    })
    .catch((error) => {
      logger.debug('Embed-on-write failed (non-fatal)', { messageId, error: (error as Error).message });
    });
}
