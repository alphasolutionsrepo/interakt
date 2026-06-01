// src/features/search-index/search-index-fields.service.ts

/**
 * Search Index Fields - Service Layer
 * 
 * Business logic for managing search index fields.
 * Handles field snapshots, mapping configuration, and validation.
 * 
 * UPDATED: Supports new FieldMappingConfig with modes (static, generated, collect)
 */

import { createLogger } from '@/shared/logger/logger';
import * as repository from './search-index-fields.repository';
import * as searchIndexRepository from './search-index.repository';
import type { SearchIndexField, NewSearchIndexField } from '@/db/schema/search-index-fields.schema';
import type {
    UpdateSearchIndexFieldDTO,
    BulkUpdateFieldMappingsDTO,
    FieldMappingSummary,
    MappingValidationResult,
    FieldMappingValidationError,
} from './search-index-fields.types';
import {
    type FieldMappingConfig,
    type MappingMode,
    DEFAULT_MAPPING_CONFIG,
    SYSTEM_FIELD_MAPPING_CONFIGS,
    getFieldMappingConfig,
} from '@/shared/constants/search-index.constants';

const logger = createLogger('search-index-fields-service');

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get the effective mapping config for a field
 * Handles legacy transformConfig format
 */
function getEffectiveMappingConfig(field: SearchIndexField): FieldMappingConfig {
    return getFieldMappingConfig(field.transformConfig);
}

/**
 * Check if a field is effectively "mapped" based on its config
 * A field is mapped if:
 * - It has a source field name (mode='source' or mode='default')
 * - It has mode='static' with a staticValue
 * - It has mode='generated' with a generator
 * - It has mode='collect' (for additionalData)
 * - It has mode='computed' with a valid computed config
 * - It has mode='reference' with a sourceFromField configured
 */
function isFieldEffectivelyMapped(field: SearchIndexField): boolean {
    const config = getEffectiveMappingConfig(field);

    switch (config.mode) {
        case 'source':
            return field.sourceFieldName !== null;
        case 'default':
            // Default mode is mapped if it has a source OR a fallback value OR a generator
            return field.sourceFieldName !== null || config.staticValue !== undefined || config.generator !== undefined;
        case 'static':
            return config.staticValue !== undefined;
        case 'generated':
            return config.generator !== undefined;
        case 'collect':
            return true; // Always considered mapped (even if collectFields is empty)
        case 'computed':
            // Computed mode is mapped if it has a valid computed config with required fields
            return config.computed !== undefined
                && config.computed.sourceArrayPath !== undefined
                && config.computed.sourceArrayPath !== ''
                && config.computed.extractField !== undefined
                && config.computed.extractField !== ''
                && config.computed.aggregation !== undefined;
        case 'reference':
            // Reference mode is mapped if it references another field
            return config.sourceFromField !== undefined && config.sourceFromField !== '';
        case 'none':
            return false;
        default:
            return field.isMapped;
    }
}

/**
 * Get default mapping config for a system field
 */
function getSystemFieldDefaultConfig(fieldName: string): FieldMappingConfig {
    return SYSTEM_FIELD_MAPPING_CONFIGS[fieldName] || DEFAULT_MAPPING_CONFIG;
}

/**
 * Import fields from exported data to a search index
 * Used during search index import
 */
export async function importFields(
    searchIndexId: string,
    exportedFields: Array<{
        fieldName: string;
        fieldType: string;
        displayName?: string | null;
        isSystemField: boolean;
        isRequired: boolean;
        isSearchable: boolean;
        isFacetable: boolean;
        includeInResponse: boolean;
        boostValue: number;
        sourceFieldName?: string | null;
        sourceFieldPath?: string | null;
        isMapped: boolean;
        isIndexed: boolean;
        isVectorSource: boolean;
        isAutocomplete: boolean;
        customAnalyzer?: string | null;
        transformConfig?: Record<string, unknown>;
    }>
): Promise<number> {
    try {
        // Verify search index exists
        const searchIndex = await searchIndexRepository.getSearchIndexById(searchIndexId);
        if (!searchIndex) {
            throw new Error(`Search index with ID ${searchIndexId} not found`);
        }

        // Map exported fields to search index fields
        const fieldsToCreate: Array<Omit<NewSearchIndexField, 'id' | 'createdAt' | 'updatedAt'>> =
            exportedFields.map(field => ({
                searchIndexId,
                fieldName: field.fieldName,
                fieldType: field.fieldType,
                displayName: field.displayName ?? null,
                originalTemplateFieldId: null, // Not linked to template field
                isSystemField: field.isSystemField,
                isRequired: field.isRequired,
                isSearchable: field.isSearchable,
                isFacetable: field.isFacetable,
                includeInResponse: field.includeInResponse,
                boostValue: field.boostValue,
                sourceFieldName: field.sourceFieldName ?? null,
                sourceFieldPath: field.sourceFieldPath ?? null,
                isMapped: field.isMapped,
                isIndexed: field.isIndexed,
                isVectorSource: field.isVectorSource,
                isAutocomplete: field.isAutocomplete ?? false,
                customAnalyzer: field.customAnalyzer ?? null,
                transformConfig: (field.transformConfig ?? DEFAULT_MAPPING_CONFIG) as unknown as NewSearchIndexField['transformConfig'],
            }));

        // Bulk create fields
        const createdFields = await repository.createFields(fieldsToCreate);

        logger.info('Imported fields to search index', {
            searchIndexId,
            fieldCount: createdFields.length,
        });

        return createdFields.length;
    } catch (error) {
        logger.error('Failed to import fields', error as Error, {
            searchIndexId,
            fieldCount: exportedFields.length,
        });
        throw error;
    }
}

