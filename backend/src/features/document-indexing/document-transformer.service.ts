// src/features/document-indexing/document-transformer.service.ts

/**
 * Document Transformer Service
 *
 * Transforms source documents into index-ready documents by applying
 * field mappings, computed fields, value transforms, and generators.
 */

import 'server-only';

import { v4 as uuidv4 } from 'uuid';
import { createLogger } from '@/shared/logger/logger';
import {
    getNestedValue,
    resolveComputedValue,
} from '@/shared/utils/computed-fields';
import {
    getFieldMappingConfig,
    type ValueTransform,
    type GeneratorType,
} from '@/shared/constants/search-index.constants';
import type { SearchIndexField } from '@/db/schema/search-index-fields.schema';
import type { SearchProviderType } from '@/features/search/providers/search-engine-provider.interface';

const logger = createLogger('document-transformer');

// ============================================================================
// TYPES
// ============================================================================

export interface TransformResult {
    success: boolean;
    document: Record<string, unknown>;
    errors: Array<{
        field: string;
        error: string;
    }>;
    warnings: Array<{
        field: string;
        warning: string;
    }>;
}

export interface TransformOptions {
    /**
     * Whether to continue transforming other fields if one fails
     * @default true
     */
    continueOnError?: boolean;

    /**
     * List of source fields that should be collected into additionalData
     * Only used when a field has mode='collect'
     */
    collectableFields?: string[];

    /**
     * Target search provider. Controls per-provider serialization quirks:
     * Azure has no native JSON type and needs json fields stringified into
     * Edm.String; Elasticsearch maps json → object/nested and requires the
     * native shape. Defaults to elasticsearch (the safer default for object
     * mappings — stringifying an object into an `object`-mapped ES field
     * triggers "tried to parse field as object, but found a concrete value").
     */
    provider?: SearchProviderType;
}

// ============================================================================
// VALUE GENERATORS
// ============================================================================

/**
 * Generate a value based on generator type
 */
function generateValue(generator: GeneratorType): unknown {
    switch (generator) {
        case 'uuid':
            return uuidv4();
        case 'timestamp':
            return new Date().toISOString();
        case 'current_date':
            return new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        default:
            return null;
    }
}

// ============================================================================
// VALUE TRANSFORMS
// ============================================================================

/**
 * Apply a transform to a single string value
 */
function applyStringTransform(value: string, transform: ValueTransform): string {
    switch (transform) {
        case 'lowercase':
            return value.toLowerCase();
        case 'uppercase':
            return value.toUpperCase();
        case 'trim':
            return value.trim();
        case 'trim_lowercase':
            return value.trim().toLowerCase();
        case 'none':
        default:
            return value;
    }
}

/**
 * Apply a transform to a value.
 * For arrays, applies the transform element-wise to each string element.
 */
function applyTransform(value: unknown, transform: ValueTransform): unknown {
    if (value === null || value === undefined) {
        return value;
    }

    // Apply element-wise to arrays (e.g., computed unique values)
    if (Array.isArray(value)) {
        return value.map(item =>
            typeof item === 'string' ? applyStringTransform(item, transform) : item
        );
    }

    if (typeof value !== 'string') {
        return value;
    }

    return applyStringTransform(value, transform);
}

// ============================================================================
// FIELD VALUE RESOLUTION
// ============================================================================

/**
 * Resolve the value for a single field based on its mapping configuration
 */
