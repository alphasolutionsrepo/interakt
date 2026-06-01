// src/features/search-index/search-index.types.ts

/**
 * Search Index Feature - Type Definitions
 * 
 * Re-exports validation types + domain-specific types
 * 
 * UPDATED: Includes new FieldMappingConfig types
 */

// ============================================================================
// RE-EXPORT FROM CONSTANTS (Source of Truth for Enums)
// ============================================================================

export type {
    SearchType,
    IndexingStrategy,
    IndexStatus,
    VectorSimilarity,
    AnalyzerConfig,

    // New mapping config types
    MappingMode,
    GeneratorType,
    ValueTransform,
    ComputedAggregation,
    ComputedFilterOperator,
    ComputedFilterConfig,
    ComputedFieldConfig,
    FieldMappingConfig,

    // Legacy (backward compatibility)
    FieldTransformType,
    FieldTransformConfig,
} from '@/shared/constants/search-index.constants';

export {
    SEARCH_TYPES,
    INDEXING_STRATEGIES,
    INDEX_STATUSES,
    VECTOR_SIMILARITIES,
    SEARCH_TYPE_INFO,
    INDEXING_STRATEGY_INFO,
    INDEX_STATUS_INFO,
    VECTOR_SIMILARITY_INFO,
    SEARCH_INDEX_DEFAULTS,
    isValidSearchType,
    isValidIndexingStrategy,
    isValidIndexStatus,
    isValidVectorSimilarity,
    requiresAIConfiguration,
    isValidIndexName,
    INDEX_NAME_REGEX,
    INDEX_NAME_MAX_LENGTH,
    INDEX_NAME_MIN_LENGTH,

    // New mapping config exports
    MAPPING_MODES,
    GENERATOR_TYPES,
    VALUE_TRANSFORMS,
    COMPUTED_AGGREGATIONS,
    COMPUTED_FILTER_OPERATORS,
    MAPPING_MODE_INFO,
    GENERATOR_TYPE_INFO,
    VALUE_TRANSFORM_INFO,
    COMPUTED_AGGREGATION_INFO,
    COMPUTED_FILTER_OPERATOR_INFO,
    DEFAULT_MAPPING_CONFIG,
    SYSTEM_FIELD_MAPPING_CONFIGS,
    isValidMappingMode,
    isValidGeneratorType,
    isValidValueTransform,
    isValidComputedAggregation,
    isValidComputedFilterOperator,
    modeRequiresSource,
    modeRequiresStaticValue,
    modeAllowsFallback,
    modeRequiresComputed,
    getComputedAggregationOutputType,
    filterOperatorRequiresValue,
    getFieldMappingConfig,
    isLegacyConfig,
    migrateLegacyConfig,

    // Legacy (backward compatibility)
    FIELD_TRANSFORM_TYPES,

    // UI constants for edit forms
    ES_LANGUAGES,
    REFRESH_INTERVALS,
    FIELDS_REQUIRING_REINDEX,
    fieldRequiresReindex,
    updatesRequireReindex,
} from '@/shared/constants/search-index.constants';

export type {
    ESLanguage,
    RefreshInterval,
    FieldRequiringReindex,
} from '@/shared/constants/search-index.constants';

// ============================================================================
// RE-EXPORT FROM VALIDATION (Source of Truth for DTOs)
// ============================================================================

export type {
    // Search Index DTOs
    CreateSearchIndexDTO,
    UpdateSearchIndexDTO,
    ChangeAIConfigDTO,

    // Query Types
    ListSearchIndexesQuery,
    SearchIndexIdParam,
    SearchIndexNameParam,
} from './search-index.validation';

// ============================================================================
// RE-EXPORT FROM FIELD TYPES
// ============================================================================

export type {
    // Field DTOs
    CreateSearchIndexFieldDTO,
    UpdateSearchIndexFieldDTO,
    BulkUpdateFieldMappingsDTO,

    // Validation input types
    FieldMappingConfigInput,
    ComputedFilterConfigInput,
    ComputedFieldConfigInput,
    CreateSearchIndexFieldInput,
    UpdateSearchIndexFieldInput,
    FieldMappingUpdate,
    BulkUpdateFieldMappingsInput,
    AdditionalDataConfigInput,
    AnalyzeSampleJsonInput,
    SearchIndexFieldIdParam,
    ListFieldsQuery,

    // Parsed source types
    ParsedSourceField,
    InferredFieldType,

    // Mapping suggestion types
    MappingSuggestion,
    MappingConfidence,
    TypeCompatibility,
    MappingAnalysisResult,

    // Validation types
    FieldMappingValidationError,
    MappingValidationResult,

    // UI helper types
    SearchIndexFieldWithStatus,
    FieldMappingSummary,
    UnmappedSourceField,
    AdditionalDataSelectionState,
} from './search-index-fields.types';

