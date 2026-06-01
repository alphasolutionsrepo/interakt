// src/shared/constants/search-index.constants.ts

/**
 * Search Index Constants
 * SINGLE SOURCE OF TRUTH - Client-safe constants
 * 
 * NOTE: When modifying enums, also update:
 * - db/schema/enums.schema.ts (corresponding pgEnums)
 */

// ============================================================================
// SEARCH TYPE
// ============================================================================

export const SEARCH_TYPES = ['lexical', 'semantic', 'hybrid'] as const;
export type SearchType = typeof SEARCH_TYPES[number];

export const SEARCH_TYPE_INFO: Record<SearchType, {
    label: string;
    description: string;
    requiresAI: boolean;
}> = {
    lexical: {
        label: 'Lexical (Text)',
        description: 'Traditional keyword-based search using text matching and analyzers',
        requiresAI: false,
    },
    semantic: {
        label: 'Semantic (Vector)',
        description: 'AI-powered search using embeddings and vector similarity',
        requiresAI: true,
    },
    hybrid: {
        label: 'Hybrid',
        description: 'Combines lexical and semantic search with RRF fusion',
        requiresAI: true,
    },
};

// ============================================================================
// INDEXING STRATEGY
// ============================================================================

export const INDEXING_STRATEGIES = ['on_upload', 'scheduled', 'manual'] as const;
export type IndexingStrategy = typeof INDEXING_STRATEGIES[number];

export const INDEXING_STRATEGY_INFO: Record<IndexingStrategy, {
    label: string;
    description: string;
}> = {
    on_upload: {
        label: 'On Upload',
        description: 'Documents are indexed immediately when uploaded',
    },
    scheduled: {
        label: 'Scheduled',
        description: 'Documents are indexed on a schedule (batch processing)',
    },
    manual: {
        label: 'Manual',
        description: 'Documents are indexed only when explicitly triggered',
    },
};

// ============================================================================
// INDEX STATUS
// ============================================================================

export const INDEX_STATUSES = ['creating', 'ready', 'indexing', 'error', 'offline'] as const;
export type IndexStatus = typeof INDEX_STATUSES[number];

export const INDEX_STATUS_INFO: Record<IndexStatus, {
    label: string;
    description: string;
    color: 'default' | 'success' | 'warning' | 'destructive';
}> = {
    creating: {
        label: 'Creating',
        description: 'Index is being created in Elasticsearch',
        color: 'default',
    },
    ready: {
        label: 'Ready',
        description: 'Index is ready for search and indexing',
        color: 'success',
    },
    indexing: {
        label: 'Indexing',
        description: 'Documents are currently being indexed',
        color: 'warning',
    },
    error: {
        label: 'Error',
        description: 'Index encountered an error',
        color: 'destructive',
    },
    offline: {
        label: 'Offline',
        description: 'Index is offline and not available',
        color: 'destructive',
    },
};

// ============================================================================
// VECTOR SIMILARITY
// ============================================================================

export const VECTOR_SIMILARITIES = ['cosine', 'euclidean', 'dot_product'] as const;
export type VectorSimilarity = typeof VECTOR_SIMILARITIES[number];

export const VECTOR_SIMILARITY_INFO: Record<VectorSimilarity, {
    label: string;
    description: string;
    recommended: boolean;
}> = {
    cosine: {
        label: 'Cosine Similarity',
        description: 'Measures angle between vectors. Best for normalized embeddings.',
        recommended: true,
    },
    euclidean: {
        label: 'Euclidean Distance',
        description: 'Measures straight-line distance. Good for spatial data.',
        recommended: false,
    },
    dot_product: {
        label: 'Dot Product',
        description: 'Fast computation. Use when vectors are normalized.',
        recommended: false,
    },
};

// ============================================================================
// FIELD MAPPING MODES
// Determines how a field's value is resolved during document transformation
// ============================================================================

export const MAPPING_MODES = [
    'source',     // Map from source JSON field
    'static',     // Fixed value for all documents
    'default',    // Source value OR fallback if missing
    'generated',  // Auto-generate (UUID, timestamp)
    'computed',   // Compute from nested array (extract + aggregate)
    'collect',    // Collect multiple fields (for additionalData)
    'reference',  // Reference another field's source (for uniqueId)
    'none',       // Don't populate this field
] as const;