function resolveFieldValue(
    sourceDocument: Record<string, unknown>,
    field: SearchIndexField,
    collectableFields?: string[],
    allFields?: SearchIndexField[]
): { value: unknown; error?: string } {
    const config = getFieldMappingConfig(field.transformConfig);
    const { mode, staticValue, generator, computed, collectFields, sourceFromField, transform } = config;

    let value: unknown;

    try {
        switch (mode) {
            case 'source': {
                // Get value from source field
                if (!field.sourceFieldName && !field.sourceFieldPath) {
                    return { value: undefined, error: 'No source field configured' };
                }
                const path = field.sourceFieldPath || field.sourceFieldName || '';
                value = getNestedValue(sourceDocument, path);
                break;
            }

            case 'static': {
                // Use the static value
                value = staticValue;
                break;
            }

            case 'default': {
                // Try source first, fall back to static value, then generator
                if (field.sourceFieldName || field.sourceFieldPath) {
                    const path = field.sourceFieldPath || field.sourceFieldName || '';
                    value = getNestedValue(sourceDocument, path);
                }
                if (value === undefined || value === null) {
                    value = staticValue;
                }
                if ((value === undefined || value === null) && generator) {
                    value = generateValue(generator);
                }
                break;
            }

            case 'generated': {
                // Generate a value
                if (!generator) {
                    return { value: undefined, error: 'No generator configured' };
                }
                value = generateValue(generator);
                break;
            }

            case 'computed': {
                // Compute value from nested array
                if (!computed) {
                    return { value: undefined, error: 'No computed config' };
                }
                value = resolveComputedValue(sourceDocument, computed);
                break;
            }

            case 'collect': {
                // Collect specified fields into an object
                const fieldsToCollect = collectFields || collectableFields || [];
                const collected: Record<string, unknown> = {};

                for (const fieldPath of fieldsToCollect) {
                    const fieldValue = getNestedValue(sourceDocument, fieldPath);
                    if (fieldValue !== undefined) {
                        // Use the last part of the path as the key
                        const key = fieldPath.split('.').pop() || fieldPath;
                        collected[key] = fieldValue;
                    }
                }

                value = Object.keys(collected).length > 0 ? collected : null;
                break;
            }

            case 'reference': {
                // Reference another field's source path
                // Used for uniqueId to copy value from another mapped field like productId
                if (!sourceFromField) {
                    return { value: undefined, error: 'No source field reference configured' };
                }

                // Find the referenced field
                const referencedField = allFields?.find(f => f.fieldName === sourceFromField);
                if (!referencedField) {
                    return { value: undefined, error: `Referenced field "${sourceFromField}" not found` };
                }

                // Get the source path from the referenced field
                const refPath = referencedField.sourceFieldPath || referencedField.sourceFieldName;
                if (!refPath) {
                    return { value: undefined, error: `Referenced field "${sourceFromField}" has no source mapping` };
                }

                value = getNestedValue(sourceDocument, refPath);
                break;
            }

            case 'none':
            default:
                value = undefined;
                break;
        }

        // Apply transform if configured
        if (transform && transform !== 'none') {
            value = applyTransform(value, transform);
        }

        return { value };
    } catch (error) {
        return {
            value: undefined,
            error: error instanceof Error ? error.message : 'Unknown error resolving field',
        };
    }
}

// ============================================================================
// MAIN TRANSFORMER
// ============================================================================

/**
 * Transform a source document using field mappings
 *
 * @param sourceDocument - The raw source document
 * @param fields - The search index fields with mapping configurations
 * @param options - Transform options
 * @returns TransformResult with the transformed document
 */
export function transformDocument(
    sourceDocument: Record<string, unknown>,
    fields: SearchIndexField[],
    options: TransformOptions = {}
): TransformResult {
    const { continueOnError = true, collectableFields, provider } = options;

    const result: TransformResult = {
        success: true,
        document: {},
        errors: [],
        warnings: [],
    };

    // Determine which source fields are mapped (for collect mode)
    const mappedSourceFields = new Set<string>();
    for (const field of fields) {
        if (field.sourceFieldName) {
            mappedSourceFields.add(field.sourceFieldName);
        }
        if (field.sourceFieldPath) {
            mappedSourceFields.add(field.sourceFieldPath);
        }
    }

    // Calculate unmapped fields for collect mode
    const unmappedFields = collectableFields?.filter(f => !mappedSourceFields.has(f)) || [];

    // Process each field
    for (const field of fields) {
        const config = getFieldMappingConfig(field.transformConfig);

        // Skip fields with mode='none'
        if (config.mode === 'none') {
            continue;
        }

        // Resolve the field value
        const { value, error } = resolveFieldValue(
            sourceDocument,
            field,
            config.mode === 'collect' ? (config.collectFields || unmappedFields) : undefined,
            fields
        );

        if (error) {
            result.errors.push({
                field: field.fieldName,
                error,
            });

            if (!continueOnError) {
                result.success = false;
                return result;
            }

            // Mark as failed but continue
            if (field.isRequired) {
                result.success = false;
            }

            continue;
        }

        // Check required fields
        if (field.isRequired && (value === undefined || value === null)) {
            result.errors.push({
                field: field.fieldName,
                error: 'Required field has no value',
            });
            result.success = false;

            if (!continueOnError) {
                return result;
            }

            continue;
        }

        // Only include fields with values (or null for explicit null)
        if (value !== undefined) {
            // json-typed fields: Azure has no native JSON column, so we serialize
            // objects/arrays into a string for Edm.String storage. Elasticsearch
            // maps json → object/nested and REQUIRES the native shape — sending
            // a string into an object-mapped field is what triggers the runtime
            // error "object mapping for [X] tried to parse field [X] as object,
            // but found a concrete value." Pass through as-is for ES.
            if (
                field.fieldType === 'json'
                && value !== null
                && typeof value === 'object'
                && provider === 'azure-ai-search'
            ) {
                result.document[field.fieldName] = JSON.stringify(value);
            } else {
                result.document[field.fieldName] = value;
            }
        }
    }

    return result;
}

