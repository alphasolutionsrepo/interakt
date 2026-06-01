// src/features/search-index/search-index-fields.types.ts

/**
 * Search Index Fields - Type Definitions
 * 
 * Types for the search_index_fields table and related operations.
 * These types support the field mapping and configuration workflow.
 */

import type { FieldType } from '@/shared/constants/field-types';
import { BulkUpdateFieldMappingsInput } from './search-index.types';

// ============================================================================
// RE-EXPORT FROM CONSTANTS (Source of Truth)
// ============================================================================

export type {
    MappingMode,
    GeneratorType,
    ValueTransform,
    ComputedAggregation,
    ComputedFilterOperator,
    ComputedFilterConfig,
    ComputedFieldConfig,
    FieldMappingConfig,
    // Legacy compatibility
    FieldTransformType,
    FieldTransformConfig,
} from '@/shared/constants/search-index.constants';

export {
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
    // Legacy compatibility
    FIELD_TRANSFORM_TYPES,
    // Helper functions
    getFieldMappingConfig,
    isLegacyConfig,
    migrateLegacyConfig,
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
} from '@/shared/constants/search-index.constants';

// ============================================================================
// RE-EXPORT FROM DB SCHEMA
// ============================================================================

export type {
    SearchIndexField,
    NewSearchIndexField,
} from '@/db/schema/search-index-fields.schema';

// ============================================================================
// RE-EXPORT FROM VALIDATION (DTO Types)
// ============================================================================

export type {
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
} from './search-index-fields.validation';

export {
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
    validateMappingConfig,
    validateMappingForFieldType,
    buildMappingConfig,
} from './search-index-fields.validation';

// ============================================================================
// DTOs FOR FIELD OPERATIONS (Interface Aliases)
// ============================================================================

/**
 * DTO for creating a search index field (during index creation)
 * Used when snapshotting template fields
 */
export interface CreateSearchIndexFieldDTO {
    // Field definition (from template)
    fieldName: string;
    fieldType: FieldType;
    displayName?: string | null;
    originalTemplateFieldId?: number | null;
    isSystemField?: boolean;

    // Search behavior (from template, can be overridden)
    isRequired?: boolean;
    isSearchable?: boolean;
    isFacetable?: boolean;
    includeInResponse?: boolean;
    boostValue?: number;

    // Source mapping (usually null at creation, set during mapping)
    sourceFieldName?: string | null;
    sourceFieldPath?: string | null;
    isMapped?: boolean;

    // Index behavior
    isIndexed?: boolean;
    isVectorSource?: boolean;
    /**
     * Enable autocomplete for this field (text fields only).
     * When true, an edge_ngram analyzer is applied for fast prefix matching.
     * Changing this requires reindexing.
     */
    isAutocomplete?: boolean;
    customAnalyzer?: string | null;

    // Mapping configuration
    mappingConfig?: import('@/shared/constants/search-index.constants').FieldMappingConfig;
}

/**
 * DTO for updating a search index field
 * Used when editing field config or setting up mappings
 */
export interface UpdateSearchIndexFieldDTO {
    // Display (editable)
    displayName?: string | null;

    // Search behavior (editable)
    isSearchable?: boolean;
    isFacetable?: boolean;
    includeInResponse?: boolean;
    boostValue?: number;

    // Source mapping (editable)
    sourceFieldName?: string | null;
    sourceFieldPath?: string | null;
    isMapped?: boolean;

    // Index behavior (editable)
    // NOTE: isAutocomplete and customAnalyzer changes require reindexing
    isIndexed?: boolean;
    isVectorSource?: boolean;
    /**
     * Enable autocomplete for this field (text fields only).
     * When true, an edge_ngram analyzer is applied for fast prefix matching.
     * Changing this requires reindexing.
     */
    isAutocomplete?: boolean;
    customAnalyzer?: string | null;

    // Mapping configuration
    mappingConfig?: Partial<import('@/shared/constants/search-index.constants').FieldMappingConfig>;

    /**
     * Provider-specific field settings (e.g. Azure isSortable, ES isAutocomplete).
     * Stored as JSON in the providerFieldSettings column.
     */
    providerFieldSettings?: Record<string, unknown>;

    /**
     * Filter value mappings for facetable fields.
     * Maps canonical values to aliases for filter validation in chat.
     * Structure: { "CanonicalValue": ["alias1", "alias2", ...] }
     */
    filterValueMappings?: Record<string, string[]>;
}

/**
 * DTO for bulk updating field mappings
 * Alias for BulkUpdateFieldMappingsInput from validation
 */
export type BulkUpdateFieldMappingsDTO = BulkUpdateFieldMappingsInput;

// ============================================================================
// SOURCE FIELD PARSING (From JSON sample)
// ============================================================================

/**
 * Inferred type from analyzing JSON values
 */
export type InferredFieldType =
    | 'string'
    | 'number'
    | 'boolean'
    | 'null'
    | 'object'
    | 'array:string'
    | 'array:number'
    | 'array:boolean'
    | 'array:object'
    | 'array:mixed'
    | 'unknown';

/**
 * A field parsed from source JSON
 */
