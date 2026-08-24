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
// VECTOR FIELD
// ============================================================================

/**
 * Field the document embedding is stored in.
 *
 * Mirrors EMBEDDING_FIELD_NAME in the document-indexing feature, which owns the
 * write side. Duplicated deliberately: the provider layer must not depend on a
 * feature module (document-indexer.service.ts already imports from here, so an
 * import back would be circular).
 *
 * Reads that feed a UI exclude this field — a dense_vector is thousands of
 * floats and useless to display.
 */
export const EMBEDDING_FIELD_NAME = 'content_embedding';

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
// LANGUAGE TEXT ANALYSIS
// Maps each ES_LANGUAGES value to the ES analysis primitives it can use.
// ============================================================================

/**
 * Names of the analyzer pair built from the index's language + stop words.
 *
 * `interakt_text` is the index-time analyzer, `interakt_text_search` the
 * search-time one. They share the same tokenizer and the same stop/stemmer
 * filters; the search analyzer additionally expands synonyms. Keeping the two
 * chains symmetric is what makes a stemmed index searchable — an unstemmed
 * search analyzer over a stemmed index matches nothing.
 *
 * Exported so the field mapper and the settings builder cannot drift apart.
 */
export const INTERAKT_TEXT_ANALYZER = 'interakt_text';
export const INTERAKT_TEXT_SEARCH_ANALYZER = 'interakt_text_search';

/** Filter names used inside the analyzer pair. */
export const INTERAKT_STOP_FILTER = 'interakt_stop';
export const INTERAKT_STEMMER_FILTER = 'interakt_stemmer';
export const INTERAKT_SYNONYM_FILTER = 'interakt_synonyms';

/**
 * ES analysis primitives available per language.
 *
 * - `stopwords` — a predefined stop word list reference (`_english_`, ...).
 * - `stemmer` — a `language` value accepted by the `stemmer` token filter.
 *
 * A key is omitted when core Elasticsearch has no such option for the language.
 * That matters: an invalid `stemmer.language` or an unknown `_lang_` stop word
 * reference makes `indices.create` fail outright, so guessing is worse than
 * leaving the filter out. Languages absent from this map fall back to `{}`,
 * i.e. lowercase-only analysis — the behaviour before this map existed.
 */
export const ES_LANGUAGE_ANALYSIS: Record<string, { stopwords?: string; stemmer?: string }> = {
    arabic: { stopwords: '_arabic_', stemmer: 'arabic' },
    armenian: { stopwords: '_armenian_', stemmer: 'armenian' },
    basque: { stopwords: '_basque_', stemmer: 'basque' },
    bengali: { stopwords: '_bengali_', stemmer: 'bengali' },
    brazilian: { stopwords: '_brazilian_', stemmer: 'brazilian' },
    bulgarian: { stopwords: '_bulgarian_', stemmer: 'bulgarian' },
    catalan: { stopwords: '_catalan_', stemmer: 'catalan' },
    czech: { stopwords: '_czech_', stemmer: 'czech' },
    danish: { stopwords: '_danish_', stemmer: 'danish' },
    dutch: { stopwords: '_dutch_', stemmer: 'dutch' },
    english: { stopwords: '_english_', stemmer: 'english' },
    estonian: { stopwords: '_estonian_', stemmer: 'estonian' },
    finnish: { stopwords: '_finnish_', stemmer: 'finnish' },
    french: { stopwords: '_french_', stemmer: 'french' },
    galician: { stopwords: '_galician_', stemmer: 'galician' },
    german: { stopwords: '_german_', stemmer: 'german' },
    greek: { stopwords: '_greek_', stemmer: 'greek' },
    hindi: { stopwords: '_hindi_', stemmer: 'hindi' },
    hungarian: { stopwords: '_hungarian_', stemmer: 'hungarian' },
    indonesian: { stopwords: '_indonesian_', stemmer: 'indonesian' },
    irish: { stopwords: '_irish_', stemmer: 'irish' },
    italian: { stopwords: '_italian_', stemmer: 'italian' },
    latvian: { stopwords: '_latvian_', stemmer: 'latvian' },
    lithuanian: { stopwords: '_lithuanian_', stemmer: 'lithuanian' },
    norwegian: { stopwords: '_norwegian_', stemmer: 'norwegian' },
    portuguese: { stopwords: '_portuguese_', stemmer: 'portuguese' },
    romanian: { stopwords: '_romanian_', stemmer: 'romanian' },
    russian: { stopwords: '_russian_', stemmer: 'russian' },
    sorani: { stopwords: '_sorani_', stemmer: 'sorani' },
    spanish: { stopwords: '_spanish_', stemmer: 'spanish' },
    swedish: { stopwords: '_swedish_', stemmer: 'swedish' },
    turkish: { stopwords: '_turkish_', stemmer: 'turkish' },

    // Stop words only — core ES ships no stemmer for these.
    cjk: { stopwords: '_cjk_' },
    persian: { stopwords: '_persian_' },
    serbian: { stopwords: '_serbian_' },
    thai: { stopwords: '_thai_' },

    // Chinese/Japanese/Korean have no dedicated core analysis; the CJK stop word
    // list is the closest core equivalent. Proper support needs a plugin
    // (analysis-smartcn, analysis-kuromoji, analysis-nori).
    chinese: { stopwords: '_cjk_' },
    japanese: { stopwords: '_cjk_' },
    korean: { stopwords: '_cjk_' },

    // Polish needs the analysis-stempel plugin — nothing in core to reference.
    polish: {},

    // Explicitly "no language-specific processing".
    standard: {},
};

/**
 * Look up the analysis primitives for a language, tolerating unknown values.
 */
export function getLanguageAnalysis(language?: string | null): { stopwords?: string; stemmer?: string } {
    if (!language) return ES_LANGUAGE_ANALYSIS.english;
    return ES_LANGUAGE_ANALYSIS[language] ?? {};
}

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
