// app/search-indexes/_lib/utils/field-mappings-json.ts

/**
 * Field Mappings JSON Conversion Utility
 *
 * Converts between the internal field mapping state (FieldMapping[] + FieldAttributeChange Map)
 * and a portable JSON format suitable for viewing, editing, export, and import.
 *
 * The JSON uses fieldName as the key (not fieldId) for human readability and portability.
 */

import type {
    SearchIndexField,
    FieldMappingConfig,
    MappingMode,
    ValueTransform,
    GeneratorType,
    ComputedFieldConfig,
} from '@/features/search-index';
import { getFieldMappingConfig, MAPPING_MODES, VALUE_TRANSFORMS, GENERATOR_TYPES } from '@/features/search-index';
import type { FieldAttributeChange } from '../../_components/FieldMappingTable';

// ============================================================================
// JSON SCHEMA TYPES
// ============================================================================

export interface FieldMappingsJson {
    _version: 1;
    _indexName: string;
    _searchProvider: string;
    _exportedAt?: string;
    fields: FieldMappingJsonEntry[];
}

export interface FieldMappingJsonEntry {
    fieldName: string;
    fieldType: string;
    displayName: string | null;
    isSystemField: boolean;
    isRequired: boolean;

    mapping: {
        mode: string;
        sourceField: string | null;
        transform: string;
        staticValue?: unknown;
        generator?: string;
        computed?: ComputedFieldConfig;
        collectFields?: string[];
        sourceFromField?: string;
    };

    attributes: {
        isSearchable: boolean;
        isFacetable: boolean;
        includeInResponse: boolean;
        boostValue: number;
        isVectorSource: boolean;
    };

    providerFieldSettings?: Record<string, unknown>;
    filterValueMappings?: Record<string, string[]>;
}

// Internal FieldMapping type (matches page.tsx)
interface FieldMapping {
    fieldId: number;
    sourceFieldPath: string | null;
    mappingConfig?: FieldMappingConfig;
    isAutoMapped?: boolean;
    isVectorSource?: boolean;
}

interface IndexMeta {
    name: string;
    searchProvider: string;
}

// ============================================================================
// FIELDS → JSON
// ============================================================================

/**
 * Convert internal field state to portable JSON format.
 */
export function fieldsToJson(
    fields: SearchIndexField[],
    localMappings: FieldMapping[],
    pendingAttributeChanges: Map<number, FieldAttributeChange>,
    indexMeta: IndexMeta,
): FieldMappingsJson {
    const mappingsByFieldId = new Map(localMappings.map(m => [m.fieldId, m]));

    const jsonFields: FieldMappingJsonEntry[] = fields.map(field => {
        const localMapping = mappingsByFieldId.get(field.id);
        const pendingChange = pendingAttributeChanges.get(field.id);

        // Get mapping config: local unsaved first, then from DB
        const mappingConfig = localMapping?.mappingConfig
            ?? getFieldMappingConfig(field.transformConfig);

        // Source field: local unsaved first, then from DB
        const sourceField = localMapping?.sourceFieldPath ?? field.sourceFieldName ?? null;

        // Build mapping section - only include mode-specific fields
        const mapping: FieldMappingJsonEntry['mapping'] = {
            mode: mappingConfig.mode,
            sourceField,
            transform: mappingConfig.transform ?? 'none',
        };

        if (mappingConfig.staticValue !== undefined) {
            mapping.staticValue = mappingConfig.staticValue;
        }
        if (mappingConfig.generator) {
            mapping.generator = mappingConfig.generator;
        }
        if (mappingConfig.computed) {
            mapping.computed = mappingConfig.computed;
        }
        if (mappingConfig.collectFields && mappingConfig.collectFields.length > 0) {
            mapping.collectFields = mappingConfig.collectFields;
        }
        if (mappingConfig.sourceFromField) {
            mapping.sourceFromField = mappingConfig.sourceFromField;
        }

        // Merge pending attribute changes over current field values
        const isVectorSource = localMapping?.isVectorSource ?? field.isVectorSource ?? false;

        return {
            fieldName: field.fieldName,
            fieldType: field.fieldType,
            displayName: field.displayName,
            isSystemField: field.isSystemField,
            isRequired: field.isRequired,
            mapping,
            attributes: {
                isSearchable: pendingChange?.isSearchable ?? field.isSearchable,
                isFacetable: pendingChange?.isFacetable ?? field.isFacetable,
                includeInResponse: pendingChange?.includeInResponse ?? field.includeInResponse,
                boostValue: pendingChange?.boostValue ?? field.boostValue,
                isVectorSource,
            },
            ...(Object.keys(pendingChange?.providerFieldSettings ?? field.providerFieldSettings ?? {}).length > 0 && {
                providerFieldSettings: pendingChange?.providerFieldSettings ?? field.providerFieldSettings ?? {},
            }),
            ...(Object.keys(pendingChange?.filterValueMappings ?? field.filterValueMappings ?? {}).length > 0 && {
                filterValueMappings: pendingChange?.filterValueMappings ?? field.filterValueMappings ?? {},
            }),
        };
    });

    return {
        _version: 1,
        _indexName: indexMeta.name,
        _searchProvider: indexMeta.searchProvider,
        fields: jsonFields,
    };
}

