// db/analytics-schema/ai-usage-analytics.schema.ts

/**
 * AI USAGE ANALYTICS SCHEMA
 * ------------------------------------------------------------------------
 * Tracks all AI service operations (text generation, chat, embeddings)
 * for analytics, cost tracking, and performance monitoring.
 * 
 * DATABASE: Analytics DB (separate from main app DB)
 * CONFIG: drizzle.analytics.config.ts
 * ------------------------------------------------------------------------
 */

import {
  pgTable,
  varchar,
  timestamp,
  json,
  uuid,
  boolean,
  integer,
  text,
  real,
  index,
  bigint,
} from 'drizzle-orm/pg-core';
import { InferSelectModel, InferInsertModel } from 'drizzle-orm';

// ============================================================================
// AI USAGE EVENTS TABLE
// ============================================================================

/**
 * AI Usage Events
 * Records every AI operation for detailed analytics and debugging
 */
export const aiUsageEvents = pgTable('ai_usage_events', {
  // --- Primary Key & Event Metadata ---
  id: uuid('id').primaryKey().notNull().defaultRandom(),
  requestId: uuid('request_id').notNull().unique(), // Correlate with application logs
  
  // --- Timing ---
  timestamp: timestamp('timestamp', { withTimezone: true }).notNull().defaultNow(),
  
  // --- Operation Type ---
  operation: varchar('operation', { length: 20 }).notNull(), // 'text', 'chat', 'embedding'
  
  // --- Provider & Model ---
  providerId: uuid('provider_id').notNull(),
  providerKey: varchar('provider_key', { length: 50 }).notNull(), // 'openai', 'ollama'
  modelId: bigint('model_id', { mode: 'number' }),
  modelKey: varchar('model_key', { length: 100 }).notNull(), // 'gpt-4o', 'llama3.2'
  
  // --- Token Usage ---
  inputTokens: integer('input_tokens').default(0),
  outputTokens: integer('output_tokens').default(0),
  totalTokens: integer('total_tokens').default(0),
  
  // --- For Embeddings ---
  embeddingDimensions: integer('embedding_dimensions'),
  batchSize: integer('batch_size'), // Number of texts in embedding batch
  
  // --- Performance ---
  durationMs: integer('duration_ms').notNull(),
  timeToFirstToken: integer('time_to_first_token'), // For streaming operations
  
  // --- Status ---
  success: boolean('success').notNull(),
  errorCode: varchar('error_code', { length: 50 }),
  errorMessage: text('error_message'),
  
  // --- Source Context ---
  source: varchar('source', { length: 20 }).notNull().default('api'), // 'api', 'playground', 'admin_test'

  // --- Request Context ---
  userId: varchar('user_id', { length: 255 }),
  sessionId: varchar('session_id', { length: 255 }),
  feature: varchar('feature', { length: 100 }), // 'search_indexing', 'chat', 'api'
  
  // --- Request Details (for debugging) ---
  requestMetadata: json('request_metadata').$type<{
    maxTokens?: number;
    temperature?: number;
    systemPromptLength?: number;
    messageCount?: number;
    streaming?: boolean;
    [key: string]: unknown;
  }>(),
  
  // --- Cost Estimation (optional, for cloud providers) ---
  estimatedCostUsd: real('estimated_cost_usd'),
  
  // --- System Metadata ---
  version: varchar('version', { length: 50 }).notNull().default('1.0.0'),
  environment: varchar('environment', { length: 50 }).notNull().default('production'),
  
  // --- Timestamps ---
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  // Performance indexes
  timestampIdx: index('idx_ai_usage_timestamp').on(table.timestamp),
  operationIdx: index('idx_ai_usage_operation').on(table.operation),
  providerKeyIdx: index('idx_ai_usage_provider_key').on(table.providerKey),
  modelKeyIdx: index('idx_ai_usage_model_key').on(table.modelKey),
  userIdIdx: index('idx_ai_usage_user_id').on(table.userId),
  featureIdx: index('idx_ai_usage_feature').on(table.feature),
  sourceIdx: index('idx_ai_usage_source').on(table.source),
  successIdx: index('idx_ai_usage_success').on(table.success),
  
  // Composite indexes for common queries
  providerTimestampIdx: index('idx_ai_usage_provider_timestamp').on(table.providerKey, table.timestamp),
  operationTimestampIdx: index('idx_ai_usage_operation_timestamp').on(table.operation, table.timestamp),
  userTimestampIdx: index('idx_ai_usage_user_timestamp').on(table.userId, table.timestamp),
}));

export type AIUsageEvent = InferSelectModel<typeof aiUsageEvents>;
export type InsertAIUsageEvent = InferInsertModel<typeof aiUsageEvents>;

// ============================================================================
// AI USAGE SUMMARY TABLE
// ============================================================================

/**
 * AI Usage Summary
 * Pre-aggregated AI usage data for fast dashboard queries
 * Updated periodically via background jobs
 */
