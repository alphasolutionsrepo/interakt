// src/features/search/providers/elasticsearch/index.ts

/**
 * Elasticsearch Provider - Public API
 *
 * All Elasticsearch-specific code lives under this directory:
 * - Client (singleton ES client + low-level index/document operations)
 * - Search-time provider (SearchProvider interface)
 * - Infrastructure provider (SearchEngineProvider interface)
 * - Field mapper (FieldMapper interface)
 * - Query builders (ES Query DSL construction)
 * - Field mapping (app types → ES types)
 * - Constants (analyzers, languages, refresh intervals)
 */

// Client (singleton + low-level operations)
export {
    getElasticsearchClient,
    closeClient,
    checkHealth,
    type ESHealthStatus,
    indexExists,
    createIndex,
    deleteIndex,
    getIndexStats,
    getIndexMapping,
    type CreateIndexOptions,
    bulkIndex,
    type BulkIndexDocument,
    type BulkIndexResult,
    fetchAllDocuments,
    type ScrollDocument,
    getDocumentById,
    type GetDocumentResult,
    refreshIndex,
} from './elasticsearch.client';

// Search-time provider (implements SearchProvider)
export {
    ElasticsearchSearchProvider,
    getElasticsearchSearchProvider,
} from './elasticsearch-search.provider';

// Infrastructure provider (implements SearchEngineProvider)
export {
    ElasticsearchEngineProvider,
} from './elasticsearch-engine.provider';

// Field mapper
export {
    ElasticsearchFieldMapper,
} from './elasticsearch-field-mapper';

// Field mapping utility
export {
    mapFieldTypeToES,
} from './elasticsearch-field-mapping';

// ES-specific constants
export {
    AUTOCOMPLETE_ANALYZER_SETTINGS,
    ES_LANGUAGES,
    REFRESH_INTERVALS,
    ES_INDEX_DEFAULTS,
    PREDEFINED_ANALYZERS,
    PREDEFINED_ANALYZER_INFO,
    AUTOCOMPLETE_COMPATIBLE_FIELD_TYPES,
    isAutocompleteCompatibleFieldType,
    type ElasticsearchSettings,
    type ESLanguage,
    type RefreshInterval,
    type PredefinedAnalyzer,
} from './elasticsearch.constants';

// Query builders (ES Query DSL)
export {
    buildFilterQuery,
    buildSearchBody,
    buildLexicalSearchBody,
    buildSemanticSearchBody,
    type ESQuery,
    type ESBoolQuery,
    type ESRangeQuery,
    type ESSearchBody,
    type ESKnnQuery,
    type ESRankQuery,
} from './query-builders';