export type MappingMode = typeof MAPPING_MODES[number];

export const MAPPING_MODE_INFO: Record<MappingMode, {
    label: string;
    description: string;
    requiresSource: boolean;
    requiresValue: boolean;
}> = {
    source: {
        label: 'Source Field',
        description: 'Map value from a field in the source JSON document',
        requiresSource: true,
        requiresValue: false,
    },
    static: {
        label: 'Static Value',
        description: 'Use a fixed value for all documents',
        requiresSource: false,
        requiresValue: true,
    },
    default: {
        label: 'Default (with fallback)',
        description: 'Use source value if present, otherwise use fallback value',
        requiresSource: true,
        requiresValue: true,
    },
    generated: {
        label: 'Auto-Generate',
        description: 'Automatically generate a value (UUID, timestamp)',
        requiresSource: false,
        requiresValue: false,
    },
    computed: {
        label: 'Computed',
        description: 'Extract and aggregate values from a nested array field',
        requiresSource: false,
        requiresValue: false,
    },
    collect: {
        label: 'Collect Fields',
        description: 'Collect selected unmapped source fields into this field',
        requiresSource: false,
        requiresValue: false,
    },
    reference: {
        label: 'Copy From Field',
        description: 'Use the same source value as another mapped field (e.g., use productId as uniqueId)',
        requiresSource: false,
        requiresValue: false,
    },
    none: {
        label: 'Not Mapped',
        description: 'Do not populate this field (will be null/missing)',
        requiresSource: false,
        requiresValue: false,
    },
};

// ============================================================================
// COMPUTED FIELD AGGREGATIONS
// For mode='computed' - how to aggregate extracted values from arrays
// ============================================================================

export const COMPUTED_AGGREGATIONS = [
    'unique',     // Unique values → array
    'min',        // Minimum → number
    'max',        // Maximum → number
    'sum',        // Sum → number
    'avg',        // Average → number
    'count',      // Count → number
    'any',        // Any true → boolean
    'all',        // All true → boolean
    'first',      // First value → single
    'last',       // Last value → single
    'flatten',    // Flatten nested arrays → array
] as const;

export type ComputedAggregation = typeof COMPUTED_AGGREGATIONS[number];

export const COMPUTED_AGGREGATION_INFO: Record<ComputedAggregation, {
    label: string;
    description: string;
    outputType: 'array' | 'number' | 'boolean' | 'single';
    example: string;
}> = {
    unique: {
        label: 'Unique Values',
        description: 'Extract unique values into an array',
        outputType: 'array',
        example: '["Red", "Blue", "Green"]',
    },
    min: {
        label: 'Minimum',
        description: 'Get the minimum numeric value',
        outputType: 'number',
        example: '29.99',
    },
    max: {
        label: 'Maximum',
        description: 'Get the maximum numeric value',
        outputType: 'number',
        example: '199.99',
    },
    sum: {
        label: 'Sum',
        description: 'Sum all numeric values',
        outputType: 'number',
        example: '150',
    },
    avg: {
        label: 'Average',
        description: 'Calculate the average of numeric values',
        outputType: 'number',
        example: '75.5',
    },
    count: {
        label: 'Count',
        description: 'Count the number of items',
        outputType: 'number',
        example: '5',
    },
    any: {
        label: 'Any True',
        description: 'True if any value is truthy (OR)',
        outputType: 'boolean',
        example: 'true',
    },
    all: {
        label: 'All True',
        description: 'True only if all values are truthy (AND)',
        outputType: 'boolean',
        example: 'false',
    },
    first: {
        label: 'First Value',
        description: 'Get the first value from the array',
        outputType: 'single',
        example: '"Red"',
    },
    last: {
        label: 'Last Value',
        description: 'Get the last value from the array',
        outputType: 'single',
        example: '"Blue"',
    },
    flatten: {
        label: 'Flatten',
        description: 'Flatten nested arrays into a single array',
        outputType: 'array',
        example: '["a", "b", "c"]',
    },
};

// ============================================================================
// COMPUTED FILTER OPERATORS
// For filtering array items before aggregation
// ============================================================================

