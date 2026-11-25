// src/features/search/providers/azure-ai-search/azure-constants.ts

/**
 * Azure AI Search Constants
 *
 * Azure-specific field types, settings, and configurations.
 */

export { EMBEDDING_FIELD_NAME } from '@/shared/constants/embedding.constants';

/**
 * The characters an Azure AI Search document key may contain. Azure answers 400, not
 * 404, for a key with any other character, so such an id is never a document there.
 */
export const AZURE_DOCUMENT_KEY = /^[A-Za-z0-9_\-=]+$/;

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
 * Whether Azure can mark a field of this app field type as searchable.
 *
 * The app's own `isSearchable` flag is type-agnostic (it defaults to true for
 * every field), while Azure only accepts full-text operations — searchFields,
 * highlight — on string types. Anything building an Azure query from the app
 * flag must narrow with this predicate first, or Azure rejects the whole
 * request: "Field 'x' is not marked as 'searchable'".
 */
export function isAzureSearchableFieldType(fieldType: string): boolean {
    const edmType = FIELD_TYPE_TO_EDM[fieldType];
    return edmType !== undefined && SEARCHABLE_EDM_TYPES.has(edmType);
}

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
 * The Azure AI Search analyzer each index language runs on.
 *
 * Keys are the same language values Elasticsearch uses (see ES_LANGUAGES), so one
 * stored `language` means the same language on both engines. The value is the
 * Azure analyzer name: the Microsoft analyzer where Microsoft has one for that
 * exact language, otherwise the Lucene one.
 *
 * Names come from https://learn.microsoft.com/en-us/azure/search/index-add-language-analyzers
 * (checked 24 Nov 2026). The Portuguese names use the casing in the SDK's known analyzer names
 * (pt-BR, pt-PT), which differs from the docs table. Left out on purpose: `cjk` (no single Azure equivalent),
 * `serbian` (Azure has separate Latin and Cyrillic analyzers and the index language
 * does not say which) and `sorani`. A language missing from this table gets no
 * analyzer, which is Azure's default (standard.lucene).
 *
 * This is the one table to edit if a language should move to a different analyzer.
 */
export const AZURE_LANGUAGE_ANALYZERS: Readonly<Record<string, string>> = {
    arabic: 'ar.microsoft',
    armenian: 'hy.lucene',
    basque: 'eu.lucene',
    bengali: 'bn.microsoft',
    brazilian: 'pt-BR.microsoft',
    bulgarian: 'bg.microsoft',
    catalan: 'ca.microsoft',
    chinese: 'zh-Hans.microsoft',
    czech: 'cs.microsoft',
    danish: 'da.microsoft',
    dutch: 'nl.microsoft',
    english: 'en.microsoft',
    estonian: 'et.microsoft',
    finnish: 'fi.microsoft',
    french: 'fr.microsoft',
    galician: 'gl.lucene',
    german: 'de.microsoft',
    greek: 'el.microsoft',
    hindi: 'hi.microsoft',
    hungarian: 'hu.microsoft',
    indonesian: 'id.microsoft',
    irish: 'ga.lucene',
    italian: 'it.microsoft',
    japanese: 'ja.microsoft',
    korean: 'ko.microsoft',
    latvian: 'lv.microsoft',
    lithuanian: 'lt.microsoft',
    norwegian: 'nb.microsoft',
    persian: 'fa.lucene',
    polish: 'pl.microsoft',
    portuguese: 'pt-PT.microsoft',
    romanian: 'ro.microsoft',
    russian: 'ru.microsoft',
    spanish: 'es.microsoft',
    swedish: 'sv.microsoft',
    thai: 'th.microsoft',
    turkish: 'tr.microsoft',
    standard: 'standard.lucene',
};

/**
 * The Azure analyzer for an index language, or undefined when Azure has none for it.
 */
export function getAzureLanguageAnalyzer(language: string | null | undefined): string | undefined {
    if (!language || !Object.hasOwn(AZURE_LANGUAGE_ANALYZERS, language)) return undefined;
    return AZURE_LANGUAGE_ANALYZERS[language];
}

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
