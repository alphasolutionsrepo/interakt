// src/features/search-index/search-index-fields.validation.ts

/**
 * Search Index Fields - Validation Schemas
 * 
 * Zod schemas for validating field-related API requests.
 * SINGLE SOURCE OF TRUTH for field DTOs.
 */

import { z } from 'zod';
import { FIELD_TYPES } from '@/shared/constants/field-types';
import {
    MAPPING_MODES,
    GENERATOR_TYPES,
    VALUE_TRANSFORMS,
    COMPUTED_AGGREGATIONS,
    COMPUTED_FILTER_OPERATORS,
    DEFAULT_MAPPING_CONFIG,
    isAutocompleteCompatibleFieldType,
} from '@/shared/constants/search-index.constants';

// ============================================================================
// BASE SCHEMAS (Enums)
// ============================================================================

export const fieldTypeSchema = z.enum(FIELD_TYPES);

export const mappingModeSchema = z.enum(MAPPING_MODES);

export const generatorTypeSchema = z.enum(GENERATOR_TYPES);

export const valueTransformSchema = z.enum(VALUE_TRANSFORMS);

export const computedAggregationSchema = z.enum(COMPUTED_AGGREGATIONS);

export const computedFilterOperatorSchema = z.enum(COMPUTED_FILTER_OPERATORS);

// ============================================================================
// COMPUTED FIELD CONFIG SCHEMAS
// For mode='computed' - extract and aggregate values from nested arrays
// ============================================================================

/**
 * Schema for filter configuration in computed fields
 */
export const computedFilterConfigSchema = z.object({
    /** Field path within each array item to filter on */
    field: z.string().min(1).max(255),
    /** Comparison operator */
    operator: computedFilterOperatorSchema,
    /** Value to compare against (not required for 'exists') */
    value: z.unknown().optional(),
}).refine(
    (data) => {
        // 'exists' operator doesn't require a value
        if (data.operator === 'exists') {
            return true;
        }
        // All other operators require a value
        return data.value !== undefined;
    },
    {
        message: 'value is required for this operator',
        path: ['value'],
    }
);

export type ComputedFilterConfigInput = z.infer<typeof computedFilterConfigSchema>;

/**
 * Schema for computed field configuration
 */
export const computedFieldConfigSchema = z.object({
    /** Path to the source array in the document */
    sourceArrayPath: z.string().min(1).max(255),
    /** Field to extract from each array item */
    extractField: z.string().min(1).max(255),
    /** How to aggregate the extracted values */
    aggregation: computedAggregationSchema,
    /** Optional filter to apply before extraction */
    filter: computedFilterConfigSchema.optional(),
});

export type ComputedFieldConfigInput = z.infer<typeof computedFieldConfigSchema>;

// ============================================================================
// FIELD MAPPING CONFIG SCHEMA
// The main configuration for how a field value is resolved
// ============================================================================

/**
 * Schema for FieldMappingConfig
 *
 * Validation rules:
 * - mode is always required
 * - staticValue required when mode='static', optional for mode='default'
 * - generator required when mode='generated'
 * - computed required when mode='computed'
 * - collectFields required when mode='collect'
 * - transform is optional (defaults to 'none')
 */
export const fieldMappingConfigSchema = z.object({
    mode: mappingModeSchema,

    staticValue: z.unknown().optional(),

    generator: generatorTypeSchema.optional(),

    computed: computedFieldConfigSchema.optional(),

    // Defaults to [] so the round-trip through export → import doesn't trip the
    // "collectFields is required when mode='collect'" refine — exporters strip
    // empty arrays for human-readable JSON, and the additionalData system field
    // ships with mode='collect' + an empty collect list by design (it captures
    // everything not otherwise mapped).
    collectFields: z.array(z.string().max(500)).optional().default([]),

    /** Field name to copy source path from (for mode='reference') */
    sourceFromField: z.string().max(255).optional(),

    transform: valueTransformSchema.optional().default('none'),
}).refine(
    (data) => {
        // mode='static' requires staticValue
        if (data.mode === 'static' && data.staticValue === undefined) {
            return false;
        }
        return true;
    },
    {
        message: 'staticValue is required when mode is "static"',
        path: ['staticValue'],
    }
).refine(
    (data) => {
        // mode='generated' requires generator
        if (data.mode === 'generated' && !data.generator) {
            return false;
        }
        return true;
    },
    {
        message: 'generator is required when mode is "generated"',
        path: ['generator'],
    }
).refine(
    (data) => {
        // mode='computed' requires computed config
        if (data.mode === 'computed' && !data.computed) {
            return false;
        }
        return true;
    },
    {
        message: 'computed configuration is required when mode is "computed"',
        path: ['computed'],
    }
).refine(
    (data) => {
        // mode='collect' requires collectFields (can be empty array)
        if (data.mode === 'collect' && !Array.isArray(data.collectFields)) {
            return false;
        }
        return true;
    },
    {
        message: 'collectFields is required when mode is "collect"',
        path: ['collectFields'],
    }
).refine(
    (data) => {
        // mode='reference' requires sourceFromField
        if (data.mode === 'reference' && !data.sourceFromField) {
            return false;
        }
        return true;
    },
    {
        message: 'sourceFromField is required when mode is "reference"',
        path: ['sourceFromField'],
    }
);

