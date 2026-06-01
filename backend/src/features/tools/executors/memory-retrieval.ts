// src/features/tools/executors/memory-retrieval.ts

/**
 * Memory Retrieval Tool Executor
 *
 * Built-in system tool that allows the AI to search older messages
 * in the current session. Uses hybrid search:
 *   1. Semantic search via pgvector (if embeddings available)
 *   2. Keyword search via ILIKE (fallback / complementary)
 *
 * This is always available in agentic mode — the AI can invoke it
 * when the user references something from earlier in the conversation
 * that may have scrolled out of the sliding window.
 *
 * Input schema:
 *   { query: string, sessionId: string, limit?: number }
 *
 * The sessionId is injected by the pipeline (not provided by the AI).
 */

import { embed } from '@/features/embedding';
import * as sessionsRepo from '@/features/sessions/sessions.repository';
import { createLogger } from '@/shared/logger/logger';
import type { ToolExecutionResult } from '../tools.executor';

const logger = createLogger('memory-retrieval-executor');

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 25;
const MAX_DISTANCE = 0.45; // cosine distance threshold (lower = more similar)

// ============================================================================
// MAIN EXECUTOR
// ============================================================================

export async function executeMemoryRetrieval(
  config: Record<string, unknown>,
  input: Record<string, unknown>,
): Promise<Omit<ToolExecutionResult, 'durationMs'>> {
  const query = typeof input.query === 'string' ? input.query.trim() : '';
  if (!query) {
    return { success: false, error: 'Missing required input field: "query"' };
  }

  const sessionId = typeof input.sessionId === 'string' ? input.sessionId : '';
  if (!sessionId) {
    return { success: false, error: 'Missing required input field: "sessionId"' };
  }

  const limit = Math.min(
    typeof input.limit === 'number' ? Math.max(1, Math.floor(input.limit)) : DEFAULT_LIMIT,
    MAX_LIMIT,
  );

  try {
    // Strategy: try vector search first, fall back to keyword
    const vectorResults = await tryVectorSearch(sessionId, query, limit);
    const keywordResults = await sessionsRepo.searchMessages(sessionId, query, limit);

    // Merge: vector results first (ranked by similarity), then keyword results not already included
    const seenIds = new Set<string>();
    const merged: Array<{
      role: string;
      content: string;
      turnIndex: number;
      source: 'semantic' | 'keyword';
      distance?: number;
    }> = [];

    for (const r of vectorResults) {
      seenIds.add(r.id);
      merged.push({
        role: r.role,
        content: r.content,
        turnIndex: r.turnIndex,
        source: 'semantic',
        distance: r.distance,
      });
    }

    for (const r of keywordResults) {
      if (!seenIds.has(r.id) && merged.length < limit) {
        seenIds.add(r.id);
        merged.push({
          role: r.role,
          content: r.content,
          turnIndex: r.turnIndex,
          source: 'keyword',
        });
      }
    }

    if (merged.length === 0) {
      return {
        success: true,
        data: {
          results: [],
          message: 'No matching messages found in conversation history.',
        },
      };
    }

    // Sort by turnIndex ascending (chronological) for readability
    merged.sort((a, b) => a.turnIndex - b.turnIndex);

    return {
      success: true,
      data: {
        results: merged.map(m => ({
          role: m.role,
          content: m.content,
          turnIndex: m.turnIndex,
          source: m.source,
        })),
        totalFound: merged.length,
      },
    };
  } catch (error) {
    logger.error('Memory retrieval failed', error as Error, { sessionId });
    return { success: false, error: 'Failed to search conversation history' };
  }
}

// ============================================================================
// HELPERS
// ============================================================================

async function tryVectorSearch(
  sessionId: string,
  query: string,
  limit: number,
): Promise<Array<{ id: string; role: string; content: string; turnIndex: number; distance: number }>> {
  try {
    // Generate query embedding
    const queryVector = await embed(query);
    if (!queryVector) return [];

    const results = await sessionsRepo.searchMessagesByVector(
      sessionId,
      queryVector,
      limit,
      MAX_DISTANCE,
    );

    return results;
  } catch (error) {
    // Non-fatal — vector search is best-effort
    logger.debug('Vector search failed, using keyword only', { sessionId, error: (error as Error).message });
    return [];
  }
}

// ============================================================================
// SYSTEM TOOL DEFINITION
// ============================================================================

/**
 * The tool definition used when registering this as a system tool
 * in the agentic loop's available tools.
 */
export const MEMORY_RETRIEVAL_TOOL_DEFINITION = {
  name: 'memory_retrieval',
  description: 'Search earlier messages in this conversation that may have scrolled out of the current context window. Use this when the user references something discussed earlier, or when you need to recall details from a previous part of the conversation.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'What to search for in the conversation history. Use natural language — semantic search will find related content even if exact words differ.',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of messages to return (default: 10, max: 25)',
      },
    },
    required: ['query'],
  },
} as const;
