// src/features/search-experience/search-experience.schemas.ts

/**
 * Search Experience Validation Schemas
 *
 * Zod schemas for validating API requests and configuration.
 */

import { z } from 'zod';
import {
  DEFAULT_SEARCH_CONFIG,
  DEFAULT_AI_CONFIG,
  DEFAULT_TOOLS_CONFIG,
  DEFAULT_AUTOCOMPLETE_CONFIG,
} from './search-experience.types';

// ============================================================================
// BASE SCHEMAS
// ============================================================================

/**
 * Slug validation: lowercase, alphanumeric, hyphens, 3-100 chars
 */
export const slugSchema = z
  .string()
  .min(3, 'Slug must be at least 3 characters')
  .max(100, 'Slug must be at most 100 characters')
  .regex(
    /^[a-z][a-z0-9-]*[a-z0-9]$/,
    'Slug must start with a letter, contain only lowercase letters, numbers, and hyphens, and end with a letter or number'
  );

/**
 * UUID validation
 */
export const uuidSchema = z.string().uuid('Invalid UUID format');

// ============================================================================
// AUTOCOMPLETE CONFIG SCHEMA
// ============================================================================

export const autocompleteConfigSchema = z.object({
  enabled: z.boolean().default(DEFAULT_AUTOCOMPLETE_CONFIG.enabled),
  minLength: z.number().int().min(1).max(10).default(DEFAULT_AUTOCOMPLETE_CONFIG.minLength),
  maxSuggestions: z.number().int().min(1).max(20).default(DEFAULT_AUTOCOMPLETE_CONFIG.maxSuggestions),
  debounceMs: z.number().int().min(0).max(1000).default(DEFAULT_AUTOCOMPLETE_CONFIG.debounceMs),
});

// ============================================================================
// HYBRID CONFIG SCHEMA
// ============================================================================

/**
 * Hybrid search configuration schema
 * Controls the balance between lexical (keyword) and semantic (vector) search
 */
export const hybridConfigSchema = z.object({
  /** Lexical (keyword) search weight (0.1-3.0, default 1.0) */
  lexicalWeight: z.number().min(0.1).max(3.0).optional(),
  /** Semantic (vector) search weight (0.1-3.0, default 1.0) */
  semanticWeight: z.number().min(0.1).max(3.0).optional(),
  /** RRF rank constant - higher values reduce top-ranking impact (default 60) */
  rrfRankConstant: z.number().int().min(1).max(1000).optional(),
  /** RRF window size - results to consider from each search type (default 100) */
  rrfWindowSize: z.number().int().min(10).max(500).optional(),
});

// ============================================================================
// SEARCH CONFIG SCHEMAS
// ============================================================================

export const searchConfigSchema = z.object({
  defaultPageSize: z.number().int().min(1).max(100).default(DEFAULT_SEARCH_CONFIG.defaultPageSize),
  maxPageSize: z.number().int().min(1).max(1000).default(DEFAULT_SEARCH_CONFIG.maxPageSize),
  enableHighlighting: z.boolean().default(DEFAULT_SEARCH_CONFIG.enableHighlighting),
  enableFacets: z.boolean().default(DEFAULT_SEARCH_CONFIG.enableFacets),
  multiIndexStrategy: z.enum(['auto', 'all', 'primary_only']).default(DEFAULT_SEARCH_CONFIG.multiIndexStrategy),
  resultMergeStrategy: z.enum(['interleave', 'grouped', 'scored']).default(DEFAULT_SEARCH_CONFIG.resultMergeStrategy),
  maxIndexesPerQuery: z.number().int().min(1).max(10).default(DEFAULT_SEARCH_CONFIG.maxIndexesPerQuery),
  autocomplete: autocompleteConfigSchema.default(DEFAULT_AUTOCOMPLETE_CONFIG),
  /** Hybrid search tuning - if not provided, global defaults are used on create */
  hybridConfig: hybridConfigSchema.optional(),
  /**
   * Override the search type for this experience.
   * Must be compatible with the index's capabilities:
   * - 'lexical': Always available
   * - 'semantic': Requires index with embeddings
   * - 'hybrid': Requires index with embeddings (combines lexical + semantic)
   * - 'auto': Use index's configured search type (default)
   */
  defaultSearchType: z.enum(['lexical', 'semantic', 'hybrid', 'auto']).optional(),
});

// ============================================================================
// AI CONFIG SCHEMAS
// ============================================================================

