// src/features/user-memories/memory-extraction.service.ts

/**
 * Memory Extraction Service — Episodic Memory (Sprint 5 / Phase D)
 *
 * Post-session extraction pass: reads the conversation and distills
 * stable, reusable facts about the user into user_memories.
 *
 * Flow:
 *   1. Load the full session conversation (or a window of it)
 *   2. Call AI with structured JSON output to extract memory facts
 *   3. Embed each fact and insert into user_memories
 *
 * This runs fire-and-forget after the session ends (or after summarization).
 * It must NOT block the chat response.
 *
 * Design rules for extracted facts:
 *   - Self-contained: each fact makes sense in isolation (next session, next day)
 *   - Stable: not ephemeral ("currently looking at sneakers" ❌, "prefers Nike" ✓)
 *   - Actionable: the AI can use it to improve future responses
 *   - De-duplicated: the extraction prompt asks the AI to avoid already-known facts
 */

import { createLogger } from '@/shared/logger/logger';
import { chat } from '@/features/ai-service/ai-service.service';
import type { ChatMessage, ResponseFormat } from '@/features/ai-service/ai-service.types';
import { embed } from '@/features/embedding/embedding.service';
import * as repository from './user-memories.repository';
import * as sessionRepository from '@/features/sessions/sessions.repository';
import type { NewUserMemory } from '@/db/schema';

const logger = createLogger('memory-extraction');

// ============================================================================
// TYPES
// ============================================================================

export interface ExtractionConfig {
  /** AI provider to use (defaults to system default) */
  providerId?: string;
  /** AI model to use (defaults to system default) */
  modelId?: number;
  /** Max memories to extract per session (default 10) */
  maxFacts?: number;
  /** Min confidence to store a memory (default 0.6) */
  minConfidence?: number;
}

export interface ExtractionResult {
  extracted: number;
  stored: number;
  skipped: number;
}

// ============================================================================
// STRUCTURED OUTPUT SCHEMA
// ============================================================================

const EXTRACTION_SCHEMA: ResponseFormat = {
  type: 'json_schema',
  json_schema: {
    name: 'memory_extraction',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        memories: {
          type: 'array',
          description: 'List of stable, reusable facts extracted about the user.',
          items: {
            type: 'object',
            properties: {
              content: {
                type: 'string',
                description: 'A single, self-contained fact about the user. Written in present tense from the system perspective. Example: "User prefers Nike running shoes over Adidas."',
              },
              confidence: {
                type: 'number',
                description: 'How confident you are this is a stable, reusable fact (0.0–1.0). Lower for speculative or context-dependent inferences.',
              },
            },
            required: ['content', 'confidence'],
            additionalProperties: false,
          },
        },
      },
      required: ['memories'],
      additionalProperties: false,
    },
  },
};

// ============================================================================
// MAIN API
// ============================================================================

/**
 * Extract and persist episodic memories from a completed session.
 *
 * @param sessionId       Source session
 * @param userId          External user identifier (from session.userContext.userId)
 * @param aiExperienceId  Experience scope
 * @param config          Optional AI model config
 */
export async function extractMemoriesFromSession(
  sessionId: string,
  userId: string,
  aiExperienceId: string,
  config?: ExtractionConfig,
): Promise<ExtractionResult> {
  const maxFacts = config?.maxFacts ?? 10;
  const minConfidence = config?.minConfidence ?? 0.6;

  // 1. Load conversation messages
  const messages = await sessionRepository.loadMessageWindow(sessionId, 50);
  if (messages.length === 0) {
    return { extracted: 0, stored: 0, skipped: 0 };
  }

  // 2. Load already-known memories so AI avoids duplicates
  const existingMemories = await repository.listMemories(userId, aiExperienceId);
  const existingFacts = existingMemories.map(m => m.content);

  // 3. Build extraction prompt
  const aiMessages = buildExtractionMessages(messages, existingFacts, maxFacts);

  // 4. Call AI
  let extracted: Array<{ content: string; confidence: number }>;
  try {
    const result = await chat(aiMessages, {
      providerId: config?.providerId,
      modelId: config?.modelId,
      temperature: 0.1,
      maxTokens: 1000,
      responseFormat: EXTRACTION_SCHEMA,
    });

    const parsed = JSON.parse(result.message.content as string) as {
      memories: Array<{ content: string; confidence: number }>;
    };
    extracted = parsed.memories;

    logger.info('Memory extraction LLM call complete', {
      sessionId,
      userId,
      candidatesExtracted: extracted.length,
      tokenUsage: result.usage,
    });
  } catch (error) {
    logger.error('Memory extraction LLM call failed', error as Error, { sessionId, userId });
    return { extracted: 0, stored: 0, skipped: 0 };
  }

  // 5. Filter by confidence, embed, and persist
  const candidates = extracted.filter(m => m.confidence >= minConfidence);
  const skipped = extracted.length - candidates.length;

  if (candidates.length === 0) {
    return { extracted: extracted.length, stored: 0, skipped };
  }

  // Embed all candidates in parallel
  const embeddings = await Promise.all(
    candidates.map(m => embed(m.content, { feature: 'memory_extraction' } as any)),
  );

  // Build insert rows
  const rows: NewUserMemory[] = candidates.map((m, i) => ({
    userId,
    aiExperienceId,
    content: m.content,
    embedding: embeddings[i] as any,
    confidence: m.confidence,
    sourceSessionId: sessionId,
  }));

  try {
    await repository.createMemories(rows);
    logger.info('Memories stored', {
      sessionId,
      userId,
      stored: rows.length,
      skipped,
    });
    return { extracted: extracted.length, stored: rows.length, skipped };
  } catch (error) {
    logger.error('Failed to persist extracted memories', error as Error, { sessionId, userId });
    return { extracted: extracted.length, stored: 0, skipped };
  }
}

// ============================================================================
// PROMPT BUILDING
// ============================================================================

function buildExtractionMessages(
  messages: Array<{ role: string; content: string }>,
  existingFacts: string[],
  maxFacts: number,
): ChatMessage[] {
  let systemPrompt = `You are a memory extraction system. Your job is to identify stable, reusable facts about the user from a conversation.

Rules for good memories:
- Self-contained: the fact makes sense with no conversation context
- Stable: true beyond this session (preferences, constraints, goals — NOT current queries or temporary state)
- Specific: "prefers Nike Air Max in size 10" is better than "likes shoes"
- Actionable: the AI can use it to give better answers in a future session

Do NOT extract:
- Ephemeral state: "is currently looking at sneakers", "just searched for X"
- Questions: "the user asked about..."
- Facts about the AI or the search results
- Anything that would only be relevant in this specific conversation

Write each memory in present tense from the system perspective:
✓ "User prefers Nike running shoes over Adidas."
✓ "User has a budget of around $150–$200 for footwear."
✓ "User is shopping for a birthday gift for their partner."
✗ "The user searched for running shoes."
✗ "The user clicked on item 3."

Extract at most ${maxFacts} memories.`;

  if (existingFacts.length > 0) {
    systemPrompt += `\n\nAlready known facts about this user — do NOT re-extract these:\n${existingFacts.map(f => `• ${f}`).join('\n')}`;
  }

  const conversationText = messages
    .map(m => `[${m.role}]: ${m.content}`)
    .join('\n\n');

  return [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: `Extract stable memories from this conversation:\n\n${conversationText}`,
    },
  ];
}
