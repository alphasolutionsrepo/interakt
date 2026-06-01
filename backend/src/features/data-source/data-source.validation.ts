import { z } from 'zod';

// ============================================================================
// DATA SOURCE TYPE CONSTANTS
// ============================================================================

export const DATA_SOURCE_TYPES = [
  'search_index',
  'search_index_external',
  'file_store',
  'database',
] as const;

export const DATA_SOURCE_STATUSES = [
  'healthy',
  'degraded',
  'error',
  'unknown',
] as const;

export const FIELD_ROLES = [
  'title',
  'description',
  'content',
  'price',
  'image',
  'category',
  'id',
  'url',
  'date',
] as const;

// ============================================================================
// CONFIG SCHEMAS (per type)
// ============================================================================

const searchIndexConfigSchema = z.object({
  searchIndexId: z.string().uuid(),
});

const externalSearchIndexConfigSchema = z.object({
  provider: z.enum(['elasticsearch', 'azure_ai_search']),
  connection: z.object({
    url: z.string().url(),
    authType: z.enum(['api_key', 'basic', 'bearer', 'none']),
    credentials: z.object({
      secretRef: z.string().min(1),
    }),
    indexName: z.string().min(1).max(255),
  }),
  searchDefaults: z.object({
    searchType: z.enum(['lexical', 'semantic', 'hybrid', 'auto']),
    maxResults: z.number().int().min(1).max(1000).default(10),
    includeHighlights: z.boolean().default(true),
  }),
  healthCheck: z.object({
    enabled: z.boolean().default(true),
    intervalMs: z.number().int().min(5000).max(3_600_000).default(60_000),
  }),
});

const fileStoreConfigSchema = z.object({
  chunkingStrategy: z.enum(['page', 'paragraph', 'token_count', 'semantic']),
  chunkSize: z.number().int().min(50).max(8000).default(500),
  chunkOverlap: z.number().int().min(0).max(1000).default(50),
  embeddingProviderId: z.string().uuid(),
  embeddingModelId: z.number().int(),
  maxFileSizeMb: z.number().min(1).max(500).default(50),
  maxTotalStorageMb: z.number().min(1).max(50_000).default(1000),
  allowedFileTypes: z.array(z.string()).min(1),
  extractMetadata: z.boolean().default(true),
  extractTables: z.boolean().default(false),
});

const databaseConfigSchema = z.object({
  provider: z.enum(['postgresql', 'mysql', 'mongodb', 'sqlserver']),
  connection: z.object({
    secretRef: z.string().min(1),
  }),
  allowedTables: z.array(z.string().min(1)).min(1),
  allowedOperations: z.tuple([z.literal('SELECT')]),
  maxRowsPerQuery: z.number().int().min(1).max(10_000).default(100),
  queryTimeout: z.number().int().min(1000).max(60_000).default(10_000),
  queryMode: z.enum(['template_only', 'ai_generated']),
  queryTemplates: z.array(z.object({
    name: z.string().min(1),
    description: z.string(),
    sql: z.string().min(1),
    parameters: z.array(z.object({
      name: z.string().min(1),
      type: z.string().min(1),
      required: z.boolean(),
    })),
  })).optional(),
});

// ============================================================================
// FIELD SCHEMA
// ============================================================================

const dataSourceFieldSchema = z.object({
  name: z.string().min(1).max(255),
  displayName: z.string().min(1).max(255),
  type: z.string().min(1),
  role: z.enum(FIELD_ROLES).nullable().optional(),
  isSearchable: z.boolean().default(false),
  isFacetable: z.boolean().default(false),
  isFilterable: z.boolean().default(false),
  description: z.string().max(500).optional(),
});

const dataSourceSchemaSchema = z.object({
  fields: z.array(dataSourceFieldSchema),
  lastDiscoveredAt: z.string().optional(),
});

// ============================================================================
// CREATE DATA SOURCE
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
  schema: dataSourceSchemaSchema.optional(),
});

export const createDataSourceSchema = z.discriminatedUnion('type', [
  baseCreateSchema.extend({
    type: z.literal('search_index'),
    config: searchIndexConfigSchema,
  }),
  baseCreateSchema.extend({
    type: z.literal('search_index_external'),
    config: externalSearchIndexConfigSchema,
  }),
  baseCreateSchema.extend({
    type: z.literal('file_store'),
    config: fileStoreConfigSchema,
  }),
  baseCreateSchema.extend({
    type: z.literal('database'),
    config: databaseConfigSchema,
  }),
]);

export type CreateDataSourceDTO = z.infer<typeof createDataSourceSchema>;

// ============================================================================
// UPDATE DATA SOURCE
// ============================================================================

export const updateDataSourceSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).nullish().transform(v => v ?? undefined),
  config: z.record(z.unknown()).optional(),
  schema: dataSourceSchemaSchema.optional(),
  isActive: z.boolean().optional(),
}).refine(
  (data) => Object.keys(data).some(k => data[k as keyof typeof data] !== undefined),
  { message: 'At least one field must be provided' },
);

export type UpdateDataSourceDTO = z.infer<typeof updateDataSourceSchema>;

// ============================================================================
// LIST QUERY
// ============================================================================

export const listDataSourcesQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(25),
  search: z.string().max(255).nullish().transform(v => v ?? undefined),
  type: z.enum(DATA_SOURCE_TYPES).optional(),
  status: z.enum(DATA_SOURCE_STATUSES).optional(),
  isActive: z.enum(['true', 'false']).optional().transform(v => v === 'true' ? true : v === 'false' ? false : undefined),
  sortBy: z.enum(['name', 'createdAt', 'type']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type ListDataSourcesQuery = z.infer<typeof listDataSourcesQuerySchema>;

// ============================================================================
// HEALTH UPDATE
// ============================================================================

export const updateHealthSchema = z.object({
  status: z.enum(DATA_SOURCE_STATUSES),
  message: z.string().max(1000).optional(),
  documentCount: z.number().int().min(0).optional(),
  storageSizeBytes: z.number().int().min(0).optional(),
});

export type UpdateHealthDTO = z.infer<typeof updateHealthSchema>;