// ============================================================================
// CREATE OPERATIONS
// ============================================================================

/**
 * Create a single custom field on a search index.
 * Used when the user manually adds a field.
 */
export async function createField(
    searchIndexId: string,
    input: {
        fieldName: string;
        fieldType: string;
        displayName?: string | null;
        isSearchable?: boolean;
        isFacetable?: boolean;
        includeInResponse?: boolean;
        boostValue?: number;
        isVectorSource?: boolean;
        isAutocomplete?: boolean;
        isRequired?: boolean;
        /**
         * Set true only by the import-from-mapping flow when round-tripping an
         * exported system field. The manual "+ Add field" dialog always creates
         * user fields, so it leaves this undefined.
         */
        isSystemField?: boolean;
        mappingConfig?: FieldMappingConfig;
        /**
         * Source field path (used when mode === 'source' or 'collect').
         * Most callers leave this null and set it via updateFieldMapping later;
         * the bulk import-from-mapping flow passes it through so the field is
         * fully wired on create.
         */
        sourceFieldPath?: string | null;
        /**
         * Per-provider override blob (ES analyzer knobs, Azure profile refs).
         * Stored verbatim in providerFieldSettings JSON column. Optional —
         * unset means "use the cross-provider defaults derived from fieldType /
         * isFacetable / isAutocomplete."
         */
        providerFieldSettings?: Record<string, unknown> | null;
    },
    userId: string
): Promise<SearchIndexField> {
    try {
        // Verify search index exists
        const searchIndex = await searchIndexRepository.getSearchIndexById(searchIndexId);
        if (!searchIndex) {
            throw new Error(`Search index with ID ${searchIndexId} not found`);
        }

        // Check for duplicate field name
        const exists = await repository.fieldNameExists(searchIndexId, input.fieldName);
        if (exists) {
            throw new Error(`Field "${input.fieldName}" already exists in this index`);
        }

        const mappingConfig = input.mappingConfig ?? DEFAULT_MAPPING_CONFIG;
        const sourcePath = input.sourceFieldPath ?? null;

        const created = await repository.createField({
            searchIndexId,
            fieldName: input.fieldName,
            fieldType: input.fieldType,
            displayName: input.displayName ?? null,
            originalTemplateFieldId: null,
            isSystemField: input.isSystemField ?? false,
            isRequired: input.isRequired ?? false,
            isSearchable: input.isSearchable ?? true,
            isFacetable: input.isFacetable ?? false,
            includeInResponse: input.includeInResponse ?? true,
            boostValue: input.boostValue ?? 1.0,
            sourceFieldName: sourcePath,
            sourceFieldPath: sourcePath,
            isMapped: sourcePath !== null,
            isIndexed: true,
            isVectorSource: input.isVectorSource ?? false,
            isAutocomplete: input.isAutocomplete ?? false,
            customAnalyzer: null,
            providerFieldSettings: input.providerFieldSettings ?? null,
            transformConfig: mappingConfig as unknown as NewSearchIndexField['transformConfig'],
        });

        // Mark index as requiring reindex since schema changed
        await searchIndexRepository.incrementMappingVersion(searchIndexId, true);

        logger.info('Created custom field', {
            fieldId: created.id,
            searchIndexId,
            fieldName: input.fieldName,
            createdBy: userId,
        });

        return created;
    } catch (error) {
        logger.error('Failed to create field', error as Error, {
            searchIndexId,
            fieldName: input.fieldName,
        });
        throw error;
    }
}

/**
 * Entry shape consumed by createFieldsFromMappingEntries.
 *
 * Matches the per-field entries inside an exported field-mappings JSON
 * (see app/search-indexes/_lib/utils/field-mappings-json.ts).
 */
