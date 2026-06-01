// src/features/ai-service/ai-service.validation.ts

/**
 * AI Service Feature - Validation Schemas
 * Zod schemas for validating service inputs
 */

import { z } from 'zod';
import type { CircuitBreakerConfig, RetryConfig } from './ai-service.types';

// ============================================================================
// COMMON SCHEMAS
// ============================================================================

/**
 * Base options schema (shared across all operations)
 */
export const aiServiceOptionsSchema = z.object({
  providerId: z.string().uuid().optional(),
  modelId: z.number().int().positive().optional(),
  providerKey: z.string().min(1).max(50).optional(),
  modelKey: z.string().min(1).max(100).optional(),
  timeout: z.number().int().positive().max(300000).optional(), // Max 5 minutes
  maxRetries: z.number().int().min(0).max(10).optional(),
  userId: z.string().max(255).optional(),
  sessionId: z.string().max(255).optional(),
  feature: z.string().max(100).optional(),
});

export type AIServiceOptionsInput = z.infer<typeof aiServiceOptionsSchema>;

// ============================================================================
// TEXT GENERATION SCHEMAS
// ============================================================================

export const textGenerationOptionsSchema = aiServiceOptionsSchema.extend({
  maxTokens: z.number().int().positive().max(128000).optional(),
  temperature: z.number().min(0).max(2).optional(),
  topP: z.number().min(0).max(1).optional(),
  stopSequences: z.array(z.string()).max(4).optional(),
  systemPrompt: z.string().max(100000).optional(),
});

export type TextGenerationOptionsInput = z.infer<typeof textGenerationOptionsSchema>;

export const textGenerationRequestSchema = z.object({
  prompt: z.string().min(1).max(1000000), // Allow large prompts
  maxTokens: z.number().int().positive().max(128000).optional(),
  temperature: z.number().min(0).max(2).optional(),
  topP: z.number().min(0).max(1).optional(),
  stopSequences: z.array(z.string()).max(4).optional(),
  systemPrompt: z.string().max(100000).optional(),
});

export type TextGenerationRequestInput = z.infer<typeof textGenerationRequestSchema>;

// ============================================================================
// CHAT SCHEMAS
// ============================================================================

export const chatMessageRoleSchema = z.enum(['system', 'user', 'assistant']);

export const chatMessageSchema = z.object({
  role: chatMessageRoleSchema,
  content: z.string().min(1).max(1000000),
  name: z.string().max(100).optional(),
});

export type ChatMessageInput = z.infer<typeof chatMessageSchema>;

export const chatOptionsSchema = aiServiceOptionsSchema.extend({
  maxTokens: z.number().int().positive().max(128000).optional(),
  temperature: z.number().min(0).max(2).optional(),
  topP: z.number().min(0).max(1).optional(),
  stopSequences: z.array(z.string()).max(4).optional(),
  stream: z.boolean().optional(),
});

export type ChatOptionsInput = z.infer<typeof chatOptionsSchema>;

export const chatRequestSchema = z.object({
  messages: z.array(chatMessageSchema).min(1).max(1000),
  maxTokens: z.number().int().positive().max(128000).optional(),
  temperature: z.number().min(0).max(2).optional(),
  topP: z.number().min(0).max(1).optional(),
  stopSequences: z.array(z.string()).max(4).optional(),
  stream: z.boolean().optional(),
});

export type ChatRequestInput = z.infer<typeof chatRequestSchema>;

// ============================================================================
// EMBEDDING SCHEMAS
// ============================================================================

export const embeddingOptionsSchema = aiServiceOptionsSchema.extend({
  dimensions: z.number().int().positive().max(4096).optional(),
  batchSize: z.number().int().positive().max(2048).default(100),
});

export type EmbeddingOptionsInput = z.infer<typeof embeddingOptionsSchema>;

export const embeddingRequestSchema = z.object({
  texts: z.array(z.string().min(1).max(100000)).min(1).max(10000),
  model: z.string().optional(),
});

export type EmbeddingRequestInput = z.infer<typeof embeddingRequestSchema>;

// Single text embedding (convenience)
export const singleEmbeddingRequestSchema = z.object({
  text: z.string().min(1).max(100000),
});

export type SingleEmbeddingRequestInput = z.infer<typeof singleEmbeddingRequestSchema>;

// ============================================================================
// CIRCUIT BREAKER SCHEMAS
// ============================================================================

export const circuitBreakerConfigSchema = z.object({
  failureThreshold: z.number().int().positive().default(5),
  resetTimeout: z.number().int().positive().default(30000), // 30 seconds
  successThreshold: z.number().int().positive().default(2),
  windowSize: z.number().int().positive().default(60000), // 1 minute
});

export type CircuitBreakerConfigInput = z.infer<typeof circuitBreakerConfigSchema>;

// ============================================================================
// RETRY SCHEMAS
// ============================================================================

export const retryConfigSchema = z.object({
  maxRetries: z.number().int().min(0).max(10).default(3),
  baseDelay: z.number().int().positive().default(1000), // 1 second
  maxDelay: z.number().int().positive().default(30000), // 30 seconds
  backoffMultiplier: z.number().positive().default(2),
  jitter: z.boolean().default(true),
});

export type RetryConfigInput = z.infer<typeof retryConfigSchema>;

// ============================================================================
// DEFAULTS
// ============================================================================

export const AI_SERVICE_DEFAULTS = {
  timeout: 60000, // 1 minute
  maxRetries: 3,
  temperature: 0.7,
  maxTokens: 4096,
  embeddingBatchSize: 100,
} as const;

/**
 * Circuit breaker default configuration
 * Explicitly typed to match CircuitBreakerConfig interface
 */
export const CIRCUIT_BREAKER_DEFAULTS: CircuitBreakerConfig = {
  failureThreshold: 5,
  resetTimeout: 30000, // 30 seconds
  successThreshold: 2,
  windowSize: 60000, // 1 minute
};

/**
 * Retry default configuration
 * Explicitly typed to match RetryConfig interface
 */
export const RETRY_DEFAULTS: RetryConfig = {
  maxRetries: 3,
  baseDelay: 1000, // 1 second
  maxDelay: 30000, // 30 seconds
  backoffMultiplier: 2,
  jitter: true,
};