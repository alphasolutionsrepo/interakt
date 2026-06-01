// src/features/search/providers/index.ts

/**
 * Search Providers - Public API
 */

// ============================================================================
// SEARCH PROVIDER INTERFACE (Search-time operations)
// ============================================================================

export {
    type SearchProvider,
    type ProviderStats,
    type SearchProviderFactory,
    type AutocompleteOptions,
    type AutocompleteResult,
    type AutocompleteHit,
    type DistinctValuesOptions,
    type DistinctValuesResult,
    type DistinctFieldValue,
    SearchProviderRegistry,
    providerRegistry,
} from './search-provider.interface';

// ============================================================================
// SEARCH ENGINE PROVIDER INTERFACE (Index/document lifecycle operations)
// ============================================================================

export {
    type SearchEngineProvider,
    type SearchProviderType,
    type IndexProvider,
    type DocumentProvider,
    type FieldMapper,
    type CreateIndexOptions,
    type IndexSettingsBuildContext,
    type IndexSettingsResult,
    type OperationResult,
    type IndexStats,
    type IndexMappingResult,
    type BulkDocument,
    type BulkIndexResult,
    type ScrollDocument,
    type FetchAllResult,
    type GetDocumentResult,
    type ProviderHealthStatus,
} from './search-engine-provider.interface';

// ============================================================================
// PROVIDER CAPABILITIES (Declarative feature descriptors)
// ============================================================================

export {
    type ProviderCapabilities,
    type ProviderSettingField,
} from './provider-capabilities';

// ============================================================================
// PROVIDER FACTORY (Config-driven instantiation)
// ============================================================================

export {
    getSearchEngineProvider,
    getDefaultSearchEngineProvider,
    getEnabledProviderTypes,
    isProviderEnabled,
    closeAllProviders,
    registerProviderClass,
} from './search-engine-provider.factory';

// ============================================================================
// ELASTICSEARCH PROVIDER IMPLEMENTATION
// ============================================================================

export {
    ElasticsearchSearchProvider,
    getElasticsearchSearchProvider,
} from './elasticsearch-search.provider';

export {
    ElasticsearchEngineProvider,
} from './elasticsearch/elasticsearch-engine.provider';

export {
    ElasticsearchFieldMapper,
} from './elasticsearch/elasticsearch-field-mapper';

// ============================================================================
// AZURE AI SEARCH PROVIDER IMPLEMENTATION
// ============================================================================

export {
    AzureEngineProvider,
} from './azure-ai-search/azure-engine.provider';

export {
    AzureSearchProvider,
} from './azure-ai-search/azure-search.provider';

export {
    AzureFieldMapper,
} from './azure-ai-search/azure-field-mapper';

// ============================================================================
// PROVIDER INITIALIZATION (Call at app startup)
// ============================================================================

export {
    initializeSearchProviders,
} from './init';