export type FieldMappingConfigInput = z.infer<typeof fieldMappingConfigSchema>;

/**
 * Partial schema for updates (all fields optional)
 */
export const partialFieldMappingConfigSchema = z.object({
    mode: mappingModeSchema.optional(),
    staticValue: z.unknown().optional(),
    generator: generatorTypeSchema.optional(),
    computed: computedFieldConfigSchema.optional(),
    collectFields: z.array(z.string().max(500)).optional(),
    sourceFromField: z.string().max(255).optional(),
    transform: valueTransformSchema.optional(),
});

// ============================================================================
// LEGACY TRANSFORM CONFIG SCHEMA (Backward Compatibility)
// ============================================================================

/**
 * @deprecated Use fieldMappingConfigSchema instead
 * Kept for parsing existing database values
 */
export const legacyFieldTransformConfigSchema = z.object({
    type: valueTransformSchema,
    customFunction: z.string().optional(),
    parameters: z.record(z.unknown()).optional(),
});

/**
 * Schema that accepts both legacy and new config formats
 */
export const flexibleMappingConfigSchema = z.union([
    fieldMappingConfigSchema,
    legacyFieldTransformConfigSchema,
]);

/** Default transform config for legacy compatibility */
export const defaultTransformConfig = { type: 'none' as const };

/** Default mapping config for new fields */
export const defaultMappingConfig = DEFAULT_MAPPING_CONFIG;

// ============================================================================
// CREATE SEARCH INDEX FIELD SCHEMA
// Used when snapshotting template fields during index creation
// ============================================================================

export const createSearchIndexFieldSchema = z.object({
    // Field definition
    fieldName: z.string()
        .min(1, 'Field name is required')
        .max(255, 'Field name too long'),

    fieldType: z.string()
        .min(1, 'Field type is required')
        .max(50, 'Field type too long'),

    displayName: z.string().max(255).optional().nullable(),

    originalTemplateFieldId: z.number().int().positive().optional().nullable(),

    isSystemField: z.boolean().default(false),

    // Search behavior
    isRequired: z.boolean().default(false),
    isSearchable: z.boolean().default(true),
    isFacetable: z.boolean().default(false),
    includeInResponse: z.boolean().default(true),
    boostValue: z.number().min(0.1).max(100).default(1.0),

    // Source mapping
    sourceFieldName: z.string().max(255).optional().nullable(),
    sourceFieldPath: z.string().max(500).optional().nullable(),
    isMapped: z.boolean().default(false),

    // Index behavior
    isIndexed: z.boolean().default(true),
    isVectorSource: z.boolean().default(false),
    isAutocomplete: z.boolean().default(false),
    customAnalyzer: z.string().max(50).optional().nullable(),

    // Mapping configuration (new format)
    mappingConfig: fieldMappingConfigSchema.optional(),

    // Per-provider override JSON (ES analyzer knobs, Azure profile refs, etc.)
    providerFieldSettings: z.record(z.unknown()).optional().nullable(),

    // Legacy support - will be converted to mappingConfig
    transformConfig: legacyFieldTransformConfigSchema.optional(),
}).refine(
    (data) => {
        // isAutocomplete only valid for text fields
        if (data.isAutocomplete && !isAutocompleteCompatibleFieldType(data.fieldType)) {
            return false;
        }
        return true;
    },
    {
        message: 'Autocomplete is only supported for text fields',
        path: ['isAutocomplete'],
    }
);

export type CreateSearchIndexFieldInput = z.infer<typeof createSearchIndexFieldSchema>;

// ============================================================================
// UPDATE SEARCH INDEX FIELD SCHEMA
// Used when editing field config or setting up mappings
// ============================================================================

/**
 * Schema for filter value mappings
 * Maps canonical values to their aliases for filter validation
 * Example: { "Men": ["men", "male", "boys"], "Women": ["women", "female", "ladies"] }
 */
export const filterValueMappingsSchema = z.record(
    z.string().min(1, 'Canonical value cannot be empty'),
    z.array(z.string().min(1, 'Alias cannot be empty'))
).optional();