export interface MappingEntryInput {
    fieldName: string;
    fieldType: string;
    displayName?: string | null;
    isRequired?: boolean;
    /**
     * Preserves the system-field flag on round-trip from exported JSON. System
     * fields (uniqueId, createdAt, updatedAt, customFields, additionalData,
     * language) carry semantics the UI honors (locked field type, restricted
     * mapping modes). If we drop this on import they're reclassified as user
     * fields and their default attributes flip.
     */
    isSystemField?: boolean;
    mapping: {
        mode: string;
        sourceField: string | null;
        transform?: string;
        staticValue?: unknown;
        generator?: string;
        computed?: unknown;
        collectFields?: string[];
        sourceFromField?: string;
    };
    attributes: {
        isSearchable: boolean;
        isFacetable: boolean;
        includeInResponse: boolean;
        boostValue: number;
        isVectorSource: boolean;
        /** Optional — ES-specific text-field flag. Round-tripped when present. */
        isAutocomplete?: boolean;
    };
    /** Per-provider override JSON; round-tripped verbatim. */
    providerFieldSettings?: Record<string, unknown>;
}

/**
 * Create fields in bulk from exported field-mapping JSON entries.
 *
 * Used by the "Import Field Mappings" dialog when entries in the JSON have
 * no matching field in the index yet. Each entry's full mapping config
 * (mode, transform, computed, staticValue, sourceFromField) and attributes
 * are applied on create — no follow-up update needed.
 *
 * Returns created fields and a per-entry error list. Errors don't abort the
 * batch; one bad entry doesn't prevent the others from being created.
 */
export async function createFieldsFromMappingEntries(
    searchIndexId: string,
    entries: MappingEntryInput[],
    userId: string,
): Promise<{ created: SearchIndexField[]; errors: Array<{ fieldName: string; error: string }> }> {
    const created: SearchIndexField[] = [];
    const errors: Array<{ fieldName: string; error: string }> = [];

    for (const entry of entries) {
        try {
            // Build the mapping config from the entry's mapping section.
            // Only include keys that apply to the chosen mode.
            const mappingConfig: FieldMappingConfig = {
                mode: entry.mapping.mode as MappingMode,
                transform: (entry.mapping.transform ?? 'none') as FieldMappingConfig['transform'],
            };
            if (entry.mapping.staticValue !== undefined) {
                mappingConfig.staticValue = entry.mapping.staticValue;
            }
            if (entry.mapping.generator) {
                mappingConfig.generator = entry.mapping.generator as FieldMappingConfig['generator'];
            }
            if (entry.mapping.computed) {
                mappingConfig.computed = entry.mapping.computed as FieldMappingConfig['computed'];
            }
            if (entry.mapping.collectFields && entry.mapping.collectFields.length > 0) {
                mappingConfig.collectFields = entry.mapping.collectFields;
            }
            if (entry.mapping.sourceFromField) {
                mappingConfig.sourceFromField = entry.mapping.sourceFromField;
            }

            const field = await createField(
                searchIndexId,
                {
                    fieldName: entry.fieldName,
                    fieldType: entry.fieldType,
                    displayName: entry.displayName ?? null,
                    isSearchable: entry.attributes.isSearchable,
                    isFacetable: entry.attributes.isFacetable,
                    includeInResponse: entry.attributes.includeInResponse,
                    boostValue: entry.attributes.boostValue,
                    isVectorSource: entry.attributes.isVectorSource,
                    isAutocomplete: entry.attributes.isAutocomplete,
                    isRequired: entry.isRequired,
                    isSystemField: entry.isSystemField,
                    mappingConfig,
                    sourceFieldPath: entry.mapping.sourceField,
                    providerFieldSettings: entry.providerFieldSettings ?? null,
                },
                userId,
            );
            created.push(field);
        } catch (e) {
            errors.push({ fieldName: entry.fieldName, error: (e as Error).message });
        }
    }

    logger.info('createFieldsFromMappingEntries done', {
        searchIndexId,
        requested: entries.length,
        createdCount: created.length,
        errorCount: errors.length,
        createdBy: userId,
    });

    return { created, errors };
}

/**
 * Infer a field type from a JSON value
 */
function inferFieldType(value: unknown): string {
    if (value === null || value === undefined) return 'keyword';
    if (typeof value === 'boolean') return 'boolean';
    if (typeof value === 'number') return 'number';
    if (typeof value === 'string') {
        // Check for date/datetime patterns
        if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) return 'datetime';
        if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'date';
        // Check for URL
        if (/^https?:\/\//.test(value)) {
            if (/\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)(\?|$)/i.test(value)) return 'image_url';
            return 'url';
        }
        // Check for email
        if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'email';
        // Short strings → keyword, long strings → text
        return value.length > 100 ? 'text' : 'keyword';
    }
    if (Array.isArray(value)) {
        // Distinguish arrays of primitives (keyword) from arrays of objects (json)
        if (value.length > 0 && typeof value[0] === 'object' && value[0] !== null) {
            return 'json'; // Array of objects → store as json/nested
        }
        return 'array'; // Array of primitives → ES handles as keyword array
    }
    if (typeof value === 'object') return 'json';
    return 'keyword';
}

/**
 * Generate a display name from a field name/path.
 * e.g. "product_name" → "Product Name", "metadata.sku" → "Metadata Sku"
 */
