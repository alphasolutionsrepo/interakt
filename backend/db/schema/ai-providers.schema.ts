// db/schema/ai-providers.schema.ts

/**
 * AI Providers Schema
 * Tables: ai_providers, ai_provider_models, system_defaults
 * 
 * This schema manages AI provider configurations, their models,
 * and system-wide default selections.
 * 
 * NOTE: Relations are defined in index.ts to avoid circular import issues
 */

import {
  pgTable,
  uuid,
  bigint,
  varchar,
  text,
  timestamp,
  boolean,
  integer,
  json,
  index,
  unique,
  real,
} from 'drizzle-orm/pg-core';
import {
  aiModelTypeEnum,
  aiAuthTypeEnum,
  aiProviderTypeEnum,
} from './enums.schema';

// ============================================================================
// TYPES FOR JSON FIELDS
// ============================================================================

/**
 * Provider-specific settings stored as JSON
 * Different providers may have different configuration options
 */
export interface AIProviderSettings {
  // OpenAI specific
  organizationId?: string;

  // Ollama specific
  keepAlive?: string; // e.g., "5m"

  // Common
  timeout?: number; // Request timeout in ms
  maxRetries?: number;

  // Future extensibility
  [key: string]: unknown;
}

/**
 * Model capabilities stored as JSON
 */
export interface AIModelCapabilities {
  maxTokens?: number;
  contextWindow?: number;
  supportsStreaming?: boolean;
  supportsJsonMode?: boolean;
  supportsFunctionCalling?: boolean;
  supportsVision?: boolean;

  /**
   * OpenAI-specific: newer models (o1, o3, etc.) use max_completion_tokens
   * instead of max_tokens. Set to true for these models.
   */
  usesCompletionTokens?: boolean;

  /**
   * OpenAI-specific: newer reasoning models (o1, o3, etc.) don't support
   * temperature parameter. Set to true to skip sending temperature.
   */
  noTemperature?: boolean;

  // Future extensibility
  [key: string]: unknown;
}

// ============================================================================
// AI PROVIDERS TABLE
// ============================================================================

/**
 * AI Provider configurations
 * Stores connection details and authentication for each AI provider
 */
export const aiProviders = pgTable('ai_providers', {
  // Primary key
  id: uuid('id').primaryKey().notNull().defaultRandom(),

  // Provider identification
  providerKey: varchar('provider_key', { length: 50 }).notNull().unique(),
  displayName: varchar('display_name', { length: 100 }).notNull(),
  description: text('description'),

  // Provider type and authentication
  providerType: aiProviderTypeEnum('provider_type').notNull(),
  authType: aiAuthTypeEnum('auth_type').notNull(),

  // Connection configuration
  baseUrl: varchar('base_url', { length: 500 }).notNull(),
  apiKey: varchar('api_key', { length: 500 }), // Nullable - only for cloud providers

  // Status
  isEnabled: boolean('is_enabled').default(true).notNull(),

  // Provider-specific settings (JSON)
  settings: json('settings').$type<AIProviderSettings>().default({}),

  // Metadata
  lastConnectionCheck: timestamp('last_connection_check'),
  lastConnectionStatus: varchar('last_connection_status', { length: 100 }),

  // Timestamps
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('ai_providers_provider_key_idx').on(table.providerKey),
  index('ai_providers_is_enabled_idx').on(table.isEnabled),
]);

// ============================================================================
// AI PROVIDER MODELS TABLE
// ============================================================================

/**
 * AI Provider Models
 * Stores available models for each provider
 */
