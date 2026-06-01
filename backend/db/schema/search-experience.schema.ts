// db/schema/search-experience.schema.ts

/**
 * Search Experience Schema
 *
 * Unified configuration for search and AI summary capabilities.
 * Each experience can connect to one or more search indexes.
 */

import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  json,
  integer,
  real,
  timestamp,
  index,
  unique,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { searchIndex } from './search-index.schema';

// ============================================================================
// TYPE DEFINITIONS FOR JSON COLUMNS
// ============================================================================

/**
 * Hybrid search tuning configuration
 * Controls how lexical and semantic search results are combined
 */
export interface SearchExperienceHybridConfig {
  /**
   * Weight for lexical (keyword/term) search results.
   * Higher values favor exact text matches.
   * Default: 1.0, Range: 0.1 - 3.0
   */
  lexicalWeight?: number;
  /**
   * Weight for semantic (vector/embedding) search results.
   * Higher values favor conceptually similar results.
   * Default: 1.0, Range: 0.1 - 3.0
   */
  semanticWeight?: number;
  /**
   * RRF rank constant (k parameter).
   * Higher values reduce the impact of high-ranked documents.
   * Default: 60, Range: 1 - 1000
   */
  rrfRankConstant?: number;
  /**
   * Window size - how many results to consider from each search type.
   * Default: 100, Range: 10 - 500
   */
  rrfWindowSize?: number;
}

/**
 * Search configuration settings
 */
export interface SearchExperienceSearchConfig {
  /** Default number of results per page */
  defaultPageSize: number;
  /** Maximum allowed page size */
  maxPageSize: number;
  /** Enable search result highlighting (highlights all searchable fields) */
  enableHighlighting: boolean;
  /** Enable faceted search (facets are determined by fields with isFacetable=true in the search index) */
  enableFacets: boolean;
  /** Multi-index search strategy */
  multiIndexStrategy: 'auto' | 'all' | 'primary_only';
  /** How to merge results from multiple indexes */
  resultMergeStrategy: 'interleave' | 'grouped' | 'scored';
  /** Maximum indexes to search in parallel */
  maxIndexesPerQuery: number;
  /** Autocomplete/suggestions configuration */
  autocomplete: SearchExperienceAutocompleteConfig;
  /**
   * Hybrid search tuning configuration.
   * Allows fine-tuning of lexical vs semantic balance without reindexing.
   * If not set, uses index-level defaults.
   */
  hybridConfig?: SearchExperienceHybridConfig;
  /**
   * Override the search type for this experience.
   * Must be compatible with the index's capabilities:
   * - 'lexical': Always available - keyword matching only
   * - 'semantic': Requires index with embeddings - vector similarity only
   * - 'hybrid': Requires index with embeddings - combines lexical + semantic
   * - 'auto': Use index's configured search type (default)
   */
  defaultSearchType?: 'lexical' | 'semantic' | 'hybrid' | 'auto';
}

/**
 * Autocomplete/suggestions configuration
 */
export interface SearchExperienceAutocompleteConfig {
  /** Enable autocomplete suggestions */
  enabled: boolean;
  /** Minimum characters before showing suggestions (2-5) */
  minLength: number;
  /** Maximum number of suggestions to show (3-15) */
  maxSuggestions: number;
  /** Debounce delay in milliseconds (50-500) */
  debounceMs: number;
}

/**
 * AI summary configuration
 */
export interface SearchExperienceAISummaryConfig {
  /** Enable summary generation */
  enabled: boolean;
  /** Max search results to include when generating summary. Lower = faster/cheaper, higher = more comprehensive. */
  maxResultsForContext: number;
  /**
   * Custom instructions for summary generation (tone, focus areas).
   * These are ADDED to the core summary instructions, not replacing them.
   *
   * Example: "Focus on pricing and availability. Be concise."
   */
  customInstructions?: string;
  /** Max tokens for summary response */
  maxTokens?: number;
}

/**
 * AI configuration settings
 */
export interface SearchExperienceAIConfig {
  /** Enable AI features */
  enabled: boolean;
  /** AI provider ID (null = system default) */
  providerId: string | null;
  /** AI model ID (null = system default) */
  modelId: number | null;
  /** Summary generation settings */
  summary: SearchExperienceAISummaryConfig;
}

/**
 * Tools configuration
 */
export interface SearchExperienceToolsConfig {
  /** Enabled tool names */
  enabled: string[];
  /** Tool-specific settings */
  settings: Record<string, unknown>;
}

/**
 * Rate limiting configuration
 */
export interface SearchExperienceRateLimitConfig {
  /** Max search requests per minute */
  searchPerMinute: number;
  /** Max chat messages per minute */
  chatPerMinute: number;
  /** Max requests per day (optional) */
  requestsPerDay?: number;
}

/**
 * Display field configuration for search results
 */
export interface SearchExperienceDisplayField {
  /** Field name from the index */
  fieldName: string;
  /** Role determines how the field is displayed in the UI */
  role: 'title' | 'subtitle' | 'description' | 'image' | 'price' | 'badge' | 'secondary' | 'link';
  /** Optional label override (defaults to field's displayName) */
  label?: string;
  /** Display order (lower = first) */
  order: number;
}

/**
 * Display configuration for search results presentation
 * Controls how search results are rendered in the frontend
 */
export interface SearchExperienceDisplayConfig {
  /** Fields to display in search results, with their roles */
  displayFields: SearchExperienceDisplayField[];
  /** Layout preferences */
  layout?: {
    /** Show relevance score in results */
    showScore?: boolean;
    /** Show highlighted matches */
    showHighlights?: boolean;
  };
}

// ============================================================================
// SEARCH EXPERIENCES TABLE
// ============================================================================