export const aiSummaryConfigSchema = z.object({
  enabled: z.boolean().default(DEFAULT_AI_CONFIG.summary.enabled),
  maxResultsForContext: z.number().int().min(1).max(50).default(DEFAULT_AI_CONFIG.summary.maxResultsForContext),
  customInstructions: z.string().max(5000).optional(),
  maxTokens: z.number().int().min(50).max(4000).optional(),
});

export const aiConfigSchema = z.object({
  enabled: z.boolean().default(DEFAULT_AI_CONFIG.enabled),
  providerId: z.string().uuid().nullable().default(null),
  modelId: z.number().int().positive().nullable().default(null),
  summary: aiSummaryConfigSchema.default(DEFAULT_AI_CONFIG.summary),
});

// ============================================================================
// TOOLS CONFIG SCHEMAS
// ============================================================================

export const toolsConfigSchema = z.object({
  enabled: z.array(z.string()).default(DEFAULT_TOOLS_CONFIG.enabled),
  settings: z.record(z.unknown()).default(DEFAULT_TOOLS_CONFIG.settings),
});

// ============================================================================
// RATE LIMIT CONFIG SCHEMAS
// ============================================================================

export const rateLimitConfigSchema = z.object({
  searchPerMinute: z.number().int().min(1).max(1000),
  chatPerMinute: z.number().int().min(1).max(500),
  requestsPerDay: z.number().int().min(1).optional(),
});

// ============================================================================
// DISPLAY CONFIG SCHEMAS
// ============================================================================

/**
 * Display field role enum
 */
export const displayFieldRoleSchema = z.enum([
  'title',
  'subtitle',
  'description',
  'image',
  'price',
  'badge',
  'secondary',
  'link',
]);

/**
 * Display field configuration
 */
export const displayFieldSchema = z.object({
  fieldName: z.string().min(1, 'Field name is required'),
  role: displayFieldRoleSchema,
  label: z.string().max(100).optional(),
  order: z.number().int().min(0),
});

/**
 * Display configuration schema
 */
export const displayConfigSchema = z.object({
  displayFields: z.array(displayFieldSchema).min(1, 'At least one display field is required'),
  layout: z.object({
    showScore: z.boolean().optional(),
    showHighlights: z.boolean().optional(),
  }).optional(),
});

// ============================================================================
// INDEX CONFIG SCHEMAS
// ============================================================================

export const searchExperienceIndexInputSchema = z.object({
  searchIndexId: uuidSchema,
  role: z.enum(['primary', 'secondary']).default('primary'),
  weight: z.number().min(0.1).max(10).default(1.0),
  sortOrder: z.number().int().min(0).default(0),
  aiDescription: z.string().max(1000).optional(),
});

// ============================================================================
// CREATE/UPDATE SCHEMAS
// ============================================================================

export const createSearchExperienceSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  slug: slugSchema,
  description: z.string().max(2000).optional(),
  searchConfig: searchConfigSchema.default(DEFAULT_SEARCH_CONFIG),
  aiConfig: aiConfigSchema.default(DEFAULT_AI_CONFIG),
  toolsConfig: toolsConfigSchema.default(DEFAULT_TOOLS_CONFIG),
  allowedOrigins: z.array(z.string().url()).default([]),
  rateLimitConfig: rateLimitConfigSchema.optional(),
  displayConfig: displayConfigSchema.optional(),
  indexes: z.array(searchExperienceIndexInputSchema).min(1, 'At least one index is required'),
});

export const updateSearchExperienceSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  slug: slugSchema.optional(),
  description: z.string().max(2000).nullable().optional(),
  searchConfig: searchConfigSchema.partial().optional(),
  aiConfig: aiConfigSchema.partial().optional(),
  toolsConfig: toolsConfigSchema.partial().optional(),
  allowedOrigins: z.array(z.string().url()).optional(),
  rateLimitConfig: rateLimitConfigSchema.nullable().optional(),
  displayConfig: displayConfigSchema.nullable().optional(),
  isActive: z.boolean().optional(),
  telemetryDetailLevel: z.enum(['off', 'metadata', 'full']).optional(),
});

export const addIndexSchema = searchExperienceIndexInputSchema;

export const updateIndexSchema = z.object({
  role: z.enum(['primary', 'secondary']).optional(),
  weight: z.number().min(0.1).max(10).optional(),
  sortOrder: z.number().int().min(0).optional(),
  aiDescription: z.string().max(1000).nullable().optional(),
});

// ============================================================================
// API REQUEST SCHEMAS
// ============================================================================

/**
 * Filter clause schema
 */
export const filterClauseSchema = z.object({
  field: z.string().min(1),
  operator: z.enum([
    'eq', 'neq', 'gt', 'gte', 'lt', 'lte',
    'in', 'nin', 'contains', 'prefix',
    'exists', 'missing', 'range',
  ]),
  value: z.unknown(),
});