export const COMPUTED_FILTER_OPERATORS = [
    'eq',      // Equals
    'neq',     // Not equals
    'gt',      // Greater than
    'gte',     // Greater than or equal
    'lt',      // Less than
    'lte',     // Less than or equal
    'exists',  // Field exists and is not null
] as const;

export type ComputedFilterOperator = typeof COMPUTED_FILTER_OPERATORS[number];

export const COMPUTED_FILTER_OPERATOR_INFO: Record<ComputedFilterOperator, {
    label: string;
    description: string;
    requiresValue: boolean;
}> = {
    eq: {
        label: 'Equals',
        description: 'Value equals the specified value',
        requiresValue: true,
    },
    neq: {
        label: 'Not Equals',
        description: 'Value does not equal the specified value',
        requiresValue: true,
    },
    gt: {
        label: 'Greater Than',
        description: 'Value is greater than the specified value',
        requiresValue: true,
    },
    gte: {
        label: 'Greater or Equal',
        description: 'Value is greater than or equal to the specified value',
        requiresValue: true,
    },
    lt: {
        label: 'Less Than',
        description: 'Value is less than the specified value',
        requiresValue: true,
    },
    lte: {
        label: 'Less or Equal',
        description: 'Value is less than or equal to the specified value',
        requiresValue: true,
    },
    exists: {
        label: 'Exists',
        description: 'Field exists and is not null/undefined',
        requiresValue: false,
    },
};

/**
 * Filter configuration for computed fields
 * Applied to array items before extraction
 */
export interface ComputedFilterConfig {
    /** Field path within each array item to filter on */
    field: string;
    /** Comparison operator */
    operator: ComputedFilterOperator;
    /** Value to compare against (not required for 'exists') */
    value?: unknown;
}

/**
 * Configuration for computed/derived fields
 * Used when mode='computed'
 *
 * @example Extract unique colors from variants
 * {
 *   sourceArrayPath: 'variants',
 *   extractField: 'color',
 *   aggregation: 'unique'
 * }
 *
 * @example Get minimum price from variants
 * {
 *   sourceArrayPath: 'variants',
 *   extractField: 'price',
 *   aggregation: 'min'
 * }
 *
 * @example Check if any variant is in stock
 * {
 *   sourceArrayPath: 'variants',
 *   extractField: 'inStock',
 *   aggregation: 'any'
 * }
 *
 * @example Get sizes only for in-stock variants
 * {
 *   sourceArrayPath: 'variants',
 *   extractField: 'size',
 *   aggregation: 'unique',
 *   filter: { field: 'inStock', operator: 'eq', value: true }
 * }
 */
export interface ComputedFieldConfig {
    /**
     * Path to the source array in the document
     * e.g., "variants", "images", "reviews"
     */
    sourceArrayPath: string;

    /**
     * Field to extract from each array item
     * e.g., "color", "price", "inStock"
     * Supports nested paths: "pricing.amount"
     */
    extractField: string;

    /**
     * How to aggregate the extracted values
     */
    aggregation: ComputedAggregation;

    /**
     * Optional filter to apply to array items before extraction
     * e.g., only extract from in-stock variants
     */
    filter?: ComputedFilterConfig;
}

// ============================================================================
// VALUE GENERATORS
// For mode='generated' - how to auto-generate values
// ============================================================================

export const GENERATOR_TYPES = ['uuid', 'timestamp', 'current_date'] as const;
export type GeneratorType = typeof GENERATOR_TYPES[number];

export const GENERATOR_TYPE_INFO: Record<GeneratorType, {
    label: string;
    description: string;
    outputType: string;
    example: string;
}> = {
    uuid: {
        label: 'UUID',
        description: 'Generate a unique identifier (UUID v4)',
        outputType: 'keyword',
        example: '550e8400-e29b-41d4-a716-446655440000',
    },
    timestamp: {
        label: 'Timestamp',
        description: 'Current date and time (ISO 8601)',
        outputType: 'datetime',
        example: '2025-01-15T10:30:00.000Z',
    },
    current_date: {
        label: 'Current Date',
        description: 'Current date only (no time)',
        outputType: 'date',
        example: '2025-01-15',
    },
};

// ============================================================================
// VALUE TRANSFORMS
// Applied AFTER value is resolved (for string manipulation)
// ============================================================================

export const VALUE_TRANSFORMS = ['none', 'lowercase', 'uppercase', 'trim', 'trim_lowercase'] as const;
export type ValueTransform = typeof VALUE_TRANSFORMS[number];