// ============================================================================
// JSON → FIELDS
// ============================================================================

export interface JsonConversionResult {
    localMappings: FieldMapping[];
    pendingAttributeChanges: Map<number, FieldAttributeChange>;
    /**
     * Entries from the JSON whose `fieldName` doesn't match any existing field
     * in the index. These are candidates to be CREATED before the rest of the
     * import is applied — caller should POST them to /fields/from-mapping,
     * then re-run this function with the refreshed field list.
     */
    fieldsToCreate: FieldMappingJsonEntry[];
    errors: string[];
    warnings: string[];
}

/**
 * Convert JSON back to internal field mapping state.
 * Matches JSON entries to existing fields by fieldName.
 */
export function jsonToMappingsAndChanges(
    json: FieldMappingsJson,
    fields: SearchIndexField[],
): JsonConversionResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const localMappings: FieldMapping[] = [];
    const pendingAttributeChanges = new Map<number, FieldAttributeChange>();
    const fieldsToCreate: FieldMappingJsonEntry[] = [];

    const fieldsByName = new Map(fields.map(f => [f.fieldName, f]));
    const matchedFieldNames = new Set<string>();

    for (const entry of json.fields) {
        const field = fieldsByName.get(entry.fieldName);
        if (!field) {
            // Field doesn't exist in the index yet — flag it for creation
            // instead of silently skipping. Validate mode/transform now so
            // bad entries surface as errors rather than failing later.
            if (!MAPPING_MODES.includes(entry.mapping.mode as MappingMode)) {
                errors.push(`Field "${entry.fieldName}": invalid mode "${entry.mapping.mode}"`);
                continue;
            }
            if (entry.mapping.transform && !VALUE_TRANSFORMS.includes(entry.mapping.transform as ValueTransform)) {
                errors.push(`Field "${entry.fieldName}": invalid transform "${entry.mapping.transform}"`);
                continue;
            }
            fieldsToCreate.push(entry);
            continue;
        }
        matchedFieldNames.add(entry.fieldName);

        const { mapping } = entry;

        // Validate mapping mode
        if (!MAPPING_MODES.includes(mapping.mode as MappingMode)) {
            errors.push(`Field "${entry.fieldName}": invalid mode "${mapping.mode}"`);
            continue;
        }

        // Validate transform
        const transform = (mapping.transform ?? 'none') as ValueTransform;
        if (!VALUE_TRANSFORMS.includes(transform)) {
            errors.push(`Field "${entry.fieldName}": invalid transform "${mapping.transform}"`);
            continue;
        }

        // Build FieldMappingConfig from JSON
        const mode = mapping.mode as MappingMode;
        const mappingConfig: FieldMappingConfig = {
            mode,
            transform,
        };

        // Mode-specific fields
        if (mapping.staticValue !== undefined) {
            mappingConfig.staticValue = mapping.staticValue;
        }
        if (mapping.generator) {
            if (!GENERATOR_TYPES.includes(mapping.generator as GeneratorType)) {
                errors.push(`Field "${entry.fieldName}": invalid generator "${mapping.generator}"`);
                continue;
            }
            mappingConfig.generator = mapping.generator as GeneratorType;
        }
        if (mapping.computed) {
            mappingConfig.computed = mapping.computed;
        }
        if (mapping.collectFields) {
            mappingConfig.collectFields = mapping.collectFields;
        }
        if (mapping.sourceFromField) {
            mappingConfig.sourceFromField = mapping.sourceFromField;
        }

        // Mode-specific validation
        if (mode === 'static' && mappingConfig.staticValue === undefined) {
            errors.push(`Field "${entry.fieldName}": mode "static" requires staticValue`);
            continue;
        }
        if (mode === 'generated' && !mappingConfig.generator) {
            errors.push(`Field "${entry.fieldName}": mode "generated" requires generator`);
            continue;
        }
        if (mode === 'computed' && (!mappingConfig.computed?.sourceArrayPath || !mappingConfig.computed?.extractField || !mappingConfig.computed?.aggregation)) {
            errors.push(`Field "${entry.fieldName}": mode "computed" requires computed config with sourceArrayPath, extractField, and aggregation`);
            continue;
        }
        if (mode === 'reference' && !mappingConfig.sourceFromField) {
            errors.push(`Field "${entry.fieldName}": mode "reference" requires sourceFromField`);
            continue;
        }

        // Build FieldMapping
        localMappings.push({
            fieldId: field.id,
            sourceFieldPath: mapping.sourceField ?? null,
            mappingConfig,
            isAutoMapped: false,
            isVectorSource: entry.attributes?.isVectorSource ?? field.isVectorSource ?? false,
        });

        // Build attribute changes (only include what differs from current field)
        if (entry.attributes) {
            const change: FieldAttributeChange = { fieldId: field.id };
            let hasChanges = false;

            if (entry.attributes.isSearchable !== field.isSearchable) {
                change.isSearchable = entry.attributes.isSearchable;
                hasChanges = true;
            }
            if (entry.attributes.isFacetable !== field.isFacetable) {
                change.isFacetable = entry.attributes.isFacetable;
                hasChanges = true;
            }
            if (entry.attributes.includeInResponse !== field.includeInResponse) {
                change.includeInResponse = entry.attributes.includeInResponse;
                hasChanges = true;
            }
            if (entry.attributes.boostValue !== field.boostValue) {
                change.boostValue = entry.attributes.boostValue;
                hasChanges = true;
            }

            if (entry.providerFieldSettings && JSON.stringify(entry.providerFieldSettings) !== JSON.stringify(field.providerFieldSettings ?? {})) {
                change.providerFieldSettings = entry.providerFieldSettings;
                hasChanges = true;
            }
            if (entry.filterValueMappings && JSON.stringify(entry.filterValueMappings) !== JSON.stringify(field.filterValueMappings ?? {})) {
                change.filterValueMappings = entry.filterValueMappings;
                hasChanges = true;
            }

            if (hasChanges) {
                pendingAttributeChanges.set(field.id, change);
            }
        }
    }

    // Add mappings for fields not in JSON (preserve current config)
    for (const field of fields) {
        if (!matchedFieldNames.has(field.fieldName)) {
            localMappings.push({
                fieldId: field.id,
                sourceFieldPath: field.sourceFieldName ?? null,
                mappingConfig: getFieldMappingConfig(field.transformConfig),
                isAutoMapped: false,
                isVectorSource: field.isVectorSource ?? false,
            });
            warnings.push(`Field "${field.fieldName}" not in JSON — keeping current config`);
        }
    }

    return { localMappings, pendingAttributeChanges, fieldsToCreate, errors, warnings };
}

