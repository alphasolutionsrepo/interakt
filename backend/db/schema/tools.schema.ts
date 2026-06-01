// db/schema/tools.schema.ts

/**
 * Tools Schema (Executor Model)
 *
 * Tools are single-purpose actions that AI can perform. Each tool has:
 * - executorType: HOW it runs (data_source, http, web_search, ai_call)
 * - operation: WHAT it does (only for data_source executors)
 * - executorConfig: Type-specific configuration for the executor
 * - Reliability contract (timeout, retries, fallback, health check)
 *
 * Executor types:
 * - data_source: Operates on a connected data source (search, inspect, enumerate, lookup)
 * - http: Calls an external HTTP endpoint (REST APIs, webhooks)
 * - web_search: Live web search via Tavily
 * - ai_call: Sub-LLM call with custom instructions
 *
 * Note: MCP-sourced capabilities live in `mcp_connections`, not here. They are
 * materialized as virtual tool definitions at runtime and dispatched through a
 * dedicated MCP executor — they never become rows in this table.
 */

import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  json,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import {
  toolStatusEnum,
  executorTypeEnum,
  dataSourceOperationEnum,
} from './enums.schema';
import { dataSources } from './data-sources.schema';

// ============================================================================
// EXECUTOR CONFIG TYPE DEFINITIONS (JSON columns)
// ============================================================================

// ---------------------------------------------------------------------------
// Data Source executor configs (one per operation)
// ---------------------------------------------------------------------------

/** data_source/search — query a data source for ranked results */
export interface DataSourceSearchConfig {
  maxResults?: number;
  defaultFilters?: Array<{ field: string; operator: string; value: unknown }>;
  defaultSort?: Array<{ field: string; direction: 'asc' | 'desc' }>;
  searchType?: 'lexical' | 'semantic' | 'hybrid';
}

/** data_source/inspect — describe schema, fields, and capabilities */
export interface DataSourceInspectConfig {
  includeFieldStats?: boolean;
  includeExampleValues?: boolean;
}

/** data_source/enumerate — list distinct values for a field */
export interface DataSourceEnumerateConfig {
  maxValues?: number;
  defaultField?: string;
}

/** data_source/lookup — retrieve a specific document by ID */
export interface DataSourceLookupConfig {
  idField: string;
  includeFields?: string[];
  excludeFields?: string[];
}

// ---------------------------------------------------------------------------
// Standalone executor configs
// ---------------------------------------------------------------------------

/** http executor — call an external REST endpoint */
export interface HttpExecutorConfig {
  baseUrl: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  queryParams?: Record<string, string>;
  bodyTemplate?: Record<string, unknown> | null;
  responseMapping?: {
    resultsPath?: string;
    totalCountPath?: string;
    fieldMappings?: Record<string, string>;
  };
  authentication?: {
    type: 'none' | 'header' | 'query_param' | 'bearer';
    key?: string;
    valueRef?: string;
  };
}

/** http executor variant — Tavily-powered web search */
export interface WebSearchExecutorConfig {
  apiKeySecret?: string | null;
  maxResults?: number;
  searchDepth?: 'basic' | 'advanced';
  includeAnswer?: boolean;
  includeDomains?: string[];
  excludeDomains?: string[];
}

/** ai_call executor — sub-LLM call with custom instructions */
export interface AiCallExecutorConfig {
  instructions: string;
  contextSources?: Array<'conversation_history' | 'tool_results'>;
  providerId?: string | null;
  modelId?: number | null;
  temperature?: number;
  maxTokens?: number;
}

/** Union type for all executor configs */
export type ExecutorConfig =
  | DataSourceSearchConfig
  | DataSourceInspectConfig
  | DataSourceEnumerateConfig
  | DataSourceLookupConfig
  | HttpExecutorConfig
  | WebSearchExecutorConfig
  | AiCallExecutorConfig;

// ============================================================================
// DISPLAY CONFIG (how tool results are rendered in the frontend)
// ============================================================================

/**
 * Semantic role a field plays in a preset renderer.
 * Renderers use roles (not field names) to decide layout positioning.
 */
export type ToolDisplayFieldRole =
  | 'title'
  | 'subtitle'
  | 'image'
  | 'price'
  | 'description'
  | 'rating'
  | 'badge'
  | 'link'
  | 'secondary';

/**
 * Format hint for rendering a field value.
 */
export type ToolDisplayFieldFormat =
  | 'text'
  | 'currency'
  | 'stars'
  | 'date'
  | 'badge'
  | 'image_url'
  | 'link_url';

/**
 * Maps a source field from tool result data to a semantic role for rendering.
 *
 * Example: { source: 'primaryImageUrl', role: 'image', format: 'image_url', priority: 'primary' }
 */
export interface ToolDisplayField {
  /** Actual field name in the tool result data (e.g., "primaryImageUrl") */
  source: string;
  /** Semantic role — determines WHERE the field renders in a preset layout */
  role: ToolDisplayFieldRole;
  /** Optional display label override (e.g., "Price" instead of "salePrice") */
  label?: string;
  /** Format hint for rendering the value */
  format?: ToolDisplayFieldFormat;
  /** Currency code when format is 'currency' (e.g., "USD") */
  currency?: string;
  /** primary = always show; secondary = show if space allows */
  priority?: 'primary' | 'secondary';
}