function generateDisplayName(fieldName: string): string {
    // Take the last segment if it's a dot-path
    const last = fieldName.includes('.') ? fieldName.split('.').pop()! : fieldName;
    return last
        .replace(/([a-z])([A-Z])/g, '$1 $2')  // camelCase → camel Case
        .replace(/[_-]+/g, ' ')                  // snake_case/kebab → spaces
        .replace(/\b\w/g, c => c.toUpperCase()); // capitalize words
}

/**
 * Create fields from a sample JSON document.
 * Parses the JSON, infers field types, and creates fields that don't already exist.
 * Returns the list of newly created fields.
 */
export async function createFieldsFromJson(
    searchIndexId: string,
    sampleJson: Record<string, unknown>,
    userId: string,
    options?: { maxDepth?: number }
): Promise<{ created: SearchIndexField[]; skipped: string[] }> {
    try {
        // Verify search index exists
        const searchIndex = await searchIndexRepository.getSearchIndexById(searchIndexId);
        if (!searchIndex) {
            throw new Error(`Search index with ID ${searchIndexId} not found`);
        }

        // Get existing fields to avoid duplicates
        const existingFields = await repository.getFieldsBySearchIndexId(searchIndexId);
        const existingNames = new Set(existingFields.map(f => f.fieldName));

        // Flatten JSON into field definitions
        const maxDepth = options?.maxDepth ?? 2;
        const fieldsToCreate: Array<{ fieldName: string; fieldType: string; displayName: string; sampleValue: unknown }> = [];
        const skipped: string[] = [];

        function walkObject(obj: Record<string, unknown>, prefix: string, depth: number) {
            for (const [key, value] of Object.entries(obj)) {
                const fieldName = prefix ? `${prefix}.${key}` : key;

                // Skip nested objects beyond max depth — index them as json
                if (typeof value === 'object' && value !== null && !Array.isArray(value) && depth < maxDepth) {
                    walkObject(value as Record<string, unknown>, fieldName, depth + 1);
                    continue;
                }

                if (existingNames.has(fieldName)) {
                    skipped.push(fieldName);
                    continue;
                }

                fieldsToCreate.push({
                    fieldName,
                    fieldType: inferFieldType(value),
                    displayName: generateDisplayName(fieldName),
                    sampleValue: value,
                });

                // Track to avoid dupes within the same JSON
                existingNames.add(fieldName);
            }
        }

        walkObject(sampleJson, '', 0);

        if (fieldsToCreate.length === 0) {
            return { created: [], skipped };
        }

        // Bulk create
        const newFields = fieldsToCreate.map(f => ({
            searchIndexId,
            fieldName: f.fieldName,
            fieldType: f.fieldType,
            displayName: f.displayName,
            originalTemplateFieldId: null,
            isSystemField: false,
            isRequired: false,
            isSearchable: ['text', 'keyword'].includes(f.fieldType),
            isFacetable: ['keyword', 'number', 'boolean'].includes(f.fieldType),
            includeInResponse: true,
            boostValue: 1.0,
            sourceFieldName: null,
            sourceFieldPath: null,
            isMapped: false,
            isIndexed: true,
            isVectorSource: false,
            isAutocomplete: false,
            customAnalyzer: null,
            transformConfig: DEFAULT_MAPPING_CONFIG as unknown as NewSearchIndexField['transformConfig'],
        }));

        const created = await repository.createFields(newFields);

        // Mark index as requiring reindex
        await searchIndexRepository.incrementMappingVersion(searchIndexId, true);

        logger.info('Created fields from JSON', {
            searchIndexId,
            createdCount: created.length,
            skippedCount: skipped.length,
            createdBy: userId,
        });

        return { created, skipped };
    } catch (error) {
        logger.error('Failed to create fields from JSON', error as Error, { searchIndexId });
        throw error;
    }
}

/**
 * Create fields from user-reviewed definitions.
 * Called after the user reviews inferred fields in the review dialog
 * and confirms with possibly edited types/names.
 */
export async function createFieldsFromReview(
    searchIndexId: string,
    reviewedFields: Array<{
        fieldName: string;
        fieldType: string;
        displayName: string;
    }>,
    userId: string
): Promise<SearchIndexField[]> {
    try {
        const searchIndex = await searchIndexRepository.getSearchIndexById(searchIndexId);
        if (!searchIndex) {
            throw new Error(`Search index with ID ${searchIndexId} not found`);
        }

        // Filter out fields that already exist
        const existingFields = await repository.getFieldsBySearchIndexId(searchIndexId);
        const existingNames = new Set(existingFields.map(f => f.fieldName));
        const toCreate = reviewedFields.filter(f => !existingNames.has(f.fieldName));

        if (toCreate.length === 0) {
            return [];
        }

        const newFields = toCreate.map(f => ({
            searchIndexId,
            fieldName: f.fieldName,
            fieldType: f.fieldType,
            displayName: f.displayName,
            originalTemplateFieldId: null,
            isSystemField: false,
            isRequired: false,
            isSearchable: ['text', 'keyword'].includes(f.fieldType),
            isFacetable: ['keyword', 'number', 'boolean'].includes(f.fieldType),
            includeInResponse: true,
            boostValue: 1.0,
            sourceFieldName: null,
            sourceFieldPath: null,
            isMapped: false,
            isIndexed: true,
            isVectorSource: false,
            isAutocomplete: false,
            customAnalyzer: null,
            transformConfig: DEFAULT_MAPPING_CONFIG as unknown as NewSearchIndexField['transformConfig'],
        }));

        const created = await repository.createFields(newFields);
        await searchIndexRepository.incrementMappingVersion(searchIndexId, true);

        logger.info('Created fields from review', {
            searchIndexId,
            createdCount: created.length,
            createdBy: userId,
        });

        return created;
    } catch (error) {
        logger.error('Failed to create fields from review', error as Error, { searchIndexId });
        throw error;
    }
}

