// src/features/search/providers/azure-ai-search/azure-constants.ts

/**
 * Azure AI Search Constants
 *
 * Azure-specific field types, settings, and configurations.
 */

/**
 * Mapping from app field types to Azure Edm types.
 */
export const FIELD_TYPE_TO_EDM: Record<string, string> = {
    text: 'Edm.String',
    html: 'Edm.String',
    markdown: 'Edm.String',
    richtext: 'Edm.String',
    keyword: 'Edm.String',
    number: 'Edm.Double',
    integer: 'Edm.Int32',
    long: 'Edm.Int64',
    float: 'Edm.Double',
    double: 'Edm.Double',
    boolean: 'Edm.Boolean',
    date: 'Edm.DateTimeOffset',
    datetime: 'Edm.DateTimeOffset',
    image_url: 'Edm.String',
    url: 'Edm.String',
    email: 'Edm.String',
    geo_point: 'Edm.GeographyPoint',
    json: 'Edm.String',
    object: 'Edm.ComplexType',
    nested: 'Edm.ComplexType',
    array: 'Collection(Edm.String)',
};

/**
 * Text-like field types that should be searchable in Azure.
 */
export const SEARCHABLE_EDM_TYPES = new Set([
    'Edm.String',
    'Collection(Edm.String)',
]);

/**
 * Field types that should default to sortable in Azure.
 * Numeric, date, and boolean types are naturally sortable.
 * Text/string types are excluded (sorting on analyzed text is rarely useful).
 */
export const SORTABLE_EDM_TYPES = new Set([
    'Edm.Int32',
    'Edm.Int64',
    'Edm.Double',
    'Edm.Boolean',
    'Edm.DateTimeOffset',
]);

/**
 * Field types that support filtering in Azure.
 */
export const FILTERABLE_EDM_TYPES = new Set([
    'Edm.String',
    'Edm.Int32',
    'Edm.Int64',
    'Edm.Double',
    'Edm.Boolean',
    'Edm.DateTimeOffset',
    'Edm.GeographyPoint',
    'Collection(Edm.String)',
]);

/**
 * Languages supported by Azure AI Search analyzers.
 */
export const AZURE_LANGUAGES = [
    { value: 'en.microsoft', label: 'English (Microsoft)' },
    { value: 'en.lucene', label: 'English (Lucene)' },
    { value: 'es.microsoft', label: 'Spanish (Microsoft)' },
    { value: 'fr.microsoft', label: 'French (Microsoft)' },
    { value: 'de.microsoft', label: 'German (Microsoft)' },
    { value: 'it.microsoft', label: 'Italian (Microsoft)' },
    { value: 'pt-Br.microsoft', label: 'Portuguese (Microsoft)' },
    { value: 'nl.microsoft', label: 'Dutch (Microsoft)' },
    { value: 'ru.microsoft', label: 'Russian (Microsoft)' },
    { value: 'zh-Hans.microsoft', label: 'Chinese Simplified (Microsoft)' },
    { value: 'ja.microsoft', label: 'Japanese (Microsoft)' },
    { value: 'ko.microsoft', label: 'Korean (Microsoft)' },
    { value: 'ar.microsoft', label: 'Arabic (Microsoft)' },
    { value: 'standard.lucene', label: 'Standard (Lucene)' },
];

/**
 * Default Azure index settings.
 */
export const AZURE_INDEX_DEFAULTS = {
    vectorSearchAlgorithm: 'hnsw' as const,
    hnswM: 4,
    hnswEfConstruction: 400,
    hnswEfSearch: 500,
    semanticConfigName: 'default-semantic-config',
};

/**
 * Azure API version.
 */
export const DEFAULT_API_VERSION = '2024-07-01';
