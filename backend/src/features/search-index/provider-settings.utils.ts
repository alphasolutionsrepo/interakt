// src/features/search-index/provider-settings.utils.ts

/**
 * Provider Settings Utilities
 *
 * Backward-compatible helpers for reading provider-specific settings
 * from search indexes and fields. During the migration period, these
 * read from the new providerSettings JSON column first, falling back
 * to the legacy individual columns for pre-migration data.
 */

/**
 * Shape of the index properties we actually read.
 * Accepts both SearchIndex (DB row) and SearchIndexComplete (domain type).
 */
interface IndexWithProviderSettings {
    providerSettings?: Record<string, unknown> | null;
    numberOfShards: number;
    numberOfReplicas: number;
    refreshInterval: string;
}

/**
 * Shape of the field properties we actually read.
 * Accepts both SearchIndexField (DB row) and any domain type with these fields.
 */
interface FieldWithProviderSettings {
    providerFieldSettings?: Record<string, unknown> | null;
    isAutocomplete: boolean;
    customAnalyzer: string | null;
}

/**
 * Get provider-specific settings for a search index.
 *
 * Reads from providerSettings JSON column if populated,
 * otherwise falls back to legacy ES-specific columns.
 */
export function getProviderSettings(
    index: IndexWithProviderSettings
): Record<string, unknown> {
    // Use providerSettings if it exists and is non-empty
    if (
        index.providerSettings &&
        typeof index.providerSettings === 'object' &&
        Object.keys(index.providerSettings).length > 0
    ) {
        return index.providerSettings as Record<string, unknown>;
    }

    // Fallback to legacy ES columns for pre-migration indexes
    return {
        numberOfShards: index.numberOfShards,
        numberOfReplicas: index.numberOfReplicas,
        refreshInterval: index.refreshInterval,
    };
}

/**
 * Get provider-specific field settings for a search index field.
 *
 * Reads from providerFieldSettings JSON column if populated,
 * otherwise falls back to legacy ES-specific columns.
 */
export function getProviderFieldSettings(
    field: FieldWithProviderSettings
): Record<string, unknown> {
    // Use providerFieldSettings if it exists and is non-empty
    if (
        field.providerFieldSettings &&
        typeof field.providerFieldSettings === 'object' &&
        Object.keys(field.providerFieldSettings).length > 0
    ) {
        return field.providerFieldSettings as Record<string, unknown>;
    }

    // Fallback to legacy ES columns for pre-migration fields
    return {
        isAutocomplete: field.isAutocomplete,
        customAnalyzer: field.customAnalyzer,
    };
}
