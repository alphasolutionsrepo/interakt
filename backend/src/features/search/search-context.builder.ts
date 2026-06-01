// src/features/search/search-context.builder.ts

/**
 * Search Context Builder
 *
 * Transforms SearchIndexComplete into SearchContext for providers.
 * SearchContext contains all configuration needed for search execution.
 */

import type { SearchIndexComplete } from '@/features/search-index';
import type { SearchIndexField } from '@/db/schema/search-index-fields.schema';
import type { SearchType, VectorSimilarity } from '@/shared/constants/search-index.constants';
import type {
    SearchContext,
    SearchableFieldConfig,
    FacetableFieldConfig,
    FieldConfig,
    EmbeddingConfig,
    RRFConfig,
} from './search.types';
import { createLogger } from '@/shared/logger/logger';

// ============================================================================
// LOGGING CONFIGURATION
// ============================================================================

/**
 * Enable detailed field configuration logging
 * Set LOG_ES_QUERIES=true to see field configuration details
 */
const FIELD_CONFIG_LOGGING_ENABLED = process.env.LOG_ES_QUERIES === 'true';

// Async logger for field configuration debugging
const fieldConfigLogger = createLogger('field-config');

// ============================================================================
// CONTEXT BUILDER
// ============================================================================

/**
 * Build SearchContext from SearchIndexComplete
 *
 * @param index - Complete search index with all fields and configuration
 * @returns SearchContext for use by search providers
 */
export function buildSearchContext(index: SearchIndexComplete): SearchContext {
    // Log all fields from DB for debugging (async, non-blocking)
    if (FIELD_CONFIG_LOGGING_ENABLED) {
        fieldConfigLogger.debug('Fields from DB', {
            index: index.name,
            totalFields: index.fields.length,
            fields: index.fields.map(f => ({
                name: f.fieldName,
                isMapped: f.isMapped,
                includeInResponse: f.includeInResponse,
                isSearchable: f.isSearchable,
                isFacetable: f.isFacetable,
                isIndexed: f.isIndexed,
            })),
        });
    }

    // Build field configurations
    const searchableFields = buildSearchableFields(index.fields);
    const facetableFields = buildFacetableFields(index.fields);
    const defaultResponseFields = buildDefaultResponseFields(index.fields);
    const allFields = buildAllFieldsMap(index.fields);

    // Log which fields passed filtering (async, non-blocking)
    if (FIELD_CONFIG_LOGGING_ENABLED) {
        fieldConfigLogger.debug('Field config result', {
            index: index.name,
            searchableFields: searchableFields.map(f => f.fieldName),
            facetableFields: facetableFields.map(f => f.fieldName),
            responseFields: defaultResponseFields,
        });
    }

    // Build embedding config (if semantic/hybrid)
    const embedding = buildEmbeddingConfig(index);

    // Build RRF config (if hybrid)
    const rrf = buildRRFConfig(index);

    return {
        indexName: index.name,
        indexId: index.id,
        searchProvider: index.searchProvider ?? 'elasticsearch',
        searchType: index.searchType as SearchType,
        searchableFields,
        facetableFields,
        defaultResponseFields,
        allFields,
        language: index.language,
        embedding,
        rrf,
    };
}

// ============================================================================
// FIELD BUILDERS
// ============================================================================

/**
 * Build searchable field configurations
 */
function buildSearchableFields(fields: SearchIndexField[]): SearchableFieldConfig[] {
    return fields
        .filter(field => field.isSearchable && field.isIndexed && hasDataAvailable(field))
        .map(field => ({
            fieldName: field.fieldName,
            fieldType: field.fieldType,
            boostValue: field.boostValue,
            analyzer: field.customAnalyzer || undefined,
        }));
}

/**
 * Build facetable field configurations
 */
function buildFacetableFields(fields: SearchIndexField[]): FacetableFieldConfig[] {
    return fields
        .filter(field => field.isFacetable && field.isIndexed && hasDataAvailable(field))
        .map(field => ({
            fieldName: field.fieldName,
            fieldType: field.fieldType,
            displayName: field.displayName || undefined,
        }));
}

/**
 * Check if a field has data available (either mapped or computed/generated)
 */
function hasDataAvailable(field: SearchIndexField): boolean {
    // Explicitly mapped to source field
    if (field.isMapped) return true;

    // Check transform config for computed/generated/static fields
    const config = field.transformConfig as { mode?: string } | null;
    if (config?.mode) {
        // These modes generate data without explicit source mapping
        const dataGeneratingModes = ['computed', 'generated', 'static', 'collect'];
        if (dataGeneratingModes.includes(config.mode)) {
            return true;
        }
    }

    return false;
}

/**
 * Build list of fields to include in response by default.
 * Only includes fields that are indexed AND have data available —
 * this prevents requesting fields that don't exist in the search provider.
 */
function buildDefaultResponseFields(fields: SearchIndexField[]): string[] {
    return fields
        .filter(field =>
            field.includeInResponse
            && field.isIndexed
            && hasDataAvailable(field)
            // Exclude system fields that aren't mapped (e.g. additionalData with no collectFields)
            && !isEmptySystemField(field)
        )
        .map(field => field.fieldName);
}

/**
 * Check if a system field is empty/unconfigured and shouldn't be requested.
 * Also excludes auto-generated system timestamp fields (createdAt, updatedAt)
 * which are not useful in search responses and may not exist in the provider index.
 */