export const updateSearchIndexFieldSchema = z.object({
    // Display (editable)
    displayName: z.string().max(255).optional().nullable(),

    // Search behavior (editable)
    isSearchable: z.boolean().optional(),
    isFacetable: z.boolean().optional(),
    includeInResponse: z.boolean().optional(),
    boostValue: z.number().min(0.1).max(100).optional(),

    // Source mapping (editable)
    sourceFieldName: z.string().max(255).optional().nullable(),
    sourceFieldPath: z.string().max(500).optional().nullable(),
    isMapped: z.boolean().optional(),

    // Index behavior (editable)
    // NOTE: isAutocomplete and customAnalyzer changes require reindexing
    isIndexed: z.boolean().optional(),
    isVectorSource: z.boolean().optional(),
    isAutocomplete: z.boolean().optional(),
    customAnalyzer: z.string().max(50).optional().nullable(),

    // Provider-specific field settings (e.g. Azure isSortable, ES isAutocomplete)
    providerFieldSettings: z.record(z.unknown()).optional(),

    // Mapping configuration (new format)
    mappingConfig: partialFieldMappingConfigSchema.optional(),

    // Legacy support
    transformConfig: legacyFieldTransformConfigSchema.optional(),

    // Filter value mappings for facetable fields
    // Maps canonical values to aliases for filter validation in chat
    filterValueMappings: filterValueMappingsSchema,
});

export type UpdateSearchIndexFieldInput = z.infer<typeof updateSearchIndexFieldSchema>;

// ============================================================================
// BULK UPDATE FIELD MAPPINGS SCHEMA
// Used when saving all mappings at once from the UI
// ============================================================================

/**
 * Single field mapping update
 */
export const fieldMappingUpdateSchema = z.object({
    fieldId: z.number().int().positive('Field ID is required'),

    // Source field (for mode='source' or mode='default')
    sourceFieldName: z.string().max(255).nullable(),
    sourceFieldPath: z.string().max(500).optional().nullable(),

    // Full mapping config (optional - if not provided, infers from sourceFieldName)
    mappingConfig: fieldMappingConfigSchema.optional(),

    // Vector source flag (for semantic/hybrid search)
    isVectorSource: z.boolean().optional(),
});

export type FieldMappingUpdate = z.infer<typeof fieldMappingUpdateSchema>;

/**
 * Bulk update schema
 */
export const bulkUpdateFieldMappingsSchema = z.object({
    mappings: z.array(z.object({
        fieldId: z.number().int().positive('Field ID is required'),
        sourceFieldName: z.string().max(255).nullable(),
        sourceFieldPath: z.string().max(500).optional().nullable(),
        mappingConfig: fieldMappingConfigSchema.optional(),
        isVectorSource: z.boolean().optional(),
    })).min(1, 'At least one mapping is required'),
});

export type BulkUpdateFieldMappingsInput = z.infer<typeof bulkUpdateFieldMappingsSchema>;

// ============================================================================
// ADDITIONAL DATA CONFIGURATION SCHEMA
// For configuring which unmapped fields to collect
// ============================================================================

export const additionalDataConfigSchema = z.object({
    /**
     * List of source field paths to include in additionalData
     */
    collectFields: z.array(z.string().max(500)),
});

export type AdditionalDataConfigInput = z.infer<typeof additionalDataConfigSchema>;

// ============================================================================
// ANALYZE SAMPLE JSON SCHEMA
// Used when user uploads a sample JSON for mapping
// ============================================================================

export const analyzeSampleJsonSchema = z.object({
    /**
     * Sample JSON - can be a single object or array of objects
     * If string, will be parsed as JSON
     */
    sampleJson: z.union([
        z.string().min(2, 'Sample JSON is required'),
        z.record(z.unknown()),
        z.array(z.record(z.unknown())),
    ]),

    /**
     * Maximum depth to parse nested objects (default: 3)
     */
    maxDepth: z.number().int().min(1).max(10).default(3),

    /**
     * Whether to flatten nested objects into dot-notation paths
     */
    flattenNested: z.boolean().default(true),
});

export type AnalyzeSampleJsonInput = z.infer<typeof analyzeSampleJsonSchema>;

// ============================================================================
// QUERY SCHEMAS
// ============================================================================

/**
 * Schema for search index field ID parameter
 */
export const searchIndexFieldIdSchema = z.object({
    fieldId: z.coerce.number().int().positive('Field ID is required'),
});

export type SearchIndexFieldIdParam = z.infer<typeof searchIndexFieldIdSchema>;

/**
 * Schema for listing fields by search index
 */
export const listFieldsQuerySchema = z.object({
    searchIndexId: z.string().uuid('Invalid search index ID'),
    includeUnmapped: z.coerce.boolean().optional().default(true),
    systemFieldsOnly: z.coerce.boolean().optional().default(false),
});