// ============================================================================
// VALIDATION
// ============================================================================

export interface ValidationResult {
    valid: boolean;
    errors: string[];
}

/**
 * Validate parsed JSON structure before attempting conversion.
 */
export function validateFieldMappingsJson(parsed: unknown): ValidationResult {
    const errors: string[] = [];

    if (!parsed || typeof parsed !== 'object') {
        return { valid: false, errors: ['Expected a JSON object'] };
    }

    const json = parsed as Record<string, unknown>;

    if (!Array.isArray(json.fields)) {
        return { valid: false, errors: ['Missing "fields" array'] };
    }

    for (let i = 0; i < json.fields.length; i++) {
        const entry = json.fields[i] as Record<string, unknown>;
        const prefix = `fields[${i}]`;

        if (!entry.fieldName || typeof entry.fieldName !== 'string') {
            errors.push(`${prefix}: missing or invalid "fieldName"`);
            continue;
        }

        if (!entry.mapping || typeof entry.mapping !== 'object') {
            errors.push(`${prefix} (${entry.fieldName}): missing "mapping" object`);
            continue;
        }

        const mapping = entry.mapping as Record<string, unknown>;
        if (!mapping.mode || typeof mapping.mode !== 'string') {
            errors.push(`${prefix} (${entry.fieldName}): missing "mapping.mode"`);
        } else if (!MAPPING_MODES.includes(mapping.mode as MappingMode)) {
            errors.push(`${prefix} (${entry.fieldName}): invalid mode "${mapping.mode}". Valid: ${MAPPING_MODES.join(', ')}`);
        }

        if (mapping.transform && typeof mapping.transform === 'string' && !VALUE_TRANSFORMS.includes(mapping.transform as ValueTransform)) {
            errors.push(`${prefix} (${entry.fieldName}): invalid transform "${mapping.transform}". Valid: ${VALUE_TRANSFORMS.join(', ')}`);
        }
    }

    return { valid: errors.length === 0, errors };
}