export const VALUE_TRANSFORM_INFO: Record<ValueTransform, {
    label: string;
    description: string;
}> = {
    none: {
        label: 'None',
        description: 'No transformation applied',
    },
    lowercase: {
        label: 'Lowercase',
        description: 'Convert to lowercase',
    },
    uppercase: {
        label: 'Uppercase',
        description: 'Convert to uppercase',
    },
    trim: {
        label: 'Trim',
        description: 'Remove leading and trailing whitespace',
    },
    trim_lowercase: {
        label: 'Trim + Lowercase',
        description: 'Trim whitespace and convert to lowercase',
    },
};

// ============================================================================
// FIELD MAPPING CONFIG
// Complete configuration for how a field's value is resolved and transformed
// ============================================================================

/**
 * Configuration for field value resolution during document indexing
 *
 * This replaces the old FieldTransformConfig and provides complete control
 * over how each field gets its value.
 *
 * @example Source mapping (most common)
 * { mode: 'source', transform: 'trim' }
 *
 * @example Static value
 * { mode: 'static', staticValue: 'en', transform: 'none' }
 *
 * @example Default with fallback
 * { mode: 'default', staticValue: 'uncategorized', transform: 'lowercase' }
 *
 * @example Auto-generate UUID
 * { mode: 'generated', generator: 'uuid', transform: 'none' }
 *
 * @example Computed from nested array
 * { mode: 'computed', computed: { sourceArrayPath: 'variants', extractField: 'color', aggregation: 'unique' } }
 *
 * @example Collect unmapped fields (for additionalData)
 * { mode: 'collect', collectFields: ['metadata', 'extra_info'], transform: 'none' }
 *
 * @example Reference another field's source (for uniqueId)
 * { mode: 'reference', sourceFromField: 'productId', transform: 'none' }
 */
export interface FieldMappingConfig {
    /**
     * How to resolve the field's value
     * @default 'source'
     */
    mode: MappingMode;

    /**
     * Static value to use
     * - For mode='static': The value for all documents
     * - For mode='default': Fallback if source is null/undefined
     */
    staticValue?: unknown;

    /**
     * Generator type for auto-generated values
     * Only used when mode='generated'
     */
    generator?: GeneratorType;

    /**
     * Configuration for computed fields
     * Only used when mode='computed'
     * Extracts and aggregates values from nested arrays
     */
    computed?: ComputedFieldConfig;

    /**
     * Source fields to collect
     * Only used when mode='collect' (for additionalData field)
     * List of source field paths to include
     */
    collectFields?: string[];

    /**
     * Name of another index field to copy the source path from
     * Only used when mode='reference'
     * Allows uniqueId to use same source as another field (e.g., productId)
     * without violating the unique source constraint
     */
    sourceFromField?: string;

    /**
     * Transform to apply after value is resolved
     * @default 'none'
     */
    transform?: ValueTransform;
}

/**
 * Default mapping config for new fields
 * Source mode with no transformation
 */
export const DEFAULT_MAPPING_CONFIG: FieldMappingConfig = {
    mode: 'source',
    transform: 'none',
};

/**
 * Mapping config for system fields that don't need source mapping
 */
export const SYSTEM_FIELD_MAPPING_CONFIGS: Record<string, FieldMappingConfig> = {
    // uniqueId: Try source first, generate UUID if missing
    uniqueId: {
        mode: 'default',
        generator: 'uuid',
        transform: 'none',
    },
    // additionalData: Collect mode (fields selected by user)
    additionalData: {
        mode: 'collect',
        collectFields: [],
        transform: 'none',
    },
    // customFields: Source mode (expects object from source or UI)
    customFields: {
        mode: 'source',
        transform: 'none',
    },
    // language: Static default, can be overridden
    language: {
        mode: 'static',
        staticValue: 'en',
        transform: 'none',
    },
    // createdAt: Generate timestamp
    createdAt: {
        mode: 'generated',
        generator: 'timestamp',
        transform: 'none',
    },
    // updatedAt: Generate timestamp
    updatedAt: {
        mode: 'generated',
        generator: 'timestamp',
        transform: 'none',
    },
};