/**
 * Transform multiple documents in batch
 *
 * @param sourceDocuments - Array of source documents
 * @param fields - The search index fields
 * @param options - Transform options
 * @returns Array of transform results
 */
export function transformDocuments(
    sourceDocuments: Record<string, unknown>[],
    fields: SearchIndexField[],
    options: TransformOptions = {}
): TransformResult[] {
    return sourceDocuments.map((doc, index) => {
        try {
            return transformDocument(doc, fields, options);
        } catch (error) {
            logger.error('Document transformation failed', {
                index,
                error: error instanceof Error ? error.message : 'Unknown error',
            });

            return {
                success: false,
                document: {},
                errors: [{
                    field: '_document',
                    error: error instanceof Error ? error.message : 'Failed to transform document',
                }],
                warnings: [],
            };
        }
    });
}

/**
 * Validate that all required fields can be mapped
 * Call this before starting a batch transform
 */
export function validateFieldMappings(
    fields: SearchIndexField[]
): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    for (const field of fields) {
        const config = getFieldMappingConfig(field.transformConfig);

        // Skip optional fields with mode='none'
        if (config.mode === 'none' && !field.isRequired) {
            continue;
        }

        // Required fields must have a valid mapping
        if (field.isRequired) {
            switch (config.mode) {
                case 'source':
                    if (!field.sourceFieldName && !field.sourceFieldPath) {
                        errors.push(`Required field "${field.fieldName}" has no source mapping`);
                    }
                    break;
                case 'default':
                    // Default mode is valid if it has a source, static fallback, or generator fallback
                    if (!field.sourceFieldName && !field.sourceFieldPath
                        && config.staticValue === undefined
                        && !config.generator) {
                        errors.push(`Required field "${field.fieldName}" has no source, fallback value, or generator`);
                    }
                    break;
                case 'static':
                    if (config.staticValue === undefined) {
                        errors.push(`Required field "${field.fieldName}" has no static value`);
                    }
                    break;
                case 'generated':
                    if (!config.generator) {
                        errors.push(`Required field "${field.fieldName}" has no generator`);
                    }
                    break;
                case 'computed':
                    if (!config.computed || !config.computed.sourceArrayPath || !config.computed.extractField) {
                        errors.push(`Required field "${field.fieldName}" has incomplete computed config`);
                    }
                    break;
                case 'reference':
                    if (!config.sourceFromField) {
                        errors.push(`Required field "${field.fieldName}" has no source field reference`);
                    } else {
                        // Verify the referenced field exists and has a source mapping
                        const referencedField = fields.find(f => f.fieldName === config.sourceFromField);
                        if (!referencedField) {
                            errors.push(`Required field "${field.fieldName}" references non-existent field "${config.sourceFromField}"`);
                        } else if (!referencedField.sourceFieldName && !referencedField.sourceFieldPath) {
                            errors.push(`Required field "${field.fieldName}" references unmapped field "${config.sourceFromField}"`);
                        }
                    }
                    break;
                case 'none':
                    errors.push(`Required field "${field.fieldName}" is set to 'none' mode`);
                    break;
            }
        }
    }

    return {
        valid: errors.length === 0,
        errors,
    };
}