/**
 * Facet request schema
 */
export const facetRequestSchema = z.union([
  z.string(),
  z.object({
    field: z.string().min(1),
    type: z.enum(['terms', 'range', 'date_range', 'histogram']).optional(),
    size: z.number().int().min(1).max(100).optional(),
    ranges: z.array(z.object({
      from: z.number().optional(),
      to: z.number().optional(),
      key: z.string().optional(),
    })).optional(),
  }),
]);

/**
 * Sort clause schema
 */
export const sortClauseSchema = z.object({
  field: z.string().min(1),
  order: z.enum(['asc', 'desc']),
});

/**
 * Search API request schema
 */
export const searchAPIRequestSchema = z.object({
  query: z.string().min(1, 'Query is required').max(1000),
  indexes: z.array(z.string()).optional(),
  filters: z.array(filterClauseSchema).optional(),
  facets: z.array(facetRequestSchema).optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).optional(),
  sort: z.array(sortClauseSchema).optional(),
  includeHighlights: z.boolean().optional(),
});

/**
 * Summarize API request schema
 */
export const summarizeAPIRequestSchema = z.object({
  query: z.string().min(1).max(1000),
  filters: z.array(filterClauseSchema).optional(),
  results: z.array(z.object({
    id: z.string(),
    index: z.object({
      id: z.string(),
      name: z.string(),
    }),
    fields: z.record(z.unknown()),
  })).min(1, 'At least one result is required').max(50),
  totalResults: z.number().int().min(0).optional(),
  instruction: z.string().max(500).optional(),
});

// ============================================================================
// LIST/QUERY SCHEMAS
// ============================================================================

export const listSearchExperiencesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  isActive: z.coerce.boolean().optional(),
  sortBy: z.enum(['name', 'createdAt', 'updatedAt']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

// ============================================================================
// TYPE EXPORTS (inferred from schemas)
// ============================================================================

export type DisplayFieldRoleDTO = z.infer<typeof displayFieldRoleSchema>;
export type DisplayFieldDTO = z.infer<typeof displayFieldSchema>;
export type DisplayConfigDTO = z.infer<typeof displayConfigSchema>;
export type CreateSearchExperienceDTO = z.infer<typeof createSearchExperienceSchema>;
export type UpdateSearchExperienceDTO = z.infer<typeof updateSearchExperienceSchema>;
export type AddIndexDTO = z.infer<typeof addIndexSchema>;
export type UpdateIndexDTO = z.infer<typeof updateIndexSchema>;
export type SearchAPIRequestDTO = z.infer<typeof searchAPIRequestSchema>;
export type SummarizeAPIRequestDTO = z.infer<typeof summarizeAPIRequestSchema>;
export type ListSearchExperiencesQueryDTO = z.infer<typeof listSearchExperiencesQuerySchema>;

// ============================================================================
// PUBLIC SEARCH REQUEST SCHEMA
// ============================================================================

/**
 * Public search request schema (for external clients via /api/v1/search)
 */
export const publicSearchRequestSchema = z.object({
  query: z.string().min(1, 'Query is required').max(1000),
  indexId: z.string().uuid().optional(), // Optional: specific index to search
  searchType: z.enum(['lexical', 'semantic', 'hybrid', 'auto']).optional(),
  filters: z.array(z.object({
    field: z.string().min(1),
    operator: z.string(),
    value: z.unknown(),
    filters: z.array(z.unknown()).optional(),
  })).optional(),
  facets: z.array(z.object({
    field: z.string().min(1),
    type: z.string().optional(),
    size: z.number().int().min(1).max(100).optional(),
  })).optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).optional(),
  sort: z.array(z.object({
    field: z.string().min(1),
    direction: z.enum(['asc', 'desc']),
  })).optional(),
  includeFields: z.array(z.string()).optional(),
  excludeFields: z.array(z.string()).optional(),
});

export type PublicSearchRequestDTO = z.infer<typeof publicSearchRequestSchema>;

// ============================================================================
// AUTOCOMPLETE REQUEST SCHEMA
// ============================================================================

/**
 * Autocomplete request schema (for /api/v1/autocomplete)
 */
export const autocompleteRequestSchema = z.object({
  query: z.string().min(1, 'Query is required').max(200, 'Query too long'),
  indexId: z.string().uuid().optional(),
  maxSuggestions: z.number().int().min(1).max(20).optional(),
});

export type AutocompleteRequestDTO = z.infer<typeof autocompleteRequestSchema>;
