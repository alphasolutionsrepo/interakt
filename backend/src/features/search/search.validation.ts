// src/features/search/search.validation.ts

/**
 * Search Feature - Validation Schemas
 *
 * Zod schemas for API request/response validation
 */

import { z } from 'zod';
import { SEARCH_DEFAULTS } from './search.types';

// ============================================================================
// FILTER SCHEMAS
// ============================================================================

const filterOperatorSchema = z.enum([
    'eq', 'neq', 'gt', 'gte', 'lt', 'lte',
    'in', 'nin', 'contains', 'prefix',
    'exists', 'missing', 'range',
    'and', 'or', 'not',
]);

const rangeValueSchema = z.object({
    from: z.union([z.number(), z.string()]).optional(),
    to: z.union([z.number(), z.string()]).optional(),
    includeLower: z.boolean().optional(),
    includeUpper: z.boolean().optional(),
});

const filterValueSchema = z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(z.string()),
    z.array(z.number()),
    rangeValueSchema,
]);

// Recursive filter clause schema
const baseFilterClauseSchema = z.object({
    field: z.string().min(1),
    operator: filterOperatorSchema,
    value: filterValueSchema.optional(),
});

type FilterClauseInput = z.infer<typeof baseFilterClauseSchema> & {
    filters?: FilterClauseInput[];
};

export const filterClauseSchema: z.ZodType<FilterClauseInput> = baseFilterClauseSchema.extend({
    filters: z.lazy(() => z.array(filterClauseSchema)).optional(),
});

// ============================================================================
// FACET SCHEMAS
// ============================================================================

const facetTypeSchema = z.enum([
    'terms',
    'range',
    'date_range',
    'date_histogram',
    'histogram',
]);

const facetRangeSchema = z.object({
    key: z.string().optional(),
    from: z.union([z.number(), z.string()]).optional(),
    to: z.union([z.number(), z.string()]).optional(),
});

export const facetRequestSchema = z.object({
    field: z.string().min(1),
    type: facetTypeSchema.default('terms'),
    size: z.number().int().min(1).max(SEARCH_DEFAULTS.maxFacetSize).optional(),
    ranges: z.array(facetRangeSchema).optional(),
    interval: z.union([z.string(), z.number()]).optional(),
    includeMissing: z.boolean().optional(),
    minDocCount: z.number().int().min(0).optional(),
    orderBy: z.enum(['count', 'value']).optional(),
    orderDirection: z.enum(['asc', 'desc']).optional(),
});

// ============================================================================
// SORT SCHEMAS
// ============================================================================

export const sortClauseSchema = z.object({
    field: z.string().min(1),
    direction: z.enum(['asc', 'desc']).default('desc'),
    missing: z.enum(['_first', '_last']).optional(),
});

// ============================================================================
// HIGHLIGHT SCHEMAS
// ============================================================================

export const highlightConfigSchema = z.object({
    fields: z.array(z.string()).optional(),
    preTag: z.string().default(SEARCH_DEFAULTS.defaultHighlightPreTag),
    postTag: z.string().default(SEARCH_DEFAULTS.defaultHighlightPostTag),
    fragmentSize: z.number().int().min(10).max(500).default(SEARCH_DEFAULTS.defaultFragmentSize),
    numberOfFragments: z.number().int().min(1).max(10).default(SEARCH_DEFAULTS.defaultNumberOfFragments),
});

// ============================================================================
// MAIN SEARCH REQUEST SCHEMA
// ============================================================================

export const searchRequestSchema = z.object({
    // Query
    query: z.string().min(1).max(1000),

    // Search type override
    searchType: z.enum(['lexical', 'semantic', 'hybrid', 'auto']).optional(),

    // Filters
    filters: z.array(filterClauseSchema).optional(),

    // Facets
    facets: z.array(facetRequestSchema).optional(),

    // Pagination
    page: z.number().int().min(1).default(1),
    pageSize: z.number().int().min(1).max(SEARCH_DEFAULTS.maxPageSize).default(SEARCH_DEFAULTS.pageSize),

    // Sorting
    sort: z.array(sortClauseSchema).optional(),

    // Field selection
    includeFields: z.array(z.string()).optional(),
    excludeFields: z.array(z.string()).optional(),

    // Highlighting
    highlight: highlightConfigSchema.optional(),

    // Score threshold
    minScore: z.number().min(0).optional(),

    // Debug
    explain: z.boolean().default(false),
});

export type SearchRequestDTO = z.infer<typeof searchRequestSchema>;

// ============================================================================
// SEARCH RESPONSE SCHEMAS (for documentation/validation)
// ============================================================================

export const searchHitSchema = z.object({
    id: z.string(),
    score: z.number(),
    source: z.record(z.unknown()),
    highlights: z.record(z.array(z.string())).optional(),
    explanation: z.string().optional(),
});

export const totalHitsSchema = z.object({
    value: z.number(),
    relation: z.enum(['eq', 'gte']),
});

export const facetBucketSchema = z.object({
    key: z.union([z.string(), z.number()]),
    label: z.string().optional(),
    count: z.number(),
    from: z.union([z.number(), z.string()]).optional(),
    to: z.union([z.number(), z.string()]).optional(),
});

export const facetResultSchema = z.object({
    field: z.string(),
    type: facetTypeSchema,
    buckets: z.array(facetBucketSchema),
    missingCount: z.number().optional(),
});

export const paginationInfoSchema = z.object({
    page: z.number(),
    pageSize: z.number(),
    totalPages: z.number(),
    totalItems: z.number(),
    hasNextPage: z.boolean(),
    hasPreviousPage: z.boolean(),
});

export const searchResponseSchema = z.object({
    hits: z.array(searchHitSchema),
    total: totalHitsSchema,
    facets: z.array(facetResultSchema).optional(),
    took: z.number(),
    maxScore: z.number().optional(),
    pagination: paginationInfoSchema,
});

export type SearchResponseDTO = z.infer<typeof searchResponseSchema>;

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Validate search request
 */
export function validateSearchRequest(input: unknown): SearchRequestDTO {
    return searchRequestSchema.parse(input);
}

/**
 * Safe parse search request (returns result object)
 */
export function safeParseSearchRequest(input: unknown) {
    return searchRequestSchema.safeParse(input);
}
