// db/schema/enums.schema.ts

/**
 * Centralized Database Enums
 * All pgEnum definitions in one place for consistency
 * 
 * NOTE: When modifying enums, ensure corresponding constants in
 * src/shared/constants/ are updated to match.
 */

import { pgEnum } from 'drizzle-orm/pg-core';

// ============================================================================
// USER ENUMS
// ============================================================================

export const userRoleEnum = pgEnum('user_role', [
  'user',
  'admin',
  'moderator'
]);

// ============================================================================
// DATA TEMPLATE ENUMS
// ============================================================================

export const fieldTypeEnum = pgEnum('field_type', [
  'text',
  'keyword',
  'number',
  'boolean',
  'date',
  'datetime',
  'url',
  'email',
  'json',
  'array',
  'image_url'
]);

// ============================================================================
// SEARCH INDEX ENUMS
// Matches: src/shared/constants/search-index.constants.ts
// ============================================================================

export const searchTypeEnum = pgEnum('search_type', [
  'lexical',
  'semantic',
  'hybrid'
]);

/**
 * Indexing Strategy
 * Changed from legacy: removed 'real_time', added 'manual'
 */
export const indexingStrategyEnum = pgEnum('indexing_strategy', [
  'on_upload',
  'scheduled',
  'manual'
]);

/**
 * Index Status
 * Added 'creating' for initial index creation state
 */
export const indexStatusEnum = pgEnum('index_status', [
  'creating',
  'ready',
  'indexing',
  'error',
  'offline'
]);

export const vectorSimilarityEnum = pgEnum('vector_similarity', [
  'cosine',
  'euclidean',
  'dot_product'
]);

/**
 * Field Transform Type (for index field mappings)
 */
export const fieldTransformTypeEnum = pgEnum('field_transform_type', [
  'none',
  'lowercase',
  'uppercase',
  'trim',
  'custom'
]);

// ============================================================================
// AI PROVIDER ENUMS
// Matches: src/shared/constants/ai-providers.ts
// ============================================================================

export const aiModelTypeEnum = pgEnum('ai_model_type', [
  'text',
  'embedding',
  'chat',
  'vision'
]);

export const aiAuthTypeEnum = pgEnum('ai_auth_type', [
  'api_key',
  'none',
  'oauth'
]);

export const aiProviderTypeEnum = pgEnum('ai_provider_type', [
  'cloud',
  'local'
]);

// ============================================================================
// DATA SOURCE ENUMS
// ============================================================================

export const dataSourceTypeEnum = pgEnum('data_source_type', [
  'search_index',
  'search_index_external',
  'file_store',
  'database',
]);

export const dataSourceStatusEnum = pgEnum('data_source_status', [
  'healthy',
  'degraded',
  'error',
  'unknown',
]);

export const dataSourceFieldRoleEnum = pgEnum('data_source_field_role', [
  'title',
  'description',
  'content',
  'price',
  'image',
  'category',
  'id',
  'url',
  'date',
]);

// ============================================================================
// TOOL ENUMS
// Matches: src/shared/constants/tools.constants.ts
// ============================================================================

/**
 * Executor Type — determines HOW a tool runs
 * - data_source: Operates on a connected data source (requires dataSourceId + operation)
 * - http: Calls an external HTTP endpoint (REST APIs, webhooks)
 * - web_search: Searches the live web via Tavily
 * - mcp: Connects to an MCP-compatible server
 * - ai_call: Sub-LLM call with custom instructions
 */
export const executorTypeEnum = pgEnum('executor_type', [
  'data_source',
  'http',
  'web_search',
  'mcp',
  'ai_call',
]);

/**
 * Data Source Operation — determines WHAT a data_source tool does
 * Only applicable when executorType = 'data_source'
 * - search: Query data source for ranked results
 * - inspect: Describe schema, available fields, and capabilities
 * - enumerate: List distinct values for a specific field (for filter discovery)
 * - lookup: Retrieve a specific document by ID
 * - query: Execute a structured query (future, for database data sources)
 */
export const dataSourceOperationEnum = pgEnum('data_source_operation', [
  'search',
  'inspect',
  'enumerate',
  'lookup',
  'query',
]);

export const toolFallbackTypeEnum = pgEnum('tool_fallback_type', [
  'default_response',
  'alternative_tool',
  'skip',
  'error_message',
]);

export const toolStatusEnum = pgEnum('tool_status', [
  'healthy',
  'degraded',
  'error',
  'unknown',
]);

// ============================================================================
// MCP CONNECTION ENUMS
// ============================================================================

export const mcpTransportEnum = pgEnum('mcp_transport', [
  'streamable-http',
  'sse',
]);

export const mcpConnectionStatusEnum = pgEnum('mcp_connection_status', [
  'healthy',
  'degraded',
  'error',
  'unknown',
]);

// ============================================================================
// AI EXPERIENCE ENUMS
// Matches: src/shared/constants/ai-experience.constants.ts
// ============================================================================

export const pipelineModeEnum = pgEnum('pipeline_mode', [
  'agentic',
  'deterministic'
]);

// ============================================================================
// AI SESSION ENUMS
// ============================================================================

export const sessionMessageRoleEnum = pgEnum('session_message_role', [
  'user',
  'assistant',
  'system',
  'tool_result',
]);

export const sessionStatusEnum = pgEnum('session_status', [
  'active',
  'expired',
  'archived',
]);

// ============================================================================
// PROMPT TEMPLATE ENUMS
// ============================================================================

export const promptTemplateStepEnum = pgEnum('prompt_template_step', [
  'turn_planner',
  'param_extraction',
  'response_synthesis',
  'response_synthesis_direct',
  'response_synthesis_lightweight',
  'agentic_loop',
]);

export const promptTemplateStatusEnum = pgEnum('prompt_template_status', [
  'draft',
  'active',
  'archived',
]);