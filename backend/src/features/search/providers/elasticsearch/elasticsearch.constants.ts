// src/features/search/providers/elasticsearch/elasticsearch.constants.ts

/**
 * Elasticsearch-Specific Constants
 *
 * Constants, settings, and configuration values specific to Elasticsearch.
 * These are used by the ES provider implementation and the ES-specific UI components.
 *
 * Provider-agnostic constants (SearchType, MappingMode, etc.) remain in
 * @/shared/constants/search-index.constants.ts
 */

// ============================================================================
// ELASTICSEARCH INDEX SETTINGS TYPE
// ============================================================================

/**
 * Elasticsearch index settings snapshot
 */
export interface ElasticsearchSettings {
    numberOfShards: number;
    numberOfReplicas: number;
    refreshInterval: string;
}

// ============================================================================
// AUTOCOMPLETE ANALYZER
// ============================================================================

/**
 * Edge n-gram analyzer settings for autocomplete
 * - autocomplete: Used at INDEX time to create partial word tokens
 * - autocomplete_search: Used at SEARCH time (standard tokenizer)
 *
 * This configuration is added to ES index settings when any field
 * has isAutocomplete=true.
 */
export const AUTOCOMPLETE_ANALYZER_SETTINGS = {
    analysis: {
        analyzer: {
            autocomplete: {
                tokenizer: 'autocomplete_tokenizer',
                filter: ['lowercase'],
            },
            autocomplete_search: {
                tokenizer: 'standard',
                filter: ['lowercase'],
            },
        },
        tokenizer: {
            autocomplete_tokenizer: {
                type: 'edge_ngram',
                min_gram: 2,
                max_gram: 20,
                token_chars: ['letter', 'digit'],
            },
        },
    },
} as const;

/**
 * Predefined analyzer types available in Elasticsearch
 */
export const PREDEFINED_ANALYZERS = ['standard', 'autocomplete'] as const;
export type PredefinedAnalyzer = typeof PREDEFINED_ANALYZERS[number];

/**
 * Information about predefined analyzers for UI
 */
export const PREDEFINED_ANALYZER_INFO: Record<PredefinedAnalyzer, {
    label: string;
    description: string;
    useCase: string;
}> = {
    standard: {
        label: 'Standard',
        description: 'Default Elasticsearch analyzer with standard tokenization',
        useCase: 'General text search',
    },
    autocomplete: {
        label: 'Autocomplete',
        description: 'Edge n-gram analyzer optimized for type-ahead suggestions',
        useCase: 'Product names, titles, and other fields needing autocomplete',
    },
};

/**
 * Fields that support autocomplete functionality
 * Only text-based field types can use autocomplete
 */
export const AUTOCOMPLETE_COMPATIBLE_FIELD_TYPES = ['text'] as const;

/**
 * Check if a field type supports autocomplete
 */
export function isAutocompleteCompatibleFieldType(fieldType: string): boolean {
    return AUTOCOMPLETE_COMPATIBLE_FIELD_TYPES.includes(fieldType as typeof AUTOCOMPLETE_COMPATIBLE_FIELD_TYPES[number]);
}

// ============================================================================
// ELASTICSEARCH LANGUAGES
// Supported languages for text analysis
// ============================================================================

export const ES_LANGUAGES = [
    { value: 'arabic', label: 'Arabic' },
    { value: 'armenian', label: 'Armenian' },
    { value: 'basque', label: 'Basque' },
    { value: 'bengali', label: 'Bengali' },
    { value: 'brazilian', label: 'Brazilian Portuguese' },
    { value: 'bulgarian', label: 'Bulgarian' },
    { value: 'catalan', label: 'Catalan' },
    { value: 'chinese', label: 'Chinese' },
    { value: 'cjk', label: 'CJK (Chinese, Japanese, Korean)' },
    { value: 'czech', label: 'Czech' },
    { value: 'danish', label: 'Danish' },
    { value: 'dutch', label: 'Dutch' },
    { value: 'english', label: 'English' },
    { value: 'estonian', label: 'Estonian' },
    { value: 'finnish', label: 'Finnish' },
    { value: 'french', label: 'French' },
    { value: 'galician', label: 'Galician' },
    { value: 'german', label: 'German' },
    { value: 'greek', label: 'Greek' },
    { value: 'hindi', label: 'Hindi' },
    { value: 'hungarian', label: 'Hungarian' },
    { value: 'indonesian', label: 'Indonesian' },
    { value: 'irish', label: 'Irish' },
    { value: 'italian', label: 'Italian' },
    { value: 'japanese', label: 'Japanese' },
    { value: 'korean', label: 'Korean' },
    { value: 'latvian', label: 'Latvian' },
    { value: 'lithuanian', label: 'Lithuanian' },
    { value: 'norwegian', label: 'Norwegian' },
    { value: 'persian', label: 'Persian' },
    { value: 'polish', label: 'Polish' },
    { value: 'portuguese', label: 'Portuguese' },
    { value: 'romanian', label: 'Romanian' },
    { value: 'russian', label: 'Russian' },
    { value: 'serbian', label: 'Serbian' },
    { value: 'sorani', label: 'Sorani Kurdish' },
    { value: 'spanish', label: 'Spanish' },
    { value: 'swedish', label: 'Swedish' },
    { value: 'thai', label: 'Thai' },
    { value: 'turkish', label: 'Turkish' },
    { value: 'standard', label: 'Standard (No language-specific processing)' },
] as const;

export type ESLanguage = typeof ES_LANGUAGES[number]['value'];

// ============================================================================
// REFRESH INTERVAL OPTIONS
// Common refresh interval values for Elasticsearch
// ============================================================================

export const REFRESH_INTERVALS = [
    { value: '1s', label: '1 second' },
    { value: '5s', label: '5 seconds' },
    { value: '10s', label: '10 seconds' },
    { value: '30s', label: '30 seconds' },
    { value: '1m', label: '1 minute' },
    { value: '5m', label: '5 minutes' },
    { value: '-1', label: 'Disabled (manual refresh only)' },
] as const;

export type RefreshInterval = typeof REFRESH_INTERVALS[number]['value'];

// ============================================================================
// DEFAULT ES INDEX SETTINGS
// ============================================================================

export const ES_INDEX_DEFAULTS = {
    numberOfShards: 1,
    numberOfReplicas: 0,
    refreshInterval: '1s',
} as const;