/**
 * Delete a custom field from a search index.
 * System fields cannot be deleted.
 */
export async function deleteField(
    fieldId: number,
    userId: string
): Promise<void> {
    try {
        const field = await repository.getFieldById(fieldId);
        if (!field) {
            throw new Error(`Field with ID ${fieldId} not found`);
        }

        if (field.isSystemField) {
            throw new Error('Cannot delete system fields');
        }

        await repository.deleteField(fieldId);

        // Mark index as requiring reindex
        await searchIndexRepository.incrementMappingVersion(field.searchIndexId, true);

        logger.info('Deleted field', {
            fieldId,
            searchIndexId: field.searchIndexId,
            fieldName: field.fieldName,
            deletedBy: userId,
        });
    } catch (error) {
        logger.error('Failed to delete field', error as Error, { fieldId });
        throw error;
    }
}

// ============================================================================
// READ OPERATIONS
// ============================================================================

/**
 * Get all fields for a search index
 */
export async function getFieldsBySearchIndexId(searchIndexId: string): Promise<SearchIndexField[]> {
    return repository.getFieldsBySearchIndexId(searchIndexId);
}

/**
 * Get all fields for a search index (alias for getFieldsBySearchIndexId)
 */
export async function getFields(searchIndexId: string): Promise<SearchIndexField[]> {
    return repository.getFieldsBySearchIndexId(searchIndexId);
}

/**
 * Get a single field by ID
 */
export async function getFieldById(fieldId: number): Promise<SearchIndexField | null> {
    return repository.getFieldById(fieldId);
}

/**
 * Get only mapped fields
 */
export async function getMappedFields(searchIndexId: string): Promise<SearchIndexField[]> {
    return repository.getMappedFields(searchIndexId);
}

/**
 * Get only unmapped fields
 */
export async function getUnmappedFields(searchIndexId: string): Promise<SearchIndexField[]> {
    return repository.getUnmappedFields(searchIndexId);
}

/**
 * Get vector source fields
 */
export async function getVectorSourceFields(searchIndexId: string): Promise<SearchIndexField[]> {
    return repository.getVectorSourceFields(searchIndexId);
}

/**
 * Get field mapping summary for an index
 * UPDATED: Includes new stats for mapping modes
 */
export async function getFieldMappingSummary(searchIndexId: string): Promise<FieldMappingSummary> {
    const fields = await repository.getFieldsBySearchIndexId(searchIndexId);

    // Count by category
    const systemFields = fields.filter(f => f.isSystemField).length;
    const customFields = fields.filter(f => !f.isSystemField).length;

    // Count by mapping status (using effective mapping check)
    const effectivelyMapped = fields.filter(f => isFieldEffectivelyMapped(f));
    const mappedFields = effectivelyMapped.length;
    const unmappedFields = fields.length - mappedFields;

    // Count required fields
    const requiredFields = fields.filter(f => f.isRequired);
    const requiredMappedFields = requiredFields.filter(f => isFieldEffectivelyMapped(f)).length;

    // Count by mapping mode
    let staticValueFields = 0;
    let generatedFields = 0;
    let additionalDataFields: string[] = [];

    for (const field of fields) {
        const config = getEffectiveMappingConfig(field);

        if (config.mode === 'static') {
            staticValueFields++;
        } else if (config.mode === 'generated') {
            generatedFields++;
        } else if (config.mode === 'collect' && config.collectFields) {
            additionalDataFields = config.collectFields;
        }
    }

    // Ready for indexing if all required fields are effectively mapped
    const isReadyForIndexing = requiredFields.length === 0 ||
        requiredMappedFields === requiredFields.length;

    return {
        searchIndexId,
        totalFields: fields.length,
        mappedFields,
        unmappedFields,
        requiredFields: requiredFields.length,
        requiredMappedFields,
        systemFields,
        customFields,
        staticValueFields,
        generatedFields,
        additionalDataFields,
        isReadyForIndexing,
    };
}

// ============================================================================
// UPDATE OPERATIONS
// ============================================================================