// ============================================================================
// BACKWARD COMPATIBILITY
// Keep old types as aliases during migration
// ============================================================================

/**
 * Legacy transform types (includes 'custom' which is no longer used)
 * @deprecated Use VALUE_TRANSFORMS instead
 */
export const LEGACY_TRANSFORM_TYPES = ['none', 'lowercase', 'uppercase', 'trim', 'custom'] as const;
export type LegacyTransformType = typeof LEGACY_TRANSFORM_TYPES[number];

/**
 * @deprecated Use VALUE_TRANSFORMS instead
 */
export const FIELD_TRANSFORM_TYPES = LEGACY_TRANSFORM_TYPES;

/**
 * @deprecated Use ValueTransform instead
 */
export type FieldTransformType = LegacyTransformType;

/**
 * @deprecated Use FieldMappingConfig instead
 * Kept for backward compatibility with existing database values
 */
export interface FieldTransformConfig {
    type: LegacyTransformType;
    customFunction?: string;
    parameters?: Record<string, unknown>;
}

/**
 * Convert legacy FieldTransformConfig to new FieldMappingConfig
 */
export function migrateLegacyConfig(legacy: FieldTransformConfig): FieldMappingConfig {
    // Map legacy 'custom' type to 'none' since custom transforms are deprecated
    const transform: ValueTransform =
        legacy.type === 'custom' ? 'none' :
            legacy.type === 'trim' ? 'trim' :
                legacy.type === 'lowercase' ? 'lowercase' :
                    legacy.type === 'uppercase' ? 'uppercase' :
                        'none';

    return {
        mode: 'source',
        transform,
    };
}

/**
 * Check if a config is legacy format
 */
export function isLegacyConfig(config: unknown): config is FieldTransformConfig {
    return (
        typeof config === 'object' &&
        config !== null &&
        'type' in config &&
        !('mode' in config)
    );
}

/**
 * Get FieldMappingConfig from stored value (handles legacy format)
 */
export function getFieldMappingConfig(stored: unknown): FieldMappingConfig {
    if (!stored) {
        return DEFAULT_MAPPING_CONFIG;
    }

    if (isLegacyConfig(stored)) {
        return migrateLegacyConfig(stored);
    }

    return stored as FieldMappingConfig;
}

// ============================================================================
// ANALYZER CONFIG
// ============================================================================

/**
 * Configuration for text analysis in Elasticsearch
 */
export interface AnalyzerConfig {
    tokenizer?: string;
    filters?: string[];
    charFilters?: string[];
}

// ============================================================================
// AUTOCOMPLETE ANALYZER DEFINITIONS
// Predefined analyzers for autocomplete functionality
// ============================================================================

/**
 * ES-specific constants re-exported for backward compatibility.
 * @deprecated Import from '@/features/search/providers/elasticsearch/elasticsearch.constants' instead.
 */
export {
    PREDEFINED_ANALYZERS,
    PREDEFINED_ANALYZER_INFO,
    AUTOCOMPLETE_ANALYZER_SETTINGS,
    AUTOCOMPLETE_COMPATIBLE_FIELD_TYPES,
    isAutocompleteCompatibleFieldType,
    type PredefinedAnalyzer,
    type ElasticsearchSettings,
} from '@/features/search/providers/elasticsearch/elasticsearch.constants';

// ============================================================================
// DEFAULT VALUES
// ============================================================================

export const SEARCH_INDEX_DEFAULTS = {
    // Elasticsearch settings
    numberOfShards: 1,
    numberOfReplicas: 0,
    refreshInterval: '1s',

    // Text analysis
    language: 'english',

    // Hybrid search RRF
    rrfRankConstant: 60,
    rrfWindowSize: 100,

    // Vector search
    vectorSimilarity: 'cosine' as VectorSimilarity,
} as const;

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Validate index name for Elasticsearch compatibility
 * ES requirements: lowercase, no spaces, no special chars except - and _
 */
export const INDEX_NAME_REGEX = /^[a-z][a-z0-9_-]*$/;
export const INDEX_NAME_MAX_LENGTH = 128;
export const INDEX_NAME_MIN_LENGTH = 2;

export function isValidIndexName(name: string): boolean {
    return (
        name.length >= INDEX_NAME_MIN_LENGTH &&
        name.length <= INDEX_NAME_MAX_LENGTH &&
        INDEX_NAME_REGEX.test(name)
    );
}

