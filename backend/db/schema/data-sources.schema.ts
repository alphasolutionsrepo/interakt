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
      /**
       * Name of a secret in the vault — e.g. `my_es_key`.
       *
       * The bare name, not a `{{secret:my_es_key}}` template: this is looked up directly by
       * `resolveSecret(name)`. The braces form is used for interpolation inside HTTP tool
       * configs, and documenting it here produced a 403 with a message blaming the key.
       *
       * Empty when `authType` is `none`.
       */
      secretRef: string;
    };
    indexName: string;
  };
  searchDefaults: {
    searchType: 'lexical' | 'semantic' | 'hybrid' | 'auto';
    maxResults: number;
    includeHighlights: boolean;
  };
  /**
   * Reserved — **not yet scheduled**.
   *
   * Nothing reads these. Health checks run when someone asks for one: the refresh control on
   * the data-source page, or automatically the first time a source has no schema at all.
   * There is no periodic runner, so an interval configured here has no effect.
   *
   * Kept rather than removed because a scheduler is wanted and the shape is right, but it is
   * documented as inert so it is not mistaken for a working setting — a stored value that
   * silently does nothing is how `pipelineConfig` and the old guardrail axis misled operators.
   */
  healthCheck: {
    enabled: boolean;
    intervalMs: number;
  };
  /**
   * How many documents to sample when profiling fields at discovery. Omitted means the
   * default; 0 disables profiling for indexes where an extra read is unwelcome.
   */
  profileSampleSize?: number;
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
 * What a field actually contains, measured from a sample of documents.
 *
 * A field list gives names and types. It cannot say that `article_type` is empty on most
 * documents, that `type` holds a file format rather than a subject, or that `author` values
 * are inconsistently cased — and those are the facts that decide whether filtering on a
 * field will work. Every one of them previously had to be found by reading documents by
 * hand, per index.
 *
 * Deliberately reports only what was observed. There is no extrapolation to index-wide
 * totals: `distinctInSample` is exactly that, so nothing downstream can mistake a
 * 50-document reading for a cardinality guarantee.
 */
export interface DataSourceFieldProfile {
  /** Documents examined. */
  sampleSize: number;
  /** Fraction of sampled documents where the field was absent, null, or empty (0–1). */
  nullRate: number;
  /** Distinct non-empty values seen in the sample. Never an index-wide estimate. */
  distinctInSample: number;
  /** Capped, deduped, length-capped example values. Absent for free-text fields. */
  sampleValues?: string[];
  profiledAt: string;
}

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
  /**
   * Whether the provider permits ordering by this field. Azure declares it per field and
   * rejects the whole request when an unsortable field is used, so an unknown value
   * (older schemas) must be treated as "don't risk it" rather than "allowed".
   */
  isSortable?: boolean;
  description?: string;
  /**
   * The provider's own type string, verbatim — e.g. `keyword`, `Edm.String`,
   * `Collection(Edm.String)`.
   *
   * `type` above is a normalized, lossy label for UI and prompts: Elasticsearch `text`
   * and `keyword` both collapse to `text`, and Azure `Collection(Edm.String)` loses its
   * array-ness. Filter translation cannot use a lossy type — a `term` query against the
   * wrong one matches nothing, and comparing an Azure collection without a lambda is a
   * 400. Absent on schemas discovered before this field existed; re-run a health check
   * to populate it.
   */
  providerType?: string;
  /**
   * The field name to use in filter and sort expressions when it differs from `name`.
   * Elasticsearch `text` fields are not exact-matchable, but usually carry a `keyword`
   * sub-field (`title.keyword`) that is. Absent means filter on `name` directly.
   */
  filterField?: string;
  /** What the field actually contains, measured at discovery. Absent when unprofiled. */
  profile?: DataSourceFieldProfile;
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
