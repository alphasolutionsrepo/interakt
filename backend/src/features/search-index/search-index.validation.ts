// src/features/search-index/search-index.validation.ts

/**
 * Search Index Feature - Validation Schemas
 * 
 * UPDATED: Removed field mapping schemas (moved to search-index-fields.validation.ts)
 * 
 * SINGLE SOURCE OF TRUTH: All DTOs are inferred from these schemas
 */

import { z } from 'zod';
import {
    SEARCH_TYPES,
    INDEXING_STRATEGIES,
    INDEX_STATUSES,
    VECTOR_SIMILARITIES,
    INDEX_NAME_REGEX,
    INDEX_NAME_MAX_LENGTH,
    INDEX_NAME_MIN_LENGTH,
    SEARCH_INDEX_DEFAULTS,
} from '@/shared/constants/search-index.constants';

// ============================================================================
// BASE ENUM SCHEMAS
// ============================================================================

export const searchTypeSchema = z.enum(SEARCH_TYPES);
export const indexingStrategySchema = z.enum(INDEXING_STRATEGIES);
export const indexStatusSchema = z.enum(INDEX_STATUSES);
export const vectorSimilaritySchema = z.enum(VECTOR_SIMILARITIES);

// ============================================================================
// ANALYZER CONFIG SCHEMA
// ============================================================================

export const analyzerConfigSchema = z.object({
    tokenizer: z.string().optional(),
    filters: z.array(z.string()).optional(),
    charFilters: z.array(z.string()).optional(),
});

// ============================================================================
// CREATE SEARCH INDEX SCHEMA
// UPDATED: Removed fieldMappings - fields are snapshotted from template
// ============================================================================

export const createSearchIndexSchema = z.object({
    // Identity
    name: z.string()
        .min(INDEX_NAME_MIN_LENGTH, `Name must be at least ${INDEX_NAME_MIN_LENGTH} characters`)
        .max(INDEX_NAME_MAX_LENGTH, `Name cannot exceed ${INDEX_NAME_MAX_LENGTH} characters`)
        .regex(INDEX_NAME_REGEX, 'Name must be lowercase, start with a letter, and contain only letters, numbers, hyphens, and underscores'),

    displayName: z.string()
        .min(1, 'Display name is required')
        .max(255, 'Display name too long'),

    description: z.string().max(1000).optional(),

    // Search Type & Strategy
    searchType: searchTypeSchema,
    indexingStrategy: indexingStrategySchema.default('on_upload'),

    // Search Provider (set at creation, immutable)
    searchProvider: z.enum(['elasticsearch', 'azure-ai-search']).default('elasticsearch'),

    // Provider-specific settings (new JSON blob — each provider stores different settings)
    providerSettings: z.record(z.unknown()).default({}),

    // DEPRECATED ES Settings (kept for backward compat, use providerSettings instead)
    numberOfShards: z.number().int().min(1).max(100).default(SEARCH_INDEX_DEFAULTS.numberOfShards).optional(),
    numberOfReplicas: z.number().int().min(0).max(10).default(SEARCH_INDEX_DEFAULTS.numberOfReplicas).optional(),
    refreshInterval: z.string().regex(/^\d+[smh]$/).default(SEARCH_INDEX_DEFAULTS.refreshInterval).optional(),

    // Text Analysis
    language: z.string().max(50).default('english'),
    synonyms: z.array(z.string()).default([]),
    stopWords: z.array(z.string()).default([]),
    analyzerConfig: analyzerConfigSchema.optional(),

    // AI Configuration (required for semantic/hybrid)
    aiProviderId: z.string().uuid().optional(),
    aiModelId: z.number().int().positive().optional(),
    embeddingDimensions: z.number().int().min(64).max(4096).optional(),
    vectorSimilarity: vectorSimilaritySchema.default('cosine'),

    // Hybrid Search RRF Settings
    rrfRankConstant: z.number().int().min(1).max(1000).default(SEARCH_INDEX_DEFAULTS.rrfRankConstant),
    rrfWindowSize: z.number().int().min(10).max(10000).default(SEARCH_INDEX_DEFAULTS.rrfWindowSize),

    // REMOVED: fieldMappings - no longer part of creation
    // Fields are now snapshotted from the template after index creation
});

export type CreateSearchIndexDTO = z.infer<typeof createSearchIndexSchema>;

// ============================================================================
// UPDATE SEARCH INDEX SCHEMA
// ============================================================================

export const updateSearchIndexSchema = z.object({
    displayName: z.string().min(1).max(255).optional(),
    description: z.string().max(1000).optional().nullable(),

    // Can update indexing strategy
    indexingStrategy: indexingStrategySchema.optional(),

    // Provider-specific settings (partial update)
    providerSettings: z.record(z.unknown()).optional(),

    // DEPRECATED ES settings (kept for backward compat)
    numberOfReplicas: z.number().int().min(0).max(10).optional(),
    refreshInterval: z.string().regex(/^\d+[smh]$/).optional(),

    // Can update text analysis (may require reindex)
    language: z.string().max(50).optional(),
    synonyms: z.array(z.string()).optional(),
    stopWords: z.array(z.string()).optional(),
    analyzerConfig: analyzerConfigSchema.optional(),

    // Can update hybrid search settings
    rrfRankConstant: z.number().int().min(1).max(1000).optional(),
    rrfWindowSize: z.number().int().min(10).max(10000).optional(),

    // Cannot update: name, dataTemplateId, searchType
    // AI config can be changed via separate endpoint (destructive operation)
});

export type UpdateSearchIndexDTO = z.infer<typeof updateSearchIndexSchema>;

// ============================================================================
// CHANGE AI CONFIGURATION SCHEMA
// This is a destructive operation that deletes the ES index
// ============================================================================

