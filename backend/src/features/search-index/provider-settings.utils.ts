// src/features/search-index/provider-settings.utils.ts

/**
 * Provider Settings Utilities
 *
 * Backward-compatible helpers for reading provider-specific settings
 * from search indexes and fields. During the migration period, these
 * read from the new providerSettings JSON column first, falling back
 * to the legacy individual columns for pre-migration data.
 *
 * Also assembles the full IndexSettingsBuildContext, so every code path that
 * creates a provider index derives it the same way.
 */

// `import type` only — this module is erased at runtime, so it does not pull in
// the 'server-only' guard that search-engine-provider.interface.ts carries.
import type { IndexSettingsBuildContext } from '@/features/search/providers/search-engine-provider.interface';

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
 * Index properties needed to build a full IndexSettingsBuildContext:
 * provider settings plus the text-analysis configuration.
 */
interface IndexForSettingsContext extends IndexWithProviderSettings {
    language?: string | null;
    synonyms?: unknown;
    stopWords?: unknown;
}

/**
 * Field properties needed to build a full IndexSettingsBuildContext.
 */
interface FieldForSettingsContext extends FieldWithProviderSettings {
    fieldName: string;
    fieldType: string;
    isSearchable: boolean;
    isFacetable: boolean;
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

/**
 * Normalize a JSON column that should hold a list of strings.
 * Drizzle types these as string[], but older rows can hold null or junk.
 */
function toStringList(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value
        .filter((v): v is string => typeof v === 'string')
        .map(v => v.trim())
        .filter(v => v.length > 0);
}

/**
 * Assemble the context a provider needs to build its native index settings.
 *
 * Every path that creates a provider index goes through here — reindex,
 * recreate-empty, and the auto-create on first document upload — so an index
 * gets the same mappings and the same text analysis regardless of how it came
 * into existence. Previously each call site built this object by hand and they
 * had drifted: the auto-create path passed no synonyms at all.
 */
export function buildIndexSettingsContext(
    index: IndexForSettingsContext,
    fields: FieldForSettingsContext[],
    embeddingConfig?: { fieldName: string; dimensions: number; similarity: string }
): IndexSettingsBuildContext {
    return {
        fields: fields.map(f => ({
            fieldName: f.fieldName,
            fieldType: f.fieldType,
            isSearchable: f.isSearchable,
            isFacetable: f.isFacetable,
            isAutocomplete: f.isAutocomplete,
            providerFieldSettings: getProviderFieldSettings(f),
        })),
        providerSettings: getProviderSettings(index),
        embeddingConfig,
        synonyms: toStringList(index.synonyms),
        language: index.language ?? 'english',
        stopWords: toStringList(index.stopWords),
    };
}