/**
 * Type guards
 */
export function isValidSearchType(value: string): value is SearchType {
    return SEARCH_TYPES.includes(value as SearchType);
}

export function isValidIndexingStrategy(value: string): value is IndexingStrategy {
    return INDEXING_STRATEGIES.includes(value as IndexingStrategy);
}

export function isValidIndexStatus(value: string): value is IndexStatus {
    return INDEX_STATUSES.includes(value as IndexStatus);
}

export function isValidVectorSimilarity(value: string): value is VectorSimilarity {
    return VECTOR_SIMILARITIES.includes(value as VectorSimilarity);
}

export function isValidMappingMode(value: string): value is MappingMode {
    return MAPPING_MODES.includes(value as MappingMode);
}

export function isValidGeneratorType(value: string): value is GeneratorType {
    return GENERATOR_TYPES.includes(value as GeneratorType);
}

export function isValidValueTransform(value: string): value is ValueTransform {
    return VALUE_TRANSFORMS.includes(value as ValueTransform);
}

export function isValidComputedAggregation(value: string): value is ComputedAggregation {
    return COMPUTED_AGGREGATIONS.includes(value as ComputedAggregation);
}

export function isValidComputedFilterOperator(value: string): value is ComputedFilterOperator {
    return COMPUTED_FILTER_OPERATORS.includes(value as ComputedFilterOperator);
}

export function requiresAIConfiguration(searchType: SearchType): boolean {
    return searchType === 'semantic' || searchType === 'hybrid';
}

/**
 * Check if a mapping mode requires a source field to be set
 */
export function modeRequiresSource(mode: MappingMode): boolean {
    return mode === 'source' || mode === 'default';
}

/**
 * Check if a mapping mode requires a static value
 */
export function modeRequiresStaticValue(mode: MappingMode): boolean {
    return mode === 'static';
}

/**
 * Check if a mapping mode can have a fallback value
 */
export function modeAllowsFallback(mode: MappingMode): boolean {
    return mode === 'default';
}

/**
 * Check if a mapping mode requires computed configuration
 */
export function modeRequiresComputed(mode: MappingMode): boolean {
    return mode === 'computed';
}

/**
 * Get the expected output type for a computed aggregation
 */
export function getComputedAggregationOutputType(
    aggregation: ComputedAggregation
): 'array' | 'number' | 'boolean' | 'single' {
    return COMPUTED_AGGREGATION_INFO[aggregation].outputType;
}

/**
 * Check if a filter operator requires a comparison value
 */
export function filterOperatorRequiresValue(operator: ComputedFilterOperator): boolean {
    return COMPUTED_FILTER_OPERATOR_INFO[operator].requiresValue;
}

/**
 * ES-specific language and refresh interval constants re-exported for backward compatibility.
 * @deprecated Import from '@/features/search/providers/elasticsearch/elasticsearch.constants' instead.
 */
export {
    ES_LANGUAGES,
    REFRESH_INTERVALS,
    type ESLanguage,
    type RefreshInterval,
} from '@/features/search/providers/elasticsearch/elasticsearch.constants';

// ============================================================================
// FIELDS REQUIRING REINDEX
// Fields that when changed require a full reindex of documents
// ============================================================================

/**
 * Index-level fields that require reindex when changed
 */
export const FIELDS_REQUIRING_REINDEX = [
    'language',
    'synonyms',
    'stopWords',
    'analyzerConfig',
] as const;

/**
 * Field-level settings that require reindex when changed
 * These are properties on search_index_fields that affect ES mappings
 */
export const FIELD_SETTINGS_REQUIRING_REINDEX = [
    'isAutocomplete',
    'customAnalyzer',
    'fieldType',
] as const;

export type FieldRequiringReindex = typeof FIELDS_REQUIRING_REINDEX[number];

/**
 * Check if updating a field requires reindexing
 */
export function fieldRequiresReindex(field: string): boolean {
    return FIELDS_REQUIRING_REINDEX.includes(field as FieldRequiringReindex);
}

/**
 * Check if any of the updated fields require reindexing
 */
export function updatesRequireReindex(updatedFields: string[]): boolean {
    return updatedFields.some(field => fieldRequiresReindex(field));
}