export const changeAIConfigSchema = z.object({
    /** New AI provider ID */
    aiProviderId: z.string().uuid('Invalid AI provider ID'),

    /** New AI model ID */
    aiModelId: z.number().int().positive('AI model is required'),

    /** New embedding dimensions (from the selected model) */
    embeddingDimensions: z.number().int().min(64).max(4096),

    /** Vector similarity metric (optional, defaults to cosine) */
    vectorSimilarity: vectorSimilaritySchema.optional(),

    /** Confirmation text - must be "CONFIRM" to proceed */
    confirmText: z.literal('CONFIRM', {
        errorMap: () => ({ message: 'You must type CONFIRM to proceed' }),
    }),
});

export type ChangeAIConfigDTO = z.infer<typeof changeAIConfigSchema>;

// ============================================================================
// QUERY SCHEMAS
// ============================================================================

export const listSearchIndexesQuerySchema = z.object({
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
    search: z.string().optional(),
    searchType: searchTypeSchema.optional(),
    status: indexStatusSchema.optional(),
    isActive: z.enum(['true', 'false']).transform(v => v === 'true').optional(),
    sortBy: z.enum(['name', 'displayName', 'createdAt', 'updatedAt', 'documentCount']).default('createdAt'),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type ListSearchIndexesQuery = z.infer<typeof listSearchIndexesQuerySchema>;

// ============================================================================
// PARAM SCHEMAS
// ============================================================================

export const searchIndexIdSchema = z.object({
    id: z.string().uuid('Invalid search index ID'),
});

export type SearchIndexIdParam = z.infer<typeof searchIndexIdSchema>;

export const searchIndexNameSchema = z.object({
    name: z.string()
        .min(INDEX_NAME_MIN_LENGTH)
        .max(INDEX_NAME_MAX_LENGTH)
        .regex(INDEX_NAME_REGEX),
});

export type SearchIndexNameParam = z.infer<typeof searchIndexNameSchema>;

// ============================================================================
// REMOVED SCHEMAS (Moved to search-index-fields.validation.ts)
// ============================================================================

/*
REMOVED - Use search-index-fields.validation.ts instead:

export const fieldTransformConfigSchema = z.object({ ... });
export const createFieldMappingSchema = z.object({ ... });
export const updateFieldMappingSchema = z.object({ ... });
export const fieldMappingIdSchema = z.object({ ... });

export type CreateFieldMappingDTO = z.infer<typeof createFieldMappingSchema>;
export type UpdateFieldMappingDTO = z.infer<typeof updateFieldMappingSchema>;
export type FieldMappingIdParam = z.infer<typeof fieldMappingIdSchema>;
*/

// ============================================================================
// EXPORT/IMPORT SCHEMAS
// ============================================================================

/**
 * Schema for exported search index field
 */
export const searchIndexFieldExportSchema = z.object({
    fieldName: z.string(),
    fieldType: z.string(),
    displayName: z.string().nullable().optional(),
    isSystemField: z.boolean(),
    isRequired: z.boolean(),
    isSearchable: z.boolean(),
    isFacetable: z.boolean(),
    includeInResponse: z.boolean(),
    boostValue: z.number(),
    sourceFieldName: z.string().nullable().optional(),
    sourceFieldPath: z.string().nullable().optional(),
    isMapped: z.boolean(),
    isIndexed: z.boolean(),
    isVectorSource: z.boolean(),
    isAutocomplete: z.boolean(),
    customAnalyzer: z.string().nullable().optional(),
    transformConfig: z.record(z.unknown()).optional(),
});

export type SearchIndexFieldExportDTO = z.infer<typeof searchIndexFieldExportSchema>;

/**
 * Schema for search index export
 */
export const searchIndexExportSchema = z.object({
    version: z.string(),
    exportedAt: z.string(),
    exportedBy: z.string().optional(),
    searchIndex: z.object({
        name: z.string(),
        displayName: z.string(),
        description: z.string().nullable().optional(),
        templateSlug: z.string().optional().default(''),
        searchType: searchTypeSchema,
        indexingStrategy: indexingStrategySchema,
        searchProvider: z.string().default('elasticsearch'),
        providerSettings: z.record(z.unknown()).default({}),
        // DEPRECATED ES settings (kept for backward compat in export format)
        numberOfShards: z.number().optional(),
        numberOfReplicas: z.number().optional(),
        refreshInterval: z.string().optional(),
        language: z.string(),
        synonyms: z.array(z.string()),
        stopWords: z.array(z.string()),
        analyzerConfig: z.record(z.unknown()).optional(),
        embeddingDimensions: z.number().nullable().optional(),
        vectorSimilarity: vectorSimilaritySchema.nullable().optional(),
        rrfRankConstant: z.number(),
        rrfWindowSize: z.number(),
    }),
    fields: z.array(searchIndexFieldExportSchema),
});

export type SearchIndexExportDTO = z.infer<typeof searchIndexExportSchema>;

/**
 * Schema for importing a search index
 */
export const searchIndexImportSchema = z.object({
    importData: searchIndexExportSchema,
    overrideName: z.string()
        .min(INDEX_NAME_MIN_LENGTH)
        .max(INDEX_NAME_MAX_LENGTH)
        .regex(INDEX_NAME_REGEX, 'Name must be lowercase, start with a letter, and contain only letters, numbers, hyphens, and underscores')
        .optional(),
    aiConfig: z.object({
        aiProviderId: z.string().uuid(),
        aiModelId: z.number().int().positive(),
        embeddingDimensions: z.number().int().min(64).max(4096),
    }).optional(),
});

export type SearchIndexImportDTO = z.infer<typeof searchIndexImportSchema>;