export interface ParsedSourceField {
    /** Display name: "title" or "metadata.sku" */
    name: string;

    /** Full path: "title" or "metadata.sku" or "images[0].Url" */
    path: string;

    /** Detected type from value analysis */
    inferredType: InferredFieldType;

    /** Sample value for preview in UI */
    sampleValue: unknown;

    /** Nesting depth (0 = root level) */
    depth: number;

    /** For array fields, the detected item type */
    arrayItemType?: 'string' | 'number' | 'boolean' | 'object' | 'mixed';

    /** For object arrays, sample of the object schema */
    objectSchema?: Record<string, InferredFieldType>;
}

// ============================================================================
// MAPPING SUGGESTIONS (Auto-mapping)
// ============================================================================

/**
 * Confidence level of auto-mapping suggestion
 */
export type MappingConfidence = 'exact' | 'type_match' | 'fuzzy' | 'none';

/**
 * Type compatibility between source and template types
 */
export type TypeCompatibility = 'exact' | 'compatible' | 'coercible' | 'incompatible';

/**
 * Auto-mapping suggestion for a template field
 */
export interface MappingSuggestion {
    /** The search index field to map */
    field: {
        id: number;
        fieldName: string;
        fieldType: string;
        displayName: string | null;
        isRequired: boolean;
        isSystemField: boolean;
    };

    /** Best matching source field (null if no match) */
    suggestedSource: ParsedSourceField | null;

    /** Match confidence */
    confidence: MappingConfidence;

    /** Why this match was suggested */
    matchReason: string;

    /** Alternative source fields that could work */
    alternatives: ParsedSourceField[];

    /** Type compatibility status */
    typeCompatibility: TypeCompatibility;
}

/**
 * Result of analyzing source JSON and generating mapping suggestions
 */
export interface MappingAnalysisResult {
    /** All fields parsed from source JSON */
    sourceFields: ParsedSourceField[];

    /** Mapping suggestions for each index field */
    suggestions: MappingSuggestion[];

    /** Summary statistics */
    stats: {
        totalIndexFields: number;
        totalSourceFields: number;
        autoMappedCount: number;
        requiredUnmappedCount: number;
        unmappedSourceFields: number;
    };
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validation error for field mapping
 */
export interface FieldMappingValidationError {
    fieldId: number;
    fieldName: string;
    errorType: 'required_unmapped' | 'type_incompatible' | 'duplicate_source' | 'invalid_config';
    message: string;
}

/**
 * Result of validating field mappings before indexing
 */
export interface MappingValidationResult {
    isValid: boolean;
    errors: FieldMappingValidationError[];
    warnings: Array<{
        fieldId: number;
        fieldName: string;
        message: string;
    }>;
}

// ============================================================================
// RESPONSE TYPES
// ============================================================================

/**
 * Search index field with additional computed properties
 */
export interface SearchIndexFieldWithStatus {
    id: number;
    searchIndexId: string;
    fieldName: string;
    fieldType: string;
    displayName: string | null;
    isSystemField: boolean;
    isRequired: boolean;
    isSearchable: boolean;
    isFacetable: boolean;
    includeInResponse: boolean;
    boostValue: number;
    sourceFieldName: string | null;
    sourceFieldPath: string | null;
    isMapped: boolean;
    isIndexed: boolean;
    isVectorSource: boolean;
    /** Whether this field is enabled for autocomplete suggestions */
    isAutocomplete: boolean;
    customAnalyzer: string | null;

    // New: mapping configuration
    mappingConfig: import('@/shared/constants/search-index.constants').FieldMappingConfig;
    
    // Legacy: kept for backward compatibility
    transformConfig: import('@/shared/constants/search-index.constants').FieldTransformConfig;
    
    createdAt: Date;
    updatedAt: Date;

    // Computed/joined fields
    originalTemplateFieldId: number | null;
    originalTemplateFieldName?: string | null;
}

/**
 * Summary of field mapping status for an index
 */
export interface FieldMappingSummary {
    searchIndexId: string;
    totalFields: number;
    mappedFields: number;
    unmappedFields: number;
    requiredFields: number;
    requiredMappedFields: number;
    systemFields: number;
    customFields: number;
    
    /** Count of fields with static values configured */
    staticValueFields: number;
    
    /** Count of fields with auto-generation configured */
    generatedFields: number;
    
    /** Fields selected for additionalData collection */
    additionalDataFields: string[];
    
    isReadyForIndexing: boolean;
}

// ============================================================================
// UNMAPPED FIELD SELECTION (For additionalData)
// ============================================================================

/**
 * An unmapped source field available for selection
 */
export interface UnmappedSourceField {
    /** Field path in source JSON */
    path: string;
    
    /** Inferred type */
    type: InferredFieldType;
    
    /** Sample value for display */
    sampleValue: unknown;
    
    /** Whether this field is selected for additionalData */
    isSelected: boolean;
}

/**
 * State for additional data field selection UI
 */
export interface AdditionalDataSelectionState {
    /** All unmapped fields from source */
    availableFields: UnmappedSourceField[];
    
    /** Currently selected field paths */
    selectedPaths: string[];
}