/**
 * Update a field's configuration
 * Used for editing search behavior (boost, facetable, etc.)
 */
export async function updateField(
    fieldId: number,
    input: UpdateSearchIndexFieldDTO,
    userId: string
): Promise<SearchIndexField> {
    try {
        // Get existing field
        const existing = await repository.getFieldById(fieldId);
        if (!existing) {
            throw new Error(`Field with ID ${fieldId} not found`);
        }

        // Check for duplicate source field if changing mapping
        if (input.sourceFieldName !== undefined &&
            input.sourceFieldName !== existing.sourceFieldName &&
            input.sourceFieldName !== null) {
            const exists = await repository.sourceFieldExists(
                existing.searchIndexId,
                input.sourceFieldName,
                fieldId
            );
            if (exists) {
                throw new Error(`Source field "${input.sourceFieldName}" is already mapped in this index`);
            }
        }

        // Build update data
        const updateData: Partial<NewSearchIndexField> = {};

        if (input.displayName !== undefined) updateData.displayName = input.displayName;
        if (input.isSearchable !== undefined) updateData.isSearchable = input.isSearchable;
        if (input.isFacetable !== undefined) updateData.isFacetable = input.isFacetable;
        if (input.includeInResponse !== undefined) updateData.includeInResponse = input.includeInResponse;
        if (input.boostValue !== undefined) updateData.boostValue = input.boostValue;
        if (input.isIndexed !== undefined) updateData.isIndexed = input.isIndexed;
        if (input.isVectorSource !== undefined) updateData.isVectorSource = input.isVectorSource;
        if (input.isAutocomplete !== undefined) updateData.isAutocomplete = input.isAutocomplete;
        if (input.customAnalyzer !== undefined) updateData.customAnalyzer = input.customAnalyzer;
        if (input.providerFieldSettings !== undefined) updateData.providerFieldSettings = input.providerFieldSettings;
        if (input.filterValueMappings !== undefined) updateData.filterValueMappings = input.filterValueMappings;

        // Handle mapping config
        if (input.mappingConfig !== undefined) {
            // Merge with existing config if partial update
            const existingConfig = getEffectiveMappingConfig(existing);
            const newConfig: FieldMappingConfig = {
                ...existingConfig,
                ...input.mappingConfig,
            } as FieldMappingConfig;

            updateData.transformConfig = newConfig as unknown as NewSearchIndexField['transformConfig'];

            // Update isMapped based on new config
            const modeIsMapped = ['static', 'generated', 'collect', 'computed'].includes(newConfig.mode)
                || (newConfig.mode === 'reference' && !!newConfig.sourceFromField)
                || (newConfig.mode === 'default' && (newConfig.staticValue !== undefined || !!newConfig.generator));
            if (modeIsMapped) {
                updateData.isMapped = true;
            }
        }

        // Handle source mapping updates
        if (input.sourceFieldName !== undefined) {
            updateData.sourceFieldName = input.sourceFieldName;
            updateData.isMapped = input.sourceFieldName !== null;
        }
        if (input.sourceFieldPath !== undefined) {
            updateData.sourceFieldPath = input.sourceFieldPath;
        }
        if (input.isMapped !== undefined) {
            updateData.isMapped = input.isMapped;
        }

        const updated = await repository.updateField(fieldId, updateData);

        // Check if this change requires reindex
        const requiresReindex =
            input.isSearchable !== undefined ||
            input.isFacetable !== undefined ||
            input.isIndexed !== undefined ||
            input.isVectorSource !== undefined ||
            input.isAutocomplete !== undefined ||
            input.customAnalyzer !== undefined ||
            input.providerFieldSettings !== undefined ||
            input.sourceFieldName !== undefined ||
            input.mappingConfig !== undefined;

        if (requiresReindex) {
            await searchIndexRepository.incrementMappingVersion(existing.searchIndexId, true);
        }

        logger.info('Updated search index field', {
            fieldId,
            searchIndexId: existing.searchIndexId,
            updatedBy: userId,
            requiresReindex,
        });

        return updated;
    } catch (error) {
        logger.error('Failed to update field', error as Error, { fieldId });
        throw error;
    }
}

/**
 * Update a field's source mapping
 */
export async function updateFieldMapping(
    fieldId: number,
    sourceFieldName: string | null,
    sourceFieldPath: string | null = null,
    userId: string,
    mappingConfig?: FieldMappingConfig
): Promise<SearchIndexField> {
    try {
        const existing = await repository.getFieldById(fieldId);
        if (!existing) {
            throw new Error(`Field with ID ${fieldId} not found`);
        }

        // Check for duplicate if setting a source field
        if (sourceFieldName !== null) {
            const exists = await repository.sourceFieldExists(
                existing.searchIndexId,
                sourceFieldName,
                fieldId
            );
            if (exists) {
                throw new Error(`Source field "${sourceFieldName}" is already mapped in this index`);
            }
        }

        const updated = await repository.updateFieldMapping(
            fieldId,
            sourceFieldName,
            sourceFieldPath,
            mappingConfig
        );

        // Mark index as requiring reindex
        await searchIndexRepository.incrementMappingVersion(existing.searchIndexId, true);

        logger.info('Updated field mapping', {
            fieldId,
            searchIndexId: existing.searchIndexId,
            sourceFieldName,
            updatedBy: userId,
        });

        return updated;
    } catch (error) {
        logger.error('Failed to update field mapping', error as Error, { fieldId });
        throw error;
    }
}