/**
 * Tool-level display configuration.
 * Each tool that returns structured results owns this config,
 * defining how its data maps to frontend preset renderers.
 *
 * Stored as JSON on the tools table. When null, the tool's results
 * are not eligible for visual presets (always rich_text).
 */
export interface ToolDisplayConfig {
  /** Field-to-role mappings for preset renderers */
  fields: ToolDisplayField[];
  /** Preferred presets this tool's data works well with (ordered by preference) */
  preferredPresets?: Array<'single_card' | 'item_grid' | 'item_list' | 'comparison_table'>;
}

// ============================================================================
// RELIABILITY CONTRACT (stored as JSON)
// ============================================================================

export interface ToolRetryConfig {
  count: number;
  backoff: 'linear' | 'exponential';
  retryableErrors?: string[];
}

export interface ToolFallbackConfig {
  type: 'default_response' | 'alternative_tool' | 'skip' | 'error_message';
  config: Record<string, unknown>;
}

export interface ToolHealthCheckConfig {
  enabled: boolean;
  intervalMs: number;
  endpoint?: string;
  timeout: number;
}

// ============================================================================
// TOOLS TABLE
// ============================================================================

export const tools = pgTable('tools', {
  // ═══════════════════════════════════════════════════════════════════════════
  // IDENTITY
  // ═══════════════════════════════════════════════════════════════════════════
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  description: text('description'),

  /** Executor type — determines HOW this tool runs */
  executorType: executorTypeEnum('executor_type').notNull().default('data_source'),

  /** Data source operation — determines WHAT this tool does (only for data_source executor) */
  operation: dataSourceOperationEnum('operation'),

  // ═══════════════════════════════════════════════════════════════════════════
  // CONFIGURATION
  // ═══════════════════════════════════════════════════════════════════════════

  /** Executor-specific configuration */
  executorConfig: json('executor_config').$type<ExecutorConfig>(),

  /** Natural language description for the LLM — when and how to use this tool */
  aiDescription: text('ai_description').notNull(),

  /** JSON Schema for tool parameters (used for LLM function definitions) */
  inputSchema: json('input_schema').$type<Record<string, unknown>>(),

  /** JSON Schema for tool return values (used for validation) */
  outputSchema: json('output_schema').$type<Record<string, unknown>>(),

  /** Display config — maps result fields to semantic roles for frontend preset rendering */
  displayConfig: json('display_config').$type<ToolDisplayConfig>(),

  // ═══════════════════════════════════════════════════════════════════════════
  // RELIABILITY CONTRACT
  // ═══════════════════════════════════════════════════════════════════════════

  /** Hard timeout in ms — executor killed after this duration */
  timeout: integer('timeout').default(30_000).notNull(),

  /** Retry configuration */
  retryConfig: json('retry_config').$type<ToolRetryConfig>().default({
    count: 2,
    backoff: 'exponential',
  }).notNull(),

  /** Fallback behavior when execution fails and retries are exhausted */
  fallbackConfig: json('fallback_config').$type<ToolFallbackConfig>(),

  /** Health check configuration */
  healthCheckConfig: json('health_check_config').$type<ToolHealthCheckConfig>(),

  // ═══════════════════════════════════════════════════════════════════════════
  // REFERENCES
  // ═══════════════════════════════════════════════════════════════════════════

  /** FK to data source (required for data_source executor, null for standalone tools) */
  dataSourceId: uuid('data_source_id').references(() => dataSources.id, { onDelete: 'set null' }),

  // ═══════════════════════════════════════════════════════════════════════════
  // FLAGS
  // ═══════════════════════════════════════════════════════════════════════════

  /** System tools are platform-provided (e.g., scaffolded from data source). User-created = false. */
  isSystem: boolean('is_system').default(false).notNull(),

  // ═══════════════════════════════════════════════════════════════════════════
  // HEALTH
  // ═══════════════════════════════════════════════════════════════════════════
  status: toolStatusEnum('status').default('unknown').notNull(),
  lastHealthCheckAt: timestamp('last_health_check_at', { withTimezone: true }),
  lastHealthMessage: text('last_health_message'),

  // ═══════════════════════════════════════════════════════════════════════════
  // STATUS & LIFECYCLE
  // ═══════════════════════════════════════════════════════════════════════════
  isActive: boolean('is_active').default(true).notNull(),
  createdBy: uuid('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedBy: uuid('updated_by'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),

}, (table) => ({
  slugIdx: index('tools_slug_idx').on(table.slug),
  executorTypeIdx: index('tools_executor_type_idx').on(table.executorType),
  operationIdx: index('tools_operation_idx').on(table.operation),
  statusIdx: index('tools_status_idx').on(table.status),
  isActiveIdx: index('tools_is_active_idx').on(table.isActive),
  isSystemIdx: index('tools_is_system_idx').on(table.isSystem),
  dataSourceIdIdx: index('tools_data_source_id_idx').on(table.dataSourceId),
  createdAtIdx: index('tools_created_at_idx').on(table.createdAt),
}));

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type Tool = typeof tools.$inferSelect;
export type NewTool = typeof tools.$inferInsert;