export {
    // Validation schemas
    fieldMappingConfigSchema,
    partialFieldMappingConfigSchema,
    computedFilterConfigSchema,
    computedFieldConfigSchema,
    computedAggregationSchema,
    computedFilterOperatorSchema,
    createSearchIndexFieldSchema,
    updateSearchIndexFieldSchema,
    fieldMappingUpdateSchema,
    bulkUpdateFieldMappingsSchema,
    additionalDataConfigSchema,
    analyzeSampleJsonSchema,

    // Validation helpers
    validateMappingConfig,
    validateMappingForFieldType,
    buildMappingConfig,
} from './search-index-fields.types';

// ============================================================================
// RE-EXPORT FROM DB SCHEMA (Entity types)
// ============================================================================

export type {
    SearchIndex,
    NewSearchIndex,
} from '@/db/schema/search-index.schema';

export type {
    SearchIndexField,
    NewSearchIndexField,
} from '@/db/schema/search-index-fields.schema';

// ============================================================================
// DOMAIN TYPES (Composite/Computed Types)
// ============================================================================

/**
 * Search index with template info (for list views)
 */
export interface SearchIndexWithTemplate {
    id: string;
    name: string;
    displayName: string;
    description: string | null;
    searchType: string;
    indexingStrategy: string;
    searchProvider: string;
    status: string;
    documentCount: number;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;

    // Data template ID (templates feature removed, kept for legacy references)
    dataTemplateId?: number | null;

    // Joined template info (deprecated - templates feature removed)
    dataTemplate?: {
        id: number;
        name: string;
        slug: string;
        description: string | null;
    } | null;
}

/**
 * Complete search index with all related data
 */
export interface SearchIndexComplete extends SearchIndexWithTemplate {
    // Provider-specific settings (JSON blob)
    providerSettings: Record<string, unknown>;

    // ES settings (DEPRECATED — use providerSettings)
    numberOfShards: number;
    numberOfReplicas: number;
    refreshInterval: string;

    // Text analysis
    language: string;
    synonyms: string[];
    stopWords: string[];
    analyzerConfig: Record<string, unknown>;
    
    // AI configuration
    aiProviderId: string | null;
    aiModelId: number | null;
    embeddingDimensions: number | null;
    vectorSimilarity: string | null;
    
    // Hybrid search
    rrfRankConstant: number;
    rrfWindowSize: number;
    
    // State
    indexSizeBytes: number;
    lastIndexedAt: Date | null;
    mappingVersion: number;
    lastMappingSyncedAt: Date | null;
    requiresReindex: boolean;
    
    // Related data
    fields: import('@/db/schema/search-index-fields.schema').SearchIndexField[];
    
    // AI provider info (if set)
    aiProvider?: {
        id: string;
        displayName: string;
        providerKey: string;
    };
    
    // AI model info (if set)
    aiModel?: {
        id: number;
        displayName: string;
        modelKey: string;
        dimensions: number | null;
    };
}

/**
 * Summary view for search index cards/lists
 */
export interface SearchIndexSummary {
    id: string;
    name: string;
    displayName: string;
    description: string | null;
    searchType: string;
    searchProvider: string;
    status: string;
    documentCount: number;
    isActive: boolean;
    createdAt: Date;
    
    // Template info (deprecated - templates feature removed)
    templateName: string | null;
    templateSlug: string;
    
    // Field summary
    totalFields: number;
    mappedFields: number;
    
    // AI info
    hasAiConfig: boolean;
    aiProviderName?: string;
}

/**
 * Paginated list response
 */
export interface SearchIndexListResponse {
    items: SearchIndexSummary[];
    pagination: {
        page: number;
        pageSize: number;
        totalItems: number;
        totalPages: number;
    };
}

// ============================================================================
// INDEXING TYPES
// ============================================================================

/**
 * A document to be indexed
 */
export interface IndexDocument {
    /** Unique identifier for the document */
    id: string;
    
    /** Source data from user */
    source: Record<string, unknown>;
    
    /** Transformed data ready for ES */
    transformed?: Record<string, unknown>;
    
    /** Vector embedding (if semantic/hybrid) */
    embedding?: number[];
}

/**
 * Result of indexing operation
 */
export interface IndexingResult {
    success: boolean;
    documentsProcessed: number;
    documentsIndexed: number;
    documentsFailed: number;
    errors: Array<{
        documentId: string;
        error: string;
    }>;
    duration: number;
}

/**
 * Index statistics
 */
export interface IndexStats {
    documentCount: number;
    indexSizeBytes: number;
    lastIndexedAt: Date | null;
    health: 'green' | 'yellow' | 'red';
}

/**
 * Mapping sync status
 */
export interface MappingSyncStatus {
    isSynced: boolean;
    requiresReindex: boolean;
    lastSyncedAt: Date | null;
    pendingChanges: string[];
}