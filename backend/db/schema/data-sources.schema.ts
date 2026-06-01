// db/schema/data-sources.schema.ts

/**
 * Data Sources Schema
 *
 * Data Sources are connections to where business data lives.
 * They are passive resources — tools reference them to perform actions.
 *
 * Types:
 * - search_index: Our built-from-scratch search index (wraps existing search_index table)
 * - search_index_external: Connect to an existing external search provider
 * - file_store: Uploaded documents, auto-chunked and embedded
 * - database: Direct database connection (future)
 */

import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  json,
  integer,
  bigint,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import {
  dataSourceTypeEnum,
  dataSourceStatusEnum,
} from './enums.schema';
import { searchIndex } from './search-index.schema';

// ============================================================================
// TYPE DEFINITIONS FOR JSON COLUMNS
// ============================================================================

/**
 * Config for type: search_index (built from scratch)
 * References our existing search_index infrastructure.
 */
export interface SearchIndexDataSourceConfig {
  /** FK to search_index.id — the underlying index */
  searchIndexId: string;
}

/**
 * Config for type: search_index_external (connect to existing)
 */
export interface ExternalSearchIndexConfig {
  provider: 'elasticsearch' | 'azure_ai_search';
  connection: {
    url: string;
    authType: 'api_key' | 'basic' | 'bearer' | 'none';
    credentials: {
      /** Reference to secrets vault: {{secret:my_es_key}} */
      secretRef: string;
    };
    indexName: string;
  };
  searchDefaults: {
    searchType: 'lexical' | 'semantic' | 'hybrid' | 'auto';
    maxResults: number;
    includeHighlights: boolean;
  };
  healthCheck: {
    enabled: boolean;
    intervalMs: number;
  };
}

/**
 * Config for type: file_store
 */
export interface FileStoreDataSourceConfig {
  chunkingStrategy: 'page' | 'paragraph' | 'token_count' | 'semantic';
  chunkSize: number;
  chunkOverlap: number;
  embeddingProviderId: string;
  embeddingModelId: number;
  maxFileSizeMb: number;
  maxTotalStorageMb: number;
  allowedFileTypes: string[];
  extractMetadata: boolean;
  extractTables: boolean;
}

/**
 * Config for type: database (future)
 */
export interface DatabaseDataSourceConfig {
  provider: 'postgresql' | 'mysql' | 'mongodb' | 'sqlserver';
  connection: {
    secretRef: string;
  };
  allowedTables: string[];
  allowedOperations: ['SELECT'];
  maxRowsPerQuery: number;
  queryTimeout: number;
  queryMode: 'template_only' | 'ai_generated';
  queryTemplates?: Array<{
    name: string;
    description: string;
    sql: string;
    parameters: Array<{ name: string; type: string; required: boolean }>;
  }>;
}

/** Union type for all data source configs */
export type DataSourceConfig =
  | SearchIndexDataSourceConfig
  | ExternalSearchIndexConfig
  | FileStoreDataSourceConfig
  | DatabaseDataSourceConfig;

/**
 * Normalized field schema — shared across all data source types.
 * Stored as JSON array in the schema column.
 */
export interface DataSourceField {
  name: string;
  displayName: string;
  type: string;
  role?: 'title' | 'description' | 'content' | 'price' | 'image' | 'category' | 'id' | 'url' | 'date' | null;
  isSearchable: boolean;
  isFacetable: boolean;
  isFilterable: boolean;
  /** Whether the field can be returned in search results. Defaults to true when not set (for backwards compat with existing schemas). */
  isRetrievable?: boolean;
  description?: string;
}

/** Capabilities discovered from the provider index (semantic config, vector fields, etc.) */
export interface DataSourceCapabilities {
  /** Semantic configuration name (Azure: from semanticConfigurations) */
  semanticConfigName?: string;
  /** Vector field name and dimensions (for hybrid search) */
  vectorField?: {
    name: string;
    dimensions: number;
  };
}

/** Schema metadata stored as JSON */
export interface DataSourceSchema {
  fields: DataSourceField[];
  lastDiscoveredAt?: string;
  /** Provider-specific capabilities discovered from the index */
  capabilities?: DataSourceCapabilities;
}

// ============================================================================
// DATA SOURCES TABLE
// ============================================================================

export const dataSources = pgTable('data_sources', {
  // ═══════════════════════════════════════════════════════════════════════════
  // IDENTITY
  // ═══════════════════════════════════════════════════════════════════════════
  id: uuid('id').primaryKey().defaultRandom(),

  /** Human-friendly name */
  name: varchar('name', { length: 255 }).notNull(),

  /** URL-friendly identifier, unique */
  slug: varchar('slug', { length: 100 }).notNull().unique(),

  /** Optional description for admin reference */
  description: text('description'),

  // ═══════════════════════════════════════════════════════════════════════════
  // TYPE & CONFIGURATION
  // ═══════════════════════════════════════════════════════════════════════════

  /** Data source type — determines config shape and behavior */
  type: dataSourceTypeEnum('type').notNull(),

  /** Type-specific configuration (see config types above) */
  config: json('config').$type<DataSourceConfig>().notNull(),

  /**
   * Normalized field schema across all data source types.
   * For search_index type, this is derived from search_index_fields.
   * For external types, this is auto-discovered or manually configured.
   */
  schema: json('schema').$type<DataSourceSchema>(),

  // ═══════════════════════════════════════════════════════════════════════════
  // REFERENCES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * FK to search_index.id — only set for type: search_index.
   * Provides a direct DB-level reference to the underlying search index.
   */
  searchIndexId: uuid('search_index_id').references(() => searchIndex.id, { onDelete: 'set null' }),

  // ═══════════════════════════════════════════════════════════════════════════
  // HEALTH
  // ═══════════════════════════════════════════════════════════════════════════
  status: dataSourceStatusEnum('status').default('unknown').notNull(),
  lastHealthCheckAt: timestamp('last_health_check_at', { withTimezone: true }),
  lastHealthMessage: text('last_health_message'),

  // ═══════════════════════════════════════════════════════════════════════════
  // METADATA
  // ═══════════════════════════════════════════════════════════════════════════
  documentCount: integer('document_count'),
  storageSizeBytes: bigint('storage_size_bytes', { mode: 'number' }),

  // ═══════════════════════════════════════════════════════════════════════════
  // STATUS & LIFECYCLE
  // ═══════════════════════════════════════════════════════════════════════════
  isActive: boolean('is_active').default(true).notNull(),
  createdBy: uuid('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedBy: uuid('updated_by'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),

}, (table) => ({
  slugIdx: index('data_sources_slug_idx').on(table.slug),
  typeIdx: index('data_sources_type_idx').on(table.type),
  statusIdx: index('data_sources_status_idx').on(table.status),
  isActiveIdx: index('data_sources_is_active_idx').on(table.isActive),
  searchIndexIdIdx: index('data_sources_search_index_id_idx').on(table.searchIndexId),
}));

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type DataSource = typeof dataSources.$inferSelect;
export type NewDataSource = typeof dataSources.$inferInsert;
