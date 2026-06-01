// src/features/search-index/index.ts

/**
 * Search Index Feature - Public API
 * 
 * IMPORTANT: Only export client-safe items here
 * Server-only exports (service, repository, handlers) should be imported directly
 * 
 * UPDATED: Includes new FieldMappingConfig types and helpers
 */

// ============================================================================
// TYPE EXPORTS (Client-safe)
// ============================================================================

export type {
    // Enum types - Search Index
    SearchType,
    IndexingStrategy,
    IndexStatus,
    VectorSimilarity,

    // Enum types - Field Mapping
    MappingMode,
    GeneratorType,
    ValueTransform,
    ComputedAggregation,
    ComputedFilterOperator,

    // Legacy enum types (backward compatibility)
    FieldTransformType,

    // Config types
    FieldMappingConfig,
    ComputedFieldConfig,
    ComputedFilterConfig,
    AnalyzerConfig,

    // Legacy config types (backward compatibility)
    FieldTransformConfig,

    // UI constant types
    ESLanguage,
    RefreshInterval,
    FieldRequiringReindex,

    // Entity types - Search Index
    SearchIndex,
    NewSearchIndex,

    // Entity types - Search Index Fields
    SearchIndexField,
    NewSearchIndexField,

    // DTO types - Search Index
    CreateSearchIndexDTO,
    UpdateSearchIndexDTO,
    ChangeAIConfigDTO,

    // DTO types - Search Index Fields
    CreateSearchIndexFieldDTO,
    UpdateSearchIndexFieldDTO,
    BulkUpdateFieldMappingsDTO,
    
    // Validation input types
    FieldMappingConfigInput,
    ComputedFieldConfigInput,
    ComputedFilterConfigInput,
    CreateSearchIndexFieldInput,
    UpdateSearchIndexFieldInput,
    FieldMappingUpdate,
    BulkUpdateFieldMappingsInput,
    AdditionalDataConfigInput,
    AnalyzeSampleJsonInput,
    SearchIndexFieldIdParam,
    ListFieldsQuery,

    // Query types
    ListSearchIndexesQuery,
    SearchIndexIdParam,
    SearchIndexNameParam,

    // Domain types
    SearchIndexWithTemplate,
    SearchIndexComplete,
    SearchIndexSummary,
    SearchIndexListResponse,

    // Field types - Parsing
    ParsedSourceField,
    InferredFieldType,
    
    // Field types - Mapping suggestions
    MappingSuggestion,
    MappingConfidence,
    TypeCompatibility,
    MappingAnalysisResult,
    
    // Field types - Validation
    FieldMappingValidationError,
    MappingValidationResult,
    
    // Field types - UI helpers
    SearchIndexFieldWithStatus,
    FieldMappingSummary,
    UnmappedSourceField,
    AdditionalDataSelectionState,

    // Indexing types
    IndexDocument,
    IndexingResult,
    IndexStats,
    MappingSyncStatus,
} from './search-index.types';

// ============================================================================
// ENUM VALUES & INFO OBJECTS (Client-safe)
// ============================================================================

export {
    // Enum arrays - Search Index
    SEARCH_TYPES,
    INDEXING_STRATEGIES,
    INDEX_STATUSES,
    VECTOR_SIMILARITIES,

    // Enum arrays - Field Mapping
    MAPPING_MODES,
    GENERATOR_TYPES,
    VALUE_TRANSFORMS,
    COMPUTED_AGGREGATIONS,
    COMPUTED_FILTER_OPERATORS,

    // Legacy enum arrays (backward compatibility)
    FIELD_TRANSFORM_TYPES,

    // Info objects - Search Index (for UI)
    SEARCH_TYPE_INFO,
    INDEXING_STRATEGY_INFO,
    INDEX_STATUS_INFO,
    VECTOR_SIMILARITY_INFO,

    // Info objects - Field Mapping (for UI)
    MAPPING_MODE_INFO,
    GENERATOR_TYPE_INFO,
    VALUE_TRANSFORM_INFO,
    COMPUTED_AGGREGATION_INFO,
    COMPUTED_FILTER_OPERATOR_INFO,

    // Defaults
    SEARCH_INDEX_DEFAULTS,
    DEFAULT_MAPPING_CONFIG,
    SYSTEM_FIELD_MAPPING_CONFIGS,

    // Type guards & helpers - Search Index
    isValidSearchType,
    isValidIndexingStrategy,
    isValidIndexStatus,
    isValidVectorSimilarity,
    requiresAIConfiguration,
    isValidIndexName,
    INDEX_NAME_REGEX,
    INDEX_NAME_MAX_LENGTH,
    INDEX_NAME_MIN_LENGTH,

    // Type guards & helpers - Field Mapping
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

    // Config helpers
    getFieldMappingConfig,
    isLegacyConfig,
    migrateLegacyConfig,

    // UI constants for edit forms
    ES_LANGUAGES,
    REFRESH_INTERVALS,
    FIELDS_REQUIRING_REINDEX,
    fieldRequiresReindex,
    updatesRequireReindex,
} from './search-index.types';

// ============================================================================
// VALIDATION SCHEMAS (Client-safe - for form validation)
// ============================================================================

export {
    // Search Index CRUD schemas
    createSearchIndexSchema,
    updateSearchIndexSchema,
} from './search-index.validation';

export {
    // Field mapping config schemas
    fieldMappingConfigSchema,
    partialFieldMappingConfigSchema,
    computedFieldConfigSchema,
    computedFilterConfigSchema,
    computedAggregationSchema,
    computedFilterOperatorSchema,

    // Field CRUD schemas
    createSearchIndexFieldSchema,
    updateSearchIndexFieldSchema,

    // Bulk operations schemas
    fieldMappingUpdateSchema,
    bulkUpdateFieldMappingsSchema,

    // Additional data schema
    additionalDataConfigSchema,

    // Analysis schema
    analyzeSampleJsonSchema,

    // Validation helpers
    validateMappingConfig,
    validateMappingForFieldType,
    buildMappingConfig,
} from './search-index.types';

// ============================================================================
// NOTE: Server-only imports
// ============================================================================

/**
 * For server-side code, import directly:
 * 
 * import * as searchIndexService from '@/features/search-index/search-index.service';
 * import * as searchIndexRepository from '@/features/search-index/search-index.repository';
 * import * as fieldsService from '@/features/search-index/search-index-fields.service';
 * import * as fieldsRepository from '@/features/search-index/search-index-fields.repository';
 * import * as handlers from '@/features/search-index/search-index.api.handlers';
 */