function isEmptySystemField(field: SearchIndexField): boolean {
    if (!field.isSystemField) return false;
    const config = field.transformConfig as { mode?: string; collectFields?: string[]; generator?: string } | null;
    // additionalData/customFields with mode='none' or mode='collect' with empty collectFields
    if (config?.mode === 'none') return true;
    if (config?.mode === 'collect' && (!config.collectFields || config.collectFields.length === 0)) {
        return true;
    }
    // Auto-generated timestamp fields (createdAt, updatedAt) — these exist in the DB
    // but are not useful in search responses and may not be retrievable in all providers
    if (config?.mode === 'generated' && config.generator === 'timestamp') {
        return true;
    }
    return false;
}

/**
 * Build map of all indexed fields for validation
 */
function buildAllFieldsMap(fields: SearchIndexField[]): Map<string, FieldConfig> {
    const fieldMap = new Map<string, FieldConfig>();

    for (const field of fields) {
        if (!hasDataAvailable(field)) continue;

        fieldMap.set(field.fieldName, {
            fieldName: field.fieldName,
            fieldType: field.fieldType,
            isSearchable: field.isSearchable,
            isFacetable: field.isFacetable,
            isIndexed: field.isIndexed,
            includeInResponse: field.includeInResponse,
            boostValue: field.boostValue,
        });
    }

    return fieldMap;
}

// ============================================================================
// AI/EMBEDDING BUILDERS
// ============================================================================

/**
 * Build embedding configuration for semantic/hybrid search
 */
function buildEmbeddingConfig(index: SearchIndexComplete): EmbeddingConfig | undefined {
    // Only applicable for semantic/hybrid search types
    const searchType = index.searchType as SearchType;
    if (searchType !== 'semantic' && searchType !== 'hybrid') {
        return undefined;
    }

    // Must have AI configuration
    if (!index.embeddingDimensions || !index.vectorSimilarity) {
        return undefined;
    }

    return {
        dimensions: index.embeddingDimensions,
        similarity: index.vectorSimilarity as VectorSimilarity,
        fieldName: 'content_embedding', // Standard field name for vector embeddings
    };
}

/**
 * Build RRF configuration for hybrid search
 *
 * Note: RRF settings now come from global settings, not index level.
 * The index.rrfRankConstant and index.rrfWindowSize fields are deprecated.
 * Experience-level overrides are applied at search time in the provider.
 */
function buildRRFConfig(index: SearchIndexComplete): RRFConfig | undefined {
    // Only applicable for hybrid search
    const searchType = index.searchType as SearchType;
    if (searchType !== 'hybrid') {
        return undefined;
    }

    // Return default values - actual values come from global settings
    // and can be overridden at the Search Experience level
    // The search provider will merge these with global settings
    return {
        rankConstant: 60,  // Default, will be overridden by global settings
        windowSize: 100,   // Default, will be overridden by global settings
    };
}

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Validate that a field exists and is searchable
 */
export function validateSearchableField(
    context: SearchContext,
    fieldName: string
): { valid: boolean; error?: string } {
    const field = context.allFields.get(fieldName);

    if (!field) {
        return {
            valid: false,
            error: `Field "${fieldName}" does not exist in index "${context.indexName}"`,
        };
    }

    if (!field.isSearchable) {
        return {
            valid: false,
            error: `Field "${fieldName}" is not searchable`,
        };
    }

    return { valid: true };
}

/**
 * Validate that a field exists and is facetable
 */
export function validateFacetableField(
    context: SearchContext,
    fieldName: string
): { valid: boolean; error?: string } {
    const field = context.allFields.get(fieldName);

    if (!field) {
        return {
            valid: false,
            error: `Field "${fieldName}" does not exist in index "${context.indexName}"`,
        };
    }

    if (!field.isFacetable) {
        return {
            valid: false,
            error: `Field "${fieldName}" is not facetable`,
        };
    }

    return { valid: true };
}

/**
 * Validate that a field exists and can be used for filtering
 */
export function validateFilterableField(
    context: SearchContext,
    fieldName: string
): { valid: boolean; error?: string } {
    const field = context.allFields.get(fieldName);

    if (!field) {
        return {
            valid: false,
            error: `Field "${fieldName}" does not exist in index "${context.indexName}"`,
        };
    }

    if (!field.isIndexed) {
        return {
            valid: false,
            error: `Field "${fieldName}" is not indexed and cannot be filtered`,
        };
    }

    return { valid: true };
}

/**
 * Validate that a field exists and can be used for sorting
 */
export function validateSortableField(
    context: SearchContext,
    fieldName: string
): { valid: boolean; error?: string } {
    const field = context.allFields.get(fieldName);

    if (!field) {
        return {
            valid: false,
            error: `Field "${fieldName}" does not exist in index "${context.indexName}"`,
        };
    }

    // Text fields cannot be sorted directly (need keyword subfield)
    if (field.fieldType === 'text') {
        return {
            valid: false,
            error: `Text field "${fieldName}" cannot be used for sorting directly`,
        };
    }

    return { valid: true };
}

/**
 * Get vector source fields (fields used for embedding generation)
 */
export function getVectorSourceFields(fields: SearchIndexField[]): string[] {
    return fields
        .filter(field => field.isVectorSource && field.isMapped)
        .map(field => field.fieldName);
}

/**
 * Check if search context supports semantic search
 */
export function supportsSemanticSearch(context: SearchContext): boolean {
    return context.embedding !== undefined;
}

/**
 * Check if search context supports hybrid search
 */
export function supportsHybridSearch(context: SearchContext): boolean {
    return context.rrf !== undefined && context.embedding !== undefined;
}