export const searchExperiences = pgTable('search_experiences', {
  // ═══════════════════════════════════════════════════════════════════════════
  // IDENTITY
  // ═══════════════════════════════════════════════════════════════════════════
  id: uuid('id').primaryKey().defaultRandom(),

  /** Human-friendly name */
  name: varchar('name', { length: 255 }).notNull(),

  /** URL-friendly identifier, unique */
  slug: varchar('slug', { length: 100 }).notNull().unique(),

  /** Optional description */
  description: text('description'),

  // ═══════════════════════════════════════════════════════════════════════════
  // SEARCH CONFIGURATION
  // ═══════════════════════════════════════════════════════════════════════════
  searchConfig: json('search_config').$type<SearchExperienceSearchConfig>().notNull(),

  // ═══════════════════════════════════════════════════════════════════════════
  // AI CONFIGURATION
  // ═══════════════════════════════════════════════════════════════════════════
  aiConfig: json('ai_config').$type<SearchExperienceAIConfig>().notNull(),

  // ═══════════════════════════════════════════════════════════════════════════
  // TOOLS CONFIGURATION
  // ═══════════════════════════════════════════════════════════════════════════
  toolsConfig: json('tools_config').$type<SearchExperienceToolsConfig>().notNull(),

  // ═══════════════════════════════════════════════════════════════════════════
  // ACCESS CONTROL
  // ═══════════════════════════════════════════════════════════════════════════
  /** Access token for public API authentication */
  accessToken: uuid('access_token').defaultRandom().unique().notNull(),

  /** Allowed CORS origins (empty array = allow all) */
  allowedOrigins: json('allowed_origins').$type<string[]>().default([]),

  /** Rate limiting settings */
  rateLimitConfig: json('rate_limit_config').$type<SearchExperienceRateLimitConfig>(),

  // ═══════════════════════════════════════════════════════════════════════════
  // DISPLAY CONFIGURATION
  // ═══════════════════════════════════════════════════════════════════════════
  /** Display configuration for search results presentation */
  displayConfig: json('display_config').$type<SearchExperienceDisplayConfig>(),

  // ═══════════════════════════════════════════════════════════════════════════
  // STATUS
  // ═══════════════════════════════════════════════════════════════════════════
  isActive: boolean('is_active').default(true).notNull(),

  /** Telemetry detail level: 'off' | 'metadata' | 'full' */
  telemetryDetailLevel: text('telemetry_detail_level').$type<'off' | 'metadata' | 'full'>().default('off').notNull(),

  // ═══════════════════════════════════════════════════════════════════════════
  // AUDIT
  // ═══════════════════════════════════════════════════════════════════════════
  createdBy: uuid('created_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  updatedBy: uuid('updated_by'),

}, (table) => ({
  slugIdx: index('search_experiences_slug_idx').on(table.slug),
  accessTokenIdx: index('search_experiences_access_token_idx').on(table.accessToken),
  isActiveIdx: index('search_experiences_is_active_idx').on(table.isActive),
  telemetryDetailLevelIdx: index('search_experiences_telemetry_detail_level_idx').on(table.telemetryDetailLevel),
  createdByIdx: index('search_experiences_created_by_idx').on(table.createdBy),
}));

// ============================================================================
// SEARCH EXPERIENCE INDEXES (JUNCTION TABLE)
// ============================================================================

export const searchExperienceIndexes = pgTable('search_experience_indexes', {
  id: uuid('id').primaryKey().defaultRandom(),

  /** Reference to the search experience */
  searchExperienceId: uuid('search_experience_id')
    .notNull()
    .references(() => searchExperiences.id, { onDelete: 'cascade' }),

  /** Reference to the search index */
  searchIndexId: uuid('search_index_id')
    .notNull()
    .references(() => searchIndex.id, { onDelete: 'cascade' }),

  // ═══════════════════════════════════════════════════════════════════════════
  // CONFIGURATION
  // ═══════════════════════════════════════════════════════════════════════════

  /** Role of this index in the experience */
  role: varchar('role', { length: 20 }).notNull().default('primary'),

  /** Weight for result scoring (1.0 = normal) */
  weight: real('weight').default(1.0).notNull(),

  /** Display/priority order */
  sortOrder: integer('sort_order').default(0).notNull(),

  /** Optional: AI-specific description override for this index */
  aiDescription: text('ai_description'),

  // ═══════════════════════════════════════════════════════════════════════════
  // AUDIT
  // ═══════════════════════════════════════════════════════════════════════════
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),

}, (table) => ({
  experienceIdx: index('se_indexes_experience_idx').on(table.searchExperienceId),
  searchIndexIdx: index('se_indexes_search_index_idx').on(table.searchIndexId),
  uniqueCombo: unique('se_indexes_unique').on(table.searchExperienceId, table.searchIndexId),
}));

// ============================================================================
// RELATIONS
// ============================================================================

export const searchExperiencesRelations = relations(searchExperiences, ({ many }) => ({
  indexes: many(searchExperienceIndexes),
}));

export const searchExperienceIndexesRelations = relations(searchExperienceIndexes, ({ one }) => ({
  searchExperience: one(searchExperiences, {
    fields: [searchExperienceIndexes.searchExperienceId],
    references: [searchExperiences.id],
  }),
  searchIndex: one(searchIndex, {
    fields: [searchExperienceIndexes.searchIndexId],
    references: [searchIndex.id],
  }),
}));

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type SearchExperience = typeof searchExperiences.$inferSelect;
export type NewSearchExperience = typeof searchExperiences.$inferInsert;

export type SearchExperienceIndex = typeof searchExperienceIndexes.$inferSelect;
export type NewSearchExperienceIndex = typeof searchExperienceIndexes.$inferInsert;