export const aiUsageSummary = pgTable('ai_usage_summary', {
  id: uuid('id').primaryKey().notNull().defaultRandom(),
  
  // --- Time & Grouping ---
  timeBucket: timestamp('time_bucket', { withTimezone: true }).notNull(),
  granularity: varchar('granularity', { length: 20 }).notNull(), // 'hour', 'day', 'week', 'month'
  
  // --- Dimensions ---
  providerKey: varchar('provider_key', { length: 50 }),
  modelKey: varchar('model_key', { length: 100 }),
  operation: varchar('operation', { length: 20 }),
  feature: varchar('feature', { length: 100 }),
  
  // --- Request Counts ---
  totalRequests: integer('total_requests').notNull().default(0),
  successfulRequests: integer('successful_requests').notNull().default(0),
  failedRequests: integer('failed_requests').notNull().default(0),
  
  // --- Token Metrics ---
  totalInputTokens: bigint('total_input_tokens', { mode: 'number' }).default(0),
  totalOutputTokens: bigint('total_output_tokens', { mode: 'number' }).default(0),
  totalTokens: bigint('total_tokens', { mode: 'number' }).default(0),
  avgInputTokens: real('avg_input_tokens'),
  avgOutputTokens: real('avg_output_tokens'),
  
  // --- Performance Metrics ---
  avgDurationMs: real('avg_duration_ms'),
  minDurationMs: integer('min_duration_ms'),
  maxDurationMs: integer('max_duration_ms'),
  p95DurationMs: integer('p95_duration_ms'),
  
  // --- Cost Metrics ---
  totalEstimatedCostUsd: real('total_estimated_cost_usd'),
  
  // --- Embedding-specific ---
  totalEmbeddingBatches: integer('total_embedding_batches').default(0),
  totalTextsEmbedded: integer('total_texts_embedded').default(0),
  
  // --- Timestamps ---
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  timeBucketIdx: index('idx_ai_summary_time_bucket').on(table.timeBucket),
  granularityIdx: index('idx_ai_summary_granularity').on(table.granularity),
  providerKeyIdx: index('idx_ai_summary_provider_key').on(table.providerKey),
  modelKeyIdx: index('idx_ai_summary_model_key').on(table.modelKey),
  operationIdx: index('idx_ai_summary_operation').on(table.operation),
  featureIdx: index('idx_ai_summary_feature').on(table.feature),
  
  // Composite indexes for dashboard queries
  timeBucketGranularityIdx: index('idx_ai_summary_time_granularity').on(table.timeBucket, table.granularity),
  providerOperationIdx: index('idx_ai_summary_provider_operation').on(table.providerKey, table.operation),
}));

export type AIUsageSummary = InferSelectModel<typeof aiUsageSummary>;
export type InsertAIUsageSummary = InferInsertModel<typeof aiUsageSummary>;

// ============================================================================
// PROVIDER HEALTH TABLE
// ============================================================================

/**
 * Provider Health
 * Tracks provider availability and performance for circuit breaker
 */
export const providerHealth = pgTable('provider_health', {
  id: uuid('id').primaryKey().notNull().defaultRandom(),
  
  // --- Provider ---
  providerId: uuid('provider_id').notNull(),
  providerKey: varchar('provider_key', { length: 50 }).notNull(),
  
  // --- Health Window (e.g., last 5 minutes) ---
  windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
  windowEnd: timestamp('window_end', { withTimezone: true }).notNull(),
  
  // --- Metrics ---
  totalRequests: integer('total_requests').notNull().default(0),
  successfulRequests: integer('successful_requests').notNull().default(0),
  failedRequests: integer('failed_requests').notNull().default(0),
  consecutiveFailures: integer('consecutive_failures').notNull().default(0),
  
  // --- Circuit Breaker State ---
  circuitState: varchar('circuit_state', { length: 20 }).notNull().default('closed'), // 'closed', 'open', 'half-open'
  circuitOpenedAt: timestamp('circuit_opened_at', { withTimezone: true }),
  circuitClosedAt: timestamp('circuit_closed_at', { withTimezone: true }),
  
  // --- Performance ---
  avgResponseTimeMs: real('avg_response_time_ms'),
  errorRate: real('error_rate'), // Percentage (0-100)
  
  // --- Last Error ---
  lastErrorCode: varchar('last_error_code', { length: 50 }),
  lastErrorMessage: text('last_error_message'),
  lastErrorAt: timestamp('last_error_at', { withTimezone: true }),
  
  // --- Timestamps ---
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  providerIdIdx: index('idx_provider_health_provider_id').on(table.providerId),
  providerKeyIdx: index('idx_provider_health_provider_key').on(table.providerKey),
  windowStartIdx: index('idx_provider_health_window_start').on(table.windowStart),
  circuitStateIdx: index('idx_provider_health_circuit_state').on(table.circuitState),
}));

export type ProviderHealth = InferSelectModel<typeof providerHealth>;
export type InsertProviderHealth = InferInsertModel<typeof providerHealth>;