export const aiProviderModels = pgTable('ai_provider_models', {
  // Primary key
  id: bigint('id', { mode: 'number' }).primaryKey().generatedByDefaultAsIdentity(),

  // Foreign key to provider
  providerId: uuid('provider_id')
    .notNull()
    .references(() => aiProviders.id, { onDelete: 'cascade' }),

  // Model identification
  modelKey: varchar('model_key', { length: 100 }).notNull(),
  displayName: varchar('display_name', { length: 150 }).notNull(),
  description: text('description'),

  // Model type
  modelType: aiModelTypeEnum('model_type').notNull(),

  // Embedding-specific
  dimensions: integer('dimensions'), // Vector dimensions for embedding models

  // Capabilities (JSON)
  capabilities: json('capabilities').$type<AIModelCapabilities>().default({}),

  // Status
  isAvailable: boolean('is_available').default(true).notNull(),
  isDiscovered: boolean('is_discovered').default(false).notNull(),

  // Display ordering
  sortOrder: integer('sort_order').default(0).notNull(),

  // Pricing (admin-configured, nullable - null means not configured)
  // Used for estimated cost calculations in analytics
  inputCostPerMillionTokens: real('input_cost_per_million_tokens'), // USD per 1M input tokens
  outputCostPerMillionTokens: real('output_cost_per_million_tokens'), // USD per 1M output tokens

  // Timestamps
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('ai_provider_models_provider_id_idx').on(table.providerId),
  index('ai_provider_models_model_type_idx').on(table.modelType),
  index('ai_provider_models_is_available_idx').on(table.isAvailable),
  unique('ai_provider_models_provider_model_key').on(table.providerId, table.modelKey),
]);

// ============================================================================
// SYSTEM DEFAULTS TABLE (Single Row)
// ============================================================================

/**
 * System-wide default AI settings
 * Single row table for global defaults
 */
export const systemDefaults = pgTable('system_defaults', {
  // Primary key (single row - always id=1)
  id: bigint('id', { mode: 'number' }).primaryKey().generatedByDefaultAsIdentity(),

  // ============================================================================
  // AI Provider Defaults
  // ============================================================================

  // Text Generation defaults
  defaultTextProviderId: uuid('default_text_provider_id')
    .references(() => aiProviders.id, { onDelete: 'set null' }),
  defaultTextModelId: bigint('default_text_model_id', { mode: 'number' })
    .references(() => aiProviderModels.id, { onDelete: 'set null' }),

  // Embedding defaults
  defaultEmbeddingProviderId: uuid('default_embedding_provider_id')
    .references(() => aiProviders.id, { onDelete: 'set null' }),
  defaultEmbeddingModelId: bigint('default_embedding_model_id', { mode: 'number' })
    .references(() => aiProviderModels.id, { onDelete: 'set null' }),

  // Chat defaults
  defaultChatProviderId: uuid('default_chat_provider_id')
    .references(() => aiProviders.id, { onDelete: 'set null' }),
  defaultChatModelId: bigint('default_chat_model_id', { mode: 'number' })
    .references(() => aiProviderModels.id, { onDelete: 'set null' }),

  // ============================================================================
  // Timestamps
  // ============================================================================
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ============================================================================
// TYPE EXPORTS
// ============================================================================

// AI Providers
export type AIProvider = typeof aiProviders.$inferSelect;
export type NewAIProvider = typeof aiProviders.$inferInsert;
export type UpdateAIProvider = Partial<Omit<NewAIProvider, 'id' | 'createdAt'>>;

// AI Provider Models
export type AIProviderModel = typeof aiProviderModels.$inferSelect;
export type NewAIProviderModel = typeof aiProviderModels.$inferInsert;
export type UpdateAIProviderModel = Partial<Omit<NewAIProviderModel, 'id' | 'createdAt'>>;

// System Defaults
export type SystemDefaults = typeof systemDefaults.$inferSelect;
export type NewSystemDefaults = typeof systemDefaults.$inferInsert;
export type UpdateSystemDefaults = Partial<Omit<NewSystemDefaults, 'id' | 'createdAt'>>;

// Provider with Models (for queries with joins)
export type AIProviderWithModels = AIProvider & {
  models: AIProviderModel[];
};

// System Defaults with resolved relations
export type SystemDefaultsWithDetails = SystemDefaults & {
  defaultTextProvider: AIProvider | null;
  defaultTextModel: AIProviderModel | null;
  defaultEmbeddingProvider: AIProvider | null;
  defaultEmbeddingModel: AIProviderModel | null;
  defaultChatProvider: AIProvider | null;
  defaultChatModel: AIProviderModel | null;
};