/**
 * Update a field's mapping configuration (mode, static value, etc.)
 */
export async function updateFieldMappingConfig(
    fieldId: number,
    mappingConfig: FieldMappingConfig,
    userId: string
): Promise<SearchIndexField> {
    try {
        const existing = await repository.getFieldById(fieldId);
        if (!existing) {
            throw new Error(`Field with ID ${fieldId} not found`);
        }

        const updated = await repository.updateFieldMappingConfig(fieldId, mappingConfig);

        // Mark index as requiring reindex
        await searchIndexRepository.incrementMappingVersion(existing.searchIndexId, true);

        logger.info('Updated field mapping config', {
            fieldId,
            searchIndexId: existing.searchIndexId,
            mode: mappingConfig.mode,
            updatedBy: userId,
        });

        return updated;
    } catch (error) {
        logger.error('Failed to update field mapping config', error as Error, { fieldId });
        throw error;
    }
}

/**
 * Bulk update field mappings
 * Used when saving all mappings from the mapping UI
 * 
 * UPDATED: Now supports mappingConfig for each field
 */
export async function bulkUpdateMappings(
    searchIndexId: string,
    input: BulkUpdateFieldMappingsDTO,
    userId: string
): Promise<SearchIndexField[]> {
    try {
        // Verify search index exists
        const searchIndex = await searchIndexRepository.getSearchIndexById(searchIndexId);
        if (!searchIndex) {
            throw new Error(`Search index with ID ${searchIndexId} not found`);
        }

        // Check for duplicate source field names in the input
        // Only check fields that have sourceFieldName set
        const sourceFieldNames = input.mappings
            .filter(m => m.sourceFieldName !== null)
            .map(m => m.sourceFieldName as string);

        const uniqueNames = new Set(sourceFieldNames);
        if (uniqueNames.size !== sourceFieldNames.length) {
            throw new Error('Duplicate source field names in mapping configuration');
        }

        // Perform bulk update
        // Cast to repository-expected type since Zod has validated the structure
        const mappingsForRepo = input.mappings as Array<{
            fieldId: number;
            sourceFieldName: string | null;
            sourceFieldPath?: string | null;
            mappingConfig?: FieldMappingConfig;
            isVectorSource?: boolean;
        }>;
        const updated = await repository.bulkUpdateMappings(searchIndexId, mappingsForRepo);

        // Mark index as requiring reindex
        await searchIndexRepository.incrementMappingVersion(searchIndexId, true);

        logger.info('Bulk updated field mappings', {
            searchIndexId,
            updatedCount: updated.length,
            updatedBy: userId,
        });

        return updated;
    } catch (error) {
        logger.error('Failed to bulk update mappings', error as Error, { searchIndexId });
        throw error;
    }
}

/**
 * Update additionalData field's collect configuration
 */
export async function updateAdditionalDataConfig(
    searchIndexId: string,
    collectFields: string[],
    userId: string
): Promise<SearchIndexField | null> {
    try {
        const updated = await repository.updateAdditionalDataConfig(searchIndexId, collectFields);

        if (updated) {
            await searchIndexRepository.incrementMappingVersion(searchIndexId, true);

            logger.info('Updated additionalData config', {
                searchIndexId,
                collectFieldsCount: collectFields.length,
                updatedBy: userId,
            });
        }

        return updated;
    } catch (error) {
        logger.error('Failed to update additionalData config', error as Error, { searchIndexId });
        throw error;
    }
}

/**
 * Clear all mappings for an index
 */
export async function clearAllMappings(
    searchIndexId: string,
    userId: string
): Promise<number> {
    try {
        const clearedCount = await repository.clearAllMappings(searchIndexId);

        // Mark index as requiring reindex
        await searchIndexRepository.incrementMappingVersion(searchIndexId, true);

        logger.info('Cleared all field mappings', {
            searchIndexId,
            clearedCount,
            clearedBy: userId,
        });

        return clearedCount;
    } catch (error) {
        logger.error('Failed to clear mappings', error as Error, { searchIndexId });
        throw error;
    }
}

// ============================================================================
// VALIDATION OPERATIONS
// ============================================================================

/**
 * Validate field mappings before indexing
 * Checks that all required fields are properly configured
 * 
 * UPDATED: Accounts for different mapping modes
 */