// ============================================================================
// DIFF SUMMARY
// ============================================================================

export interface DiffSummary {
    totalFields: number;
    matchedFields: number;
    mappingChanges: number;
    attributeChanges: number;
    /** JSON entries whose name doesn't match an existing field — will be CREATED on apply. */
    fieldsToCreate: number;
    unmatchedInIndex: number;
}

/**
 * Compute a diff summary between JSON and current field state.
 */
export function computeDiffSummary(
    json: FieldMappingsJson,
    fields: SearchIndexField[],
    currentMappings: FieldMapping[],
): DiffSummary {
    const fieldsByName = new Map(fields.map(f => [f.fieldName, f]));
    const currentByFieldId = new Map(currentMappings.map(m => [m.fieldId, m]));

    let matchedFields = 0;
    let mappingChanges = 0;
    let attributeChanges = 0;
    let fieldsToCreate = 0;

    for (const entry of json.fields) {
        const field = fieldsByName.get(entry.fieldName);
        if (!field) {
            fieldsToCreate++;
            continue;
        }
        matchedFields++;

        // Check if mapping changed
        const current = currentByFieldId.get(field.id);
        const currentConfig = current?.mappingConfig ?? getFieldMappingConfig(field.transformConfig);
        if (
            entry.mapping.mode !== currentConfig.mode ||
            (entry.mapping.sourceField ?? null) !== (current?.sourceFieldPath ?? field.sourceFieldName ?? null) ||
            (entry.mapping.transform ?? 'none') !== (currentConfig.transform ?? 'none')
        ) {
            mappingChanges++;
        }

        // Check if attributes changed
        if (entry.attributes) {
            if (
                entry.attributes.isSearchable !== field.isSearchable ||
                entry.attributes.isFacetable !== field.isFacetable ||
                entry.attributes.includeInResponse !== field.includeInResponse ||
                entry.attributes.boostValue !== field.boostValue ||
                entry.attributes.isVectorSource !== (field.isVectorSource ?? false)
            ) {
                attributeChanges++;
            }
        }
    }

    const matchedFieldNames = new Set(json.fields.map(e => e.fieldName));
    const unmatchedInIndex = fields.filter(f => !matchedFieldNames.has(f.fieldName)).length;

    return {
        totalFields: fields.length,
        matchedFields,
        mappingChanges,
        attributeChanges,
        fieldsToCreate,
        unmatchedInIndex,
    };
}
