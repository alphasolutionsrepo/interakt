import { z } from 'zod';

// ============================================================================
// TOOL TYPE CONSTANTS
// ============================================================================

// Note: 'mcp' is intentionally NOT a tool executor type — MCP capabilities are
// exposed via mcp_connections (a separate provider concept), not as tool rows.
export const EXECUTOR_TYPES = ['data_source', 'http', 'web_search', 'ai_call'] as const;
export type ExecutorType = (typeof EXECUTOR_TYPES)[number];

export const DATA_SOURCE_OPERATIONS = ['search', 'inspect', 'enumerate', 'lookup', 'query'] as const;
export type DataSourceOperation = (typeof DATA_SOURCE_OPERATIONS)[number];

export const TOOL_STATUSES = ['healthy', 'degraded', 'error', 'unknown'] as const;

// ============================================================================
// RELIABILITY SCHEMAS
// ============================================================================

const retryConfigSchema = z.object({
  count: z.number().int().min(0).max(5).default(2),
  backoff: z.enum(['linear', 'exponential']).default('exponential'),
  retryableErrors: z.array(z.string()).optional(),
});

const fallbackConfigSchema = z.object({
  type: z.enum(['default_response', 'alternative_tool', 'skip', 'error_message']),
  config: z.record(z.unknown()).default({}),
});

const healthCheckConfigSchema = z.object({
  enabled: z.boolean().default(true),
  intervalMs: z.number().int().min(5000).max(3_600_000).default(60_000),
  endpoint: z.string().optional(),
  timeout: z.number().int().min(1000).max(30_000).default(5000),
});

// ============================================================================
// PER-EXECUTOR CONFIG SCHEMAS
// ============================================================================

const dataSourceSearchConfigSchema = z.object({
  maxResults: z.number().int().min(1).max(1000).optional(),
  defaultFilters: z.array(z.object({
    field: z.string(),
    operator: z.string(),
    value: z.unknown(),
  })).optional(),
  defaultSort: z.array(z.object({
    field: z.string(),
    direction: z.enum(['asc', 'desc']),
  })).optional(),
  searchType: z.enum(['lexical', 'semantic', 'hybrid']).optional(),
});

const dataSourceInspectConfigSchema = z.object({
  includeFieldStats: z.boolean().optional(),
  includeExampleValues: z.boolean().optional(),
});

const dataSourceEnumerateConfigSchema = z.object({
  maxValues: z.number().int().min(1).max(1000).optional(),
  defaultField: z.string().optional(),
});

const dataSourceLookupConfigSchema = z.object({
  idField: z.string().min(1).optional(),
  includeFields: z.array(z.string()).optional(),
  excludeFields: z.array(z.string()).optional(),
});

const httpExecutorConfigSchema = z.object({
  baseUrl: z.string().url(),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
  headers: z.record(z.string()).optional(),
  queryParams: z.record(z.string()).optional(),
  bodyTemplate: z.record(z.unknown()).nullable().optional(),
  responseMapping: z.object({
    resultsPath: z.string().optional(),
    totalCountPath: z.string().optional(),
    fieldMappings: z.record(z.string()).optional(),
  }).optional(),
  authentication: z.object({
    type: z.enum(['none', 'header', 'query_param', 'bearer']),
    key: z.string().optional(),
    valueRef: z.string().optional(),
  }).optional(),
});

const webSearchExecutorConfigSchema = z.object({
  apiKeySecret: z.string().nullable().optional(),
  maxResults: z.number().int().min(1).max(20).optional(),
  searchDepth: z.enum(['basic', 'advanced']).optional(),
  includeAnswer: z.boolean().optional(),
  includeDomains: z.array(z.string()).optional(),
  excludeDomains: z.array(z.string()).optional(),
});

const aiCallExecutorConfigSchema = z.object({
  instructions: z.string().min(1).max(10_000),
  contextSources: z.array(z.enum(['conversation_history', 'tool_results'])).optional(),
  providerId: z.string().uuid().nullable().optional(),
  modelId: z.number().int().nullable().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(1).max(16_000).optional(),
});

// ============================================================================
// DISPLAY CONFIG SCHEMA
// ============================================================================

const DISPLAY_FIELD_ROLES = [
  'title', 'subtitle', 'image', 'price', 'description',
  'rating', 'badge', 'link', 'secondary',
] as const;

const DISPLAY_FIELD_FORMATS = [
  'text', 'currency', 'stars', 'date', 'badge', 'image_url', 'link_url',
] as const;

const VISUAL_PRESETS = [
  'single_card', 'item_grid', 'item_list', 'comparison_table',
] as const;

const displayFieldSchema = z.object({
  source: z.string().min(1, 'Source field name is required'),
  role: z.enum(DISPLAY_FIELD_ROLES),
  label: z.string().max(100).optional(),
  format: z.enum(DISPLAY_FIELD_FORMATS).optional(),
  currency: z.string().max(10).optional(),
  priority: z.enum(['primary', 'secondary']).optional(),
});

const displayConfigSchema = z.object({
  fields: z.array(displayFieldSchema).min(1, 'At least one field mapping is required'),
  preferredPresets: z.array(z.enum(VISUAL_PRESETS)).optional(),
}).nullable();

