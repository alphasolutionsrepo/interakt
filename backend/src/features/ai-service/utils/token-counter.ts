// src/features/ai-service/utils/token-counter.ts

/**
 * Token Counter Utility
 * 
 * Provides token estimation for when APIs don't return exact counts.
 * Uses simple heuristics that work reasonably well for most models.
 * 
 * For accurate counts, use tiktoken or the OpenAI tokenizer.
 */

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
 * const tokens = estimateTokens("Hello, world!");
 * // Returns approximately 3-4 tokens
 */
export function estimateTokens(text: string, modelKey?: string): number {
  if (!text) return 0;
  
  const charsPerToken = getCharsPerToken(modelKey);
  return Math.ceil(text.length / charsPerToken);
}

/**
 * Estimate tokens for multiple texts
 * 
 * @param texts - Array of texts
 * @param modelKey - Optional model key
 * @returns Total estimated tokens
 */
export function estimateTokensForTexts(texts: string[], modelKey?: string): number {
  return texts.reduce((total, text) => total + estimateTokens(text, modelKey), 0);
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
export function estimateTokensForMessages(
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

// ============================================================================
// TOKEN LIMITS
// ============================================================================

/**
 * Known context window sizes for popular models
 */
export const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  // OpenAI
  'gpt-4o': 128000,
  'gpt-4o-mini': 128000,
  'gpt-4-turbo': 128000,
  'gpt-4': 8192,
  'gpt-3.5-turbo': 16385,
  
  // Ollama models (common sizes)
  'llama3.2': 128000,
  'llama3.1': 128000,
  'llama3': 8192,
  'llama2': 4096,
  'mistral': 32768,
  'mixtral': 32768,
  'qwen2.5': 32768,
  
  // Embeddings
  'text-embedding-3-small': 8191,
  'text-embedding-3-large': 8191,
  'text-embedding-ada-002': 8191,
  'nomic-embed-text': 8192,
  'mxbai-embed-large': 512,
};

/**
 * Get context window size for a model
 * 
 * @param modelKey - Model key
 * @returns Context window size in tokens, or undefined if unknown
 */
export function getContextWindowSize(modelKey: string): number | undefined {
  // Exact match first
  if (modelKey in MODEL_CONTEXT_WINDOWS) {
    return MODEL_CONTEXT_WINDOWS[modelKey];
  }
  
  // Try prefix match
  const lowerKey = modelKey.toLowerCase();
  for (const [model, size] of Object.entries(MODEL_CONTEXT_WINDOWS)) {
    if (lowerKey.startsWith(model.toLowerCase())) {
      return size;
    }
  }
  
  return undefined;
}

/**
 * Check if input fits within model's context window
 * 
 * @param inputTokens - Estimated input tokens
 * @param outputTokens - Expected output tokens
 * @param modelKey - Model key
 * @returns True if input + output fits within context window
 */
export function fitsInContextWindow(
  inputTokens: number,
  outputTokens: number,
  modelKey: string
): boolean {
  const contextWindow = getContextWindowSize(modelKey);
  
  if (!contextWindow) {
    // Unknown model, assume it fits
    return true;
  }
  
  return inputTokens + outputTokens <= contextWindow;
}

/**
 * Calculate max output tokens given input
 * 
 * @param inputTokens - Estimated input tokens
 * @param modelKey - Model key
 * @param reserveTokens - Tokens to reserve (default: 100)
 * @returns Maximum output tokens, or undefined if unknown
 */
export function getMaxOutputTokens(
  inputTokens: number,
  modelKey: string,
  reserveTokens: number = 100
): number | undefined {
  const contextWindow = getContextWindowSize(modelKey);
  
  if (!contextWindow) {
    return undefined;
  }
  
  const available = contextWindow - inputTokens - reserveTokens;
  return Math.max(0, available);
}

// ============================================================================
// TEXT CHUNKING
// ============================================================================

/**
 * Options for text chunking
 */
export interface ChunkOptions {
  /** Maximum tokens per chunk */
  maxTokens: number;
  /** Overlap between chunks in tokens */
  overlapTokens?: number;
  /** Model key for token estimation */
  modelKey?: string;
}

/**
 * Chunk text into smaller pieces that fit within token limits
 * 
 * @param text - Text to chunk
 * @param options - Chunking options
 * @returns Array of text chunks
 * 
 * @example
 * const chunks = chunkText(longDocument, { maxTokens: 500 });
 */
export function chunkText(text: string, options: ChunkOptions): string[] {
  const { maxTokens, overlapTokens = 0, modelKey } = options;
  
  const charsPerToken = getCharsPerToken(modelKey);
  const maxChars = maxTokens * charsPerToken;
  const overlapChars = overlapTokens * charsPerToken;
  
  if (text.length <= maxChars) {
    return [text];
  }
  
  const chunks: string[] = [];
  let start = 0;
  
  while (start < text.length) {
    let end = Math.min(start + maxChars, text.length);
    
    // Try to break at a sentence or paragraph boundary
    if (end < text.length) {
      // Look for sentence end within last 20% of chunk
      const searchStart = Math.floor(end - maxChars * 0.2);
      const searchRegion = text.substring(searchStart, end);
      
      // Find last sentence boundary
      const sentenceEndMatch = searchRegion.match(/[.!?]\s+(?=[A-Z])/g);
      if (sentenceEndMatch) {
        const lastMatch = sentenceEndMatch[sentenceEndMatch.length - 1];
        const matchIndex = searchRegion.lastIndexOf(lastMatch);
        if (matchIndex !== -1) {
          end = searchStart + matchIndex + lastMatch.length - 1;
        }
      }
    }
    
    chunks.push(text.substring(start, end).trim());
    
    // Move start with overlap
    start = end - overlapChars;
    if (start >= text.length) break;
  }
  
  return chunks;
}

/**
 * Chunk texts while keeping each text as a unit (no splitting within texts)
 * 
 * Groups texts into batches that fit within token limits.
 * 
 * @param texts - Array of texts
 * @param maxTokensPerBatch - Maximum tokens per batch
 * @param modelKey - Model key for estimation
 * @returns Array of text batches
 */
export function batchTextsByTokens(
  texts: string[],
  maxTokensPerBatch: number,
  modelKey?: string
): string[][] {
  const batches: string[][] = [];
  let currentBatch: string[] = [];
  let currentTokens = 0;
  
  for (const text of texts) {
    const textTokens = estimateTokens(text, modelKey);
    
    // If single text exceeds limit, put it in its own batch
    if (textTokens > maxTokensPerBatch) {
      if (currentBatch.length > 0) {
        batches.push(currentBatch);
        currentBatch = [];
        currentTokens = 0;
      }
      batches.push([text]);
      continue;
    }
    
    // Check if adding this text would exceed limit
    if (currentTokens + textTokens > maxTokensPerBatch) {
      batches.push(currentBatch);
      currentBatch = [text];
      currentTokens = textTokens;
    } else {
      currentBatch.push(text);
      currentTokens += textTokens;
    }
  }
  
  // Don't forget the last batch
  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }
  
  return batches;
}