// src/features/ai-service/utils/token-counter.ts

/**
 * Token Counter Utility
 * 
 * Provides token estimation for when APIs don't return exact counts.
 * Uses simple heuristics that work reasonably well for most models.
 * 
 * For accurate counts, use tiktoken or the OpenAI tokenizer.
 */

import type { ChatMessage, TokenUsage } from '../ai-service.types';

// ============================================================================
// ESTIMATION CONSTANTS
// ============================================================================

/**
 * Average characters per token for different model families
 * These are rough estimates based on typical tokenization
 */
const CHARS_PER_TOKEN: Record<string, number> = {
  // GPT models tend to have ~4 chars per token
  'gpt-4': 4,
  'gpt-3.5': 4,
  'text-embedding': 4,
  
  // Llama models
  'llama': 4,
  'mistral': 4,
  'mixtral': 4,
  
  // Nomic embedding models
  'nomic': 4,
  
  // Default fallback
  default: 4,
};

/**
 * Get chars per token for a model
 */
function getCharsPerToken(modelKey?: string): number {
  if (!modelKey) return CHARS_PER_TOKEN.default;
  
  // Find matching prefix
  const lowerKey = modelKey.toLowerCase();
  for (const [prefix, chars] of Object.entries(CHARS_PER_TOKEN)) {
    if (lowerKey.startsWith(prefix)) {
      return chars;
    }
  }
  
  return CHARS_PER_TOKEN.default;
}

// ============================================================================
// ESTIMATION FUNCTIONS
// ============================================================================

/**
 * Estimate token count for a string
 * 
 * @param text - Text to estimate tokens for
 * @param modelKey - Optional model key for more accurate estimation
 * @returns Estimated token count
 * 
 * @example
 * estimateTokens("Hello, world!");
 * // Returns approximately 3-4 tokens
 */
function estimateTokens(text: string, modelKey?: string): number {
  if (!text) return 0;
  
  const charsPerToken = getCharsPerToken(modelKey);
  return Math.ceil(text.length / charsPerToken);
}

/**
 * Estimate tokens for chat messages
 * 
 * Includes overhead for message formatting:
 * - ~4 tokens per message for role and formatting
 * 
 * @param messages - Chat messages
 * @param modelKey - Optional model key
 * @returns Estimated total tokens
 */
function estimateTokensForMessages(
  messages: Array<{ role: string; content: string }>,
  modelKey?: string
): number {
  const MESSAGE_OVERHEAD = 4; // tokens per message for formatting
  
  let total = 0;
  
  for (const message of messages) {
    // Content tokens
    total += estimateTokens(message.content, modelKey);
    // Message overhead
    total += MESSAGE_OVERHEAD;
  }
  
  // Additional overhead for conversation structure
  total += 2;

  return total;
}

/**
 * Estimate usage for a chat call the provider didn't report usage for
 * (no usage in the response, or a stream that stopped early)
 *
 * @param messages - The prompt messages; text and tool-result blocks count
 * @param output - The text the model produced
 * @param modelKey - Optional model key
 */
export function estimateChatUsage(messages: ChatMessage[], output: string, modelKey?: string): TokenUsage {
  const inputTokens = estimateTokensForMessages(
    messages.map((m) => ({
      role: m.role,
      content: typeof m.content === 'string'
        ? m.content
        : m.content.map((block) => ('text' in block ? block.text : 'content' in block ? block.content : '')).join(''),
    })),
    modelKey
  );
  const outputTokens = estimateTokens(output, modelKey);
  return { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens };
}