// ============================================================================
// CREATE TOOL SCHEMA
// ============================================================================

const baseCreateSchema = z.object({
  name: z.string()
    .min(1, 'Name is required')
    .max(255, 'Name must be 255 characters or less'),
  slug: z.string()
    .min(1, 'Slug is required')
    .max(100, 'Slug must be 100 characters or less')
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      'Slug must be lowercase with hyphens only',
    ),
  description: z.string().max(1000).nullish().transform(v => v ?? undefined),
  aiDescription: z.string()
    .min(10, 'AI description must be at least 10 characters')
    .max(5000, 'AI description must be 5000 characters or less'),
  inputSchema: z.record(z.unknown()).nullish().transform(v => v ?? undefined),
  outputSchema: z.record(z.unknown()).nullish().transform(v => v ?? undefined),
  timeout: z.number().int().min(1000).max(300_000).default(30_000),
  retryConfig: retryConfigSchema.optional(),
  fallbackConfig: fallbackConfigSchema.optional(),
  healthCheckConfig: healthCheckConfigSchema.optional(),
  isSystem: z.boolean().default(false),
  displayConfig: displayConfigSchema.optional(),
});

/** Data source tool: requires dataSourceId + operation + executor config */
const dataSourceToolSchema = baseCreateSchema.extend({
  executorType: z.literal('data_source'),
  dataSourceId: z.string().uuid('Valid data source ID is required'),
  operation: z.enum(DATA_SOURCE_OPERATIONS),
  executorConfig: z.union([
    dataSourceSearchConfigSchema,
    dataSourceInspectConfigSchema,
    dataSourceEnumerateConfigSchema,
    dataSourceLookupConfigSchema,
  ]).optional(),
});

/** HTTP tool: generic REST API or web search */
const httpToolSchema = baseCreateSchema.extend({
  executorType: z.literal('http'),
  dataSourceId: z.string().uuid().nullish(),
  operation: z.null().optional(),
  executorConfig: z.union([httpExecutorConfigSchema, webSearchExecutorConfigSchema]),
});

/** Web search tool: Tavily-powered live web search */
const webSearchToolSchema = baseCreateSchema.extend({
  executorType: z.literal('web_search'),
  dataSourceId: z.string().uuid().nullish(),
  operation: z.null().optional(),
  executorConfig: webSearchExecutorConfigSchema.optional(),
});

/** AI call tool: sub-LLM call */
const aiCallToolSchema = baseCreateSchema.extend({
  executorType: z.literal('ai_call'),
  dataSourceId: z.string().uuid().nullish(),
  operation: z.null().optional(),
  executorConfig: aiCallExecutorConfigSchema,
});

export const createToolSchema = z.discriminatedUnion('executorType', [
  dataSourceToolSchema,
  httpToolSchema,
  webSearchToolSchema,
  aiCallToolSchema,
]);

export type CreateToolDTO = z.infer<typeof createToolSchema>;

// ============================================================================
// UPDATE TOOL
// ============================================================================

export const updateToolSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).nullish().transform(v => v ?? undefined),
  executorConfig: z.record(z.unknown()).optional(),
  aiDescription: z.string().min(10).max(5000).optional(),
  inputSchema: z.record(z.unknown()).nullish().transform(v => v ?? undefined),
  outputSchema: z.record(z.unknown()).nullish().transform(v => v ?? undefined),
  timeout: z.number().int().min(1000).max(300_000).optional(),
  retryConfig: retryConfigSchema.optional(),
  fallbackConfig: fallbackConfigSchema.nullable().optional(),
  healthCheckConfig: healthCheckConfigSchema.nullable().optional(),
  isActive: z.boolean().optional(),
  isSystem: z.boolean().optional(),
  displayConfig: displayConfigSchema.optional(),
}).refine(
  (data) => Object.keys(data).some(k => data[k as keyof typeof data] !== undefined),
  { message: 'At least one field must be provided' },
);

export type UpdateToolDTO = z.infer<typeof updateToolSchema>;

// ============================================================================
// LIST QUERY
// ============================================================================

export const listToolsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(25),
  executorType: z.enum(EXECUTOR_TYPES).optional(),
  operation: z.enum(DATA_SOURCE_OPERATIONS).optional(),
  status: z.enum(TOOL_STATUSES).optional(),
  search: z.string().max(255).nullish().transform(v => v ?? undefined),
  isActive: z.enum(['true', 'false']).optional().transform(v => v === 'true' ? true : v === 'false' ? false : undefined),
  isSystem: z.enum(['true', 'false']).optional().transform(v => v === 'true' ? true : v === 'false' ? false : undefined),
  dataSourceId: z.string().uuid().optional(),
  sortBy: z.enum(['name', 'executorType', 'createdAt']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type ListToolsQuery = z.infer<typeof listToolsQuerySchema>;

// ============================================================================
// HEALTH UPDATE
// ============================================================================

export const updateToolHealthSchema = z.object({
  status: z.enum(TOOL_STATUSES),
  message: z.string().max(1000).optional(),
});

export type UpdateToolHealthDTO = z.infer<typeof updateToolHealthSchema>;
