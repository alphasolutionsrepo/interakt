// src/features/sessions/summarization.service.ts

/**
 * Summarization Service
 *
 * Compresses older conversation messages into a concise summary and
 * extracts structured facts. This keeps the LLM context window efficient
 * as conversations grow beyond the sliding window.
 *
 * Flow:
 * 1. Load messages between `summarizedUpTo` and the window boundary
 * 2. Call AI with structured JSON output to produce summary + facts
 * 3. Update session: new summary, merged facts, new summarizedUpTo
 *
 * Uses the platform's AI service with low temperature for consistency.
 * Runs asynchronously (fire-and-forget) after the chat turn completes.
 */

import { createLogger } from '@/shared/logger/logger';
import { chat } from '@/features/ai-service/ai-service.service';
import type { ChatMessage, ResponseFormat } from '@/features/ai-service/ai-service.types';
import * as sessionsService from './sessions.service';
import * as repository from './sessions.repository';
import type { SessionFacts } from '@/db/schema/ai-sessions.schema';

const logger = createLogger('summarization');

// ============================================================================
// TYPES
// ============================================================================

export interface SummarizationConfig {
  /** AI provider to use for summarization (defaults to system default) */
  providerId?: string;
  /** AI model to use (defaults to system default — ideally a fast model) */
  modelId?: number;
  /** Max tokens for the summary response */
  maxTokens?: number;
}

export interface SummarizationResult {
  /** Whether summarization was performed */
  performed: boolean;
  /** Number of messages that were summarized */
  messagesSummarized: number;
  /** The generated summary text */
  summary?: string;
  /** Extracted facts */
  facts?: SessionFacts;
  /** AI token usage for the summarization call */
  tokenUsage?: { inputTokens: number; outputTokens: number; totalTokens: number };
}

// ============================================================================
// STRUCTURED OUTPUT SCHEMA
// ============================================================================

const SUMMARIZATION_SCHEMA: ResponseFormat = {
  type: 'json_schema',
  json_schema: {
    name: 'conversation_summary',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        summary: {
          type: 'string',
          description: 'A concise summary of the conversation so far. Include key topics discussed, questions asked, results found, and any decisions made. Write in third person ("The user asked about...").',
        },
        facts: {
          type: 'array',
          description: 'Structured facts extracted from the conversation as key-value pairs. Include things like: user preferences, search criteria, product interests, budget, constraints mentioned, items viewed or compared.',
          items: {
            type: 'object',
            properties: {
              key: { type: 'string', description: 'Descriptive key, e.g. "budget", "preferred_brand", "search_query"' },
              value: { type: 'string', description: 'The fact value as a readable string' },
            },
            required: ['key', 'value'],
            additionalProperties: false,
          },
        },
      },
      required: ['summary', 'facts'],
      additionalProperties: false,
    },
  },
};

// ============================================================================
// MAIN API
// ============================================================================

/**
 * Summarize older messages in a session.
 * Safe to call even when no summarization is needed — returns early.
 */
export async function summarizeSession(
  sessionId: string,
  windowSize: number,
  config?: SummarizationConfig,
): Promise<SummarizationResult> {
  // 1. Load messages that need summarization
  const messages = await sessionsService.loadMessagesForSummarization(sessionId, windowSize);

  if (messages.length === 0) {
    return { performed: false, messagesSummarized: 0 };
  }

  // 2. Load current session state for context
  const session = await repository.getSessionById(sessionId);
  if (!session) {
    logger.warn('Session not found for summarization', { sessionId });
    return { performed: false, messagesSummarized: 0 };
  }

  // 3. Build the summarization prompt
  const existingSummary = session.summary;
  const existingFacts = (session.facts as SessionFacts) ?? {};
  const aiMessages = buildSummarizationMessages(messages, existingSummary, existingFacts);

  // 4. Call AI
  try {
    const result = await chat(aiMessages, {
      providerId: config?.providerId,
      modelId: config?.modelId,
      temperature: 0.1, // Low temperature for consistent summaries
      maxTokens: config?.maxTokens ?? 1000,
      responseFormat: SUMMARIZATION_SCHEMA,
    });

    // 5. Parse structured response
    const parsed = JSON.parse(result.message.content as string) as {
      summary: string;
      facts: Array<{ key: string; value: string }>;
    };

    // 6. Convert facts array to object, then merge with existing (new facts override old ones)
    const newFacts: Record<string, string> = {};
    for (const { key, value } of parsed.facts) {
      newFacts[key] = value;
    }
    const mergedFacts: SessionFacts = { ...existingFacts, ...newFacts };

    // 7. Compute new summarizedUpTo
    // The last message we summarized has the highest turnIndex
    const lastSummarizedTurn = Math.max(...messages.map(m => (m as { turnIndex: number }).turnIndex));

    // 8. Update session
    await sessionsService.updateSession(sessionId, {
      summary: parsed.summary,
      facts: mergedFacts,
      summarizedUpTo: lastSummarizedTurn + 1,
    });

    logger.info('Summarized session', {
      sessionId,
      messagesSummarized: messages.length,
      summaryLength: parsed.summary.length,
      factsExtracted: parsed.facts.length,
      totalFacts: Object.keys(mergedFacts).length,
      tokenUsage: result.usage,
    });

    return {
      performed: true,
      messagesSummarized: messages.length,
      summary: parsed.summary,
      facts: mergedFacts,
      tokenUsage: {
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        totalTokens: result.usage.totalTokens,
      },
    };
  } catch (error) {
    logger.error('Summarization failed', error as Error, { sessionId, messageCount: messages.length });

    // Summarization failure is non-fatal — the conversation continues
    // with a larger window until next summarization attempt
    return { performed: false, messagesSummarized: 0 };
  }
}

// ============================================================================
// PROMPT BUILDING
// ============================================================================

function buildSummarizationMessages(
  messages: Array<{ role: string; content: string }>,
  existingSummary: string | null,
  existingFacts: SessionFacts,
): ChatMessage[] {
  let systemPrompt = `You are a conversation summarizer. Your job is to:

1. Create a concise summary of the conversation messages provided
2. Extract key facts as structured key-value pairs

Guidelines:
- Write the summary in third person ("The user asked about...", "The assistant found...")
- Focus on what matters for continuing the conversation: topics, preferences, decisions, results
- Keep the summary under 300 words
- For facts, use descriptive keys like "budget", "preferred_brand", "search_query", "items_compared"
- Facts should be strings — convert numbers and lists to readable text
- If a fact contradicts a previously extracted fact, use the newer value`;

  if (existingSummary) {
    systemPrompt += `\n\nPrevious summary (incorporate and extend, don't just repeat):\n${existingSummary}`;
  }

  if (Object.keys(existingFacts).length > 0) {
    systemPrompt += `\n\nPreviously extracted facts (update or add to these):\n${JSON.stringify(existingFacts, null, 2)}`;
  }

  // Format conversation messages for the AI
  const conversationText = messages
    .map(m => `[${m.role}]: ${m.content}`)
    .join('\n\n');

  return [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: `Summarize the following conversation segment and extract key facts:\n\n${conversationText}`,
    },
  ];
}