export type ListFieldsQuery = z.infer<typeof listFieldsQuerySchema>;

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Validate that a mapping config is complete for its mode
 */
export function validateMappingConfig(config: FieldMappingConfigInput): {
    isValid: boolean;
    errors: string[];
} {
    const errors: string[] = [];

    switch (config.mode) {
        case 'static':
            if (config.staticValue === undefined) {
                errors.push('Static value is required for static mode');
            }
            break;

        case 'generated':
            if (!config.generator) {
                errors.push('Generator type is required for generated mode');
            }
            break;

        case 'computed':
            if (!config.computed) {
                errors.push('Computed configuration is required for computed mode');
            } else {
                if (!config.computed.sourceArrayPath) {
                    errors.push('Source array path is required for computed mode');
                }
                if (!config.computed.extractField) {
                    errors.push('Extract field is required for computed mode');
                }
                if (!config.computed.aggregation) {
                    errors.push('Aggregation type is required for computed mode');
                }
            }
            break;

        case 'collect':
            if (!Array.isArray(config.collectFields)) {
                errors.push('collectFields must be an array for collect mode');
            }
            break;

        case 'reference':
            if (!config.sourceFromField) {
                errors.push('sourceFromField is required for reference mode');
            }
            break;
    }

    return {
        isValid: errors.length === 0,
        errors,
    };
}

/**
 * Validate field mapping is appropriate for field type
 */
export function validateMappingForFieldType(
    config: FieldMappingConfigInput,
    fieldType: string,
    fieldName: string
): { isValid: boolean; warnings: string[] } {
    const warnings: string[] = [];

    // Check generator output type matches field type
    if (config.mode === 'generated' && config.generator) {
        const generatorOutputTypes: Record<string, string[]> = {
            uuid: ['keyword', 'text'],
            timestamp: ['datetime', 'date'],
            current_date: ['date', 'datetime'],
        };

        const validTypes = generatorOutputTypes[config.generator] || [];
        if (validTypes.length > 0 && !validTypes.includes(fieldType)) {
            warnings.push(
                `Generator "${config.generator}" produces ${validTypes.join('/')} but field "${fieldName}" is type "${fieldType}"`
            );
        }
    }

    // Check computed aggregation output type matches field type
    if (config.mode === 'computed' && config.computed) {
        const aggregationOutputTypes: Record<string, string[]> = {
            unique: ['array', 'json'],
            min: ['number'],
            max: ['number'],
            sum: ['number'],
            avg: ['number'],
            count: ['number'],
            any: ['boolean'],
            all: ['boolean'],
            first: ['text', 'keyword', 'number', 'boolean'], // Could be any type
            last: ['text', 'keyword', 'number', 'boolean'],
            flatten: ['array', 'json'],
        };

        const validTypes = aggregationOutputTypes[config.computed.aggregation] || [];
        if (validTypes.length > 0 && !validTypes.includes(fieldType)) {
            warnings.push(
                `Aggregation "${config.computed.aggregation}" produces ${validTypes.join('/')} but field "${fieldName}" is type "${fieldType}"`
            );
        }
    }

    // Check static value type
    if (config.mode === 'static' && config.staticValue !== undefined) {
        const valueType = typeof config.staticValue;

        if (fieldType === 'number' && valueType !== 'number') {
            warnings.push(`Static value for number field "${fieldName}" should be a number`);
        }
        if (fieldType === 'boolean' && valueType !== 'boolean') {
            warnings.push(`Static value for boolean field "${fieldName}" should be a boolean`);
        }
    }

    return {
        isValid: true, // Warnings don't prevent saving
        warnings,
    };
}

/**
 * Build a FieldMappingConfig from simple mapping inputs
 * Used when converting from the simpler bulk update format
 */
export function buildMappingConfig(
    sourceFieldName: string | null,
    existingConfig?: Partial<FieldMappingConfigInput>
): FieldMappingConfigInput {
    // If there's an existing config with a non-source mode, preserve it
    if (existingConfig?.mode && existingConfig.mode !== 'source') {
        return {
            mode: existingConfig.mode,
            staticValue: existingConfig.staticValue,
            generator: existingConfig.generator,
            computed: existingConfig.computed,
            collectFields: existingConfig.collectFields,
            sourceFromField: existingConfig.sourceFromField,
            transform: existingConfig.transform || 'none',
        } as FieldMappingConfigInput;
    }

    // Default: source mode if sourceFieldName provided, else none
    if (sourceFieldName) {
        return {
            mode: 'source',
            transform: existingConfig?.transform || 'none',
        };
    }

    return {
        mode: 'none',
        transform: 'none',
    };
}