export async function validateMappings(searchIndexId: string): Promise<MappingValidationResult> {
    try {
        const fields = await repository.getFieldsBySearchIndexId(searchIndexId);
        const errors: FieldMappingValidationError[] = [];
        const warnings: Array<{ fieldId: number; fieldName: string; message: string }> = [];

        for (const field of fields) {
            const config = getEffectiveMappingConfig(field);
            const isEffectivelyMapped = isFieldEffectivelyMapped(field);

            // Check required fields
            if (field.isRequired && !isEffectivelyMapped) {
                errors.push({
                    fieldId: field.id,
                    fieldName: field.fieldName,
                    errorType: 'required_unmapped',
                    message: `Required field "${field.fieldName}" is not mapped or configured`,
                });
            }

            // Check mode-specific requirements
            if (config.mode === 'source' || config.mode === 'default') {
                // Source/default mode should have a source field (warning if not)
                if (!field.sourceFieldName && config.mode === 'source') {
                    if (!field.isRequired) {
                        warnings.push({
                            fieldId: field.id,
                            fieldName: field.fieldName,
                            message: `Field "${field.fieldName}" is in source mode but has no source field mapped`,
                        });
                    }
                }
            }

            if (config.mode === 'static' && config.staticValue === undefined) {
                errors.push({
                    fieldId: field.id,
                    fieldName: field.fieldName,
                    errorType: 'invalid_config',
                    message: `Field "${field.fieldName}" is in static mode but has no value configured`,
                });
            }

            if (config.mode === 'generated' && !config.generator) {
                errors.push({
                    fieldId: field.id,
                    fieldName: field.fieldName,
                    errorType: 'invalid_config',
                    message: `Field "${field.fieldName}" is in generated mode but has no generator configured`,
                });
            }
        }

        // Check for duplicate source field mappings
        const sourceFieldMap = new Map<string, number[]>();
        for (const field of fields) {
            if (field.sourceFieldName) {
                const existing = sourceFieldMap.get(field.sourceFieldName) || [];
                existing.push(field.id);
                sourceFieldMap.set(field.sourceFieldName, existing);
            }
        }

        for (const [sourceName, fieldIds] of sourceFieldMap) {
            if (fieldIds.length > 1) {
                for (const fieldId of fieldIds) {
                    const field = fields.find(f => f.id === fieldId);
                    if (field) {
                        errors.push({
                            fieldId: field.id,
                            fieldName: field.fieldName,
                            errorType: 'duplicate_source',
                            message: `Source field "${sourceName}" is mapped to multiple index fields`,
                        });
                    }
                }
            }
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings,
        };
    } catch (error) {
        logger.error('Failed to validate mappings', error as Error, { searchIndexId });
        throw error;
    }
}

/**
 * Check if index is ready for indexing
 * Returns true if all required fields are properly configured
 */
export async function isReadyForIndexing(searchIndexId: string): Promise<boolean> {
    const validation = await validateMappings(searchIndexId);
    return validation.isValid;
}

// ============================================================================
// DISTINCT VALUES (for auto-generating filter canonicals)
// ============================================================================

/**
 * Get distinct indexed values for a field.
 * Used to auto-generate filter value mappings (canonicals).
 *
 * Delegates to the search provider abstraction so this works
 * regardless of the underlying search engine (ES, Azure Search, etc.)
 */
export async function getFieldDistinctValues(
    searchIndexId: string,
    fieldId: number
): Promise<{ fieldName: string; values: Array<{ value: string; count: number }>; totalDistinct: number }> {
    // 1. Get the field to validate it exists and is facetable
    const field = await repository.getFieldById(fieldId);
    if (!field) {
        throw new Error(`Field with ID ${fieldId} not found`);
    }

    if (field.searchIndexId !== searchIndexId) {
        throw new Error(`Field ${fieldId} does not belong to search index ${searchIndexId}`);
    }

    if (!field.isFacetable) {
        throw new Error(`Field "${field.fieldName}" is not facetable. Only facetable fields support filter value mappings.`);
    }

    // 2. Get the search index to find the ES index name
    const searchIndex = await searchIndexRepository.getSearchIndexById(searchIndexId);
    if (!searchIndex) {
        throw new Error(`Search index with ID ${searchIndexId} not found`);
    }

    // 3. Use the search provider to get distinct values
    const { providerRegistry } = await import('@/features/search/providers');
    const provider = providerRegistry.get(searchIndex.searchProvider);

    if (!provider) {
        throw new Error(`Search provider "${searchIndex.searchProvider}" is not registered`);
    }

    if (!provider.getDistinctValues) {
        throw new Error('Search provider does not support distinct values retrieval');
    }

    const result = await provider.getDistinctValues(searchIndex.name, field.fieldName, {
        maxValues: 500,
        minDocCount: 1,
    });

    logger.info('Retrieved distinct values for field', {
        searchIndexId,
        fieldId,
        fieldName: field.fieldName,
        valuesFound: result.values.length,
        totalDistinct: result.totalDistinct,
    });

    return result;
}