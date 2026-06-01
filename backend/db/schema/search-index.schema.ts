// db/schema/search-index.schema.ts

/**
 * Search Index Schema
 * Defines the search_index table and related types
 * 
 * NOTE: This table focuses on INDEX DEFINITION and ES SETTINGS
 * Search behavior (searchable fields, boosts) lives in search_configurations
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
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { aiProviders, aiProviderModels } from './ai-providers.schema';
import { AnalyzerConfig } from '@/shared/constants/search-index.constants';


// ============================================================================
// SEARCH INDEX TABLE
// ============================================================================

export const searchIndex = pgTable('search_index', {
  // ============================================================================
  // IDENTITY
  // ============================================================================
  id: uuid('id').primaryKey().defaultRandom(),

  /**
   * ES-compatible index name: lowercase, no spaces, used as actual ES index name
   * Validated to match: /^[a-z][a-z0-9_-]*$/
   */
  name: varchar('name', { length: 128 }).notNull().unique(),

  /**
   * Human-friendly display name for UI
   */
  displayName: varchar('display_name', { length: 255 }).notNull(),

  description: text('description'),

  // ============================================================================
  // DATA TEMPLATE LINKAGE (legacy — nullable, FK removed)
  // ============================================================================
  dataTemplateId: bigint('data_template_id', { mode: 'number' }),

  // ============================================================================
  // SEARCH TYPE & STRATEGY
  // ============================================================================
  searchType: varchar('search_type', { length: 20 }).notNull(), // 'lexical' | 'semantic' | 'hybrid'
  indexingStrategy: varchar('indexing_strategy', { length: 20 }).notNull().default('on_upload'),

  // ============================================================================
  // SEARCH PROVIDER (set at creation time, immutable)
  // ============================================================================
  searchProvider: varchar('search_provider', { length: 30 }).notNull().default('elasticsearch'),

  /**
   * Provider-specific index settings stored as JSON.
   * Each provider stores different settings:
   *   ES: { numberOfShards, numberOfReplicas, refreshInterval }
   *   Azure: { vectorSearchAlgorithm, semanticConfigName }
   *
   * Replaces the individual ES-specific columns below (kept for backward compat).
   */
  providerSettings: json('provider_settings').$type<Record<string, unknown>>().default({}),

  // ============================================================================
  // ELASTICSEARCH INDEX SETTINGS (DEPRECATED — use providerSettings)
  // Kept for backward compatibility with existing data.
  // ============================================================================
  numberOfShards: integer('number_of_shards').notNull().default(1),
  numberOfReplicas: integer('number_of_replicas').notNull().default(0),
  refreshInterval: varchar('refresh_interval', { length: 20 }).notNull().default('1s'),

  // ============================================================================
  // TEXT ANALYSIS CONFIGURATION
  // ============================================================================
  language: varchar('language', { length: 20 }).notNull().default('english'),
  synonyms: json('synonyms').$type<string[]>().default([]),
  stopWords: json('stop_words').$type<string[]>().default([]),
  analyzerConfig: json('analyzer_config').$type<AnalyzerConfig>().default({}),

  // ============================================================================
  // AI / EMBEDDING CONFIGURATION (for semantic/hybrid)
  // ============================================================================
  aiProviderId: uuid('ai_provider_id')
    .references(() => aiProviders.id, { onDelete: 'set null' }),
  aiModelId: bigint('ai_model_id', { mode: 'number' })
    .references(() => aiProviderModels.id, { onDelete: 'set null' }),
  embeddingDimensions: integer('embedding_dimensions'),
  vectorSimilarity: varchar('vector_similarity', { length: 20 }).default('cosine'),

  // ============================================================================
  // HYBRID SEARCH RRF CONFIGURATION
  // ============================================================================
  rrfRankConstant: integer('rrf_rank_constant').notNull().default(60),
  rrfWindowSize: integer('rrf_window_size').notNull().default(100),

  // ============================================================================
  // STATE TRACKING
  // ============================================================================
  status: varchar('status', { length: 20 }).notNull().default('creating'),
  documentCount: integer('document_count').notNull().default(0),
  indexSizeBytes: bigint('index_size_bytes', { mode: 'number' }).default(0),
  lastIndexedAt: timestamp('last_indexed_at'),

  // ============================================================================
  // MAPPING VERSION TRACKING
  // For detecting when ES mapping needs sync
  // ============================================================================
  mappingVersion: integer('mapping_version').notNull().default(1),
  lastMappingSyncedAt: timestamp('last_mapping_synced_at'),
  requiresReindex: boolean('requires_reindex').notNull().default(false),

  // ============================================================================
  // STATUS FLAGS
  // ============================================================================
  isActive: boolean('is_active').notNull().default(true),

  // ============================================================================
  // AUDIT
  // ============================================================================
  createdBy: uuid('created_by'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  updatedBy: uuid('updated_by'),

}, (table) => ({
  nameIdx: index('search_index_name_idx').on(table.name),
  searchTypeIdx: index('search_index_search_type_idx').on(table.searchType),
  statusIdx: index('search_index_status_idx').on(table.status),
  isActiveIdx: index('search_index_is_active_idx').on(table.isActive),
}));

// ============================================================================
// RELATIONS
// ============================================================================

export const searchIndexRelations = relations(searchIndex, ({ one, many }) => ({
  aiProvider: one(aiProviders, {
    fields: [searchIndex.aiProviderId],
    references: [aiProviders.id],
  }),
  aiModel: one(aiProviderModels, {
    fields: [searchIndex.aiModelId],
    references: [aiProviderModels.id],
  }),
  // fieldMappings relation will be added after index-field-mappings.schema.ts
}));

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type SearchIndex = typeof searchIndex.$inferSelect;
export type NewSearchIndex = typeof searchIndex.$inferInsert;