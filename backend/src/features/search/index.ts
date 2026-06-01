// src/features/search/index.ts

/**
 * Search Feature - Public API
 *
 * Provides search capabilities for indexed documents.
 * Supports lexical, semantic, and hybrid search modes.
 *
 * @example
 * import { search, searchById, searchByName } from '@/features/search';
 *
 * // Search by index ID
 * const results = await searchById('uuid-here', {
 *   query: 'search query',
 *   filters: [{ field: 'category', operator: 'eq', value: 'electronics' }],
 *   facets: [{ field: 'brand', type: 'terms', size: 10 }],
 *   page: 1,
 *   pageSize: 20,
 * });
 *
 * // Search by index name
 * const results = await searchByName('products', {
 *   query: 'laptop',
 *   searchType: 'hybrid',
 * });
 */

// ============================================================================
// SERVICE EXPORTS
// ============================================================================

export {
    // Main search functions
    search,
    searchById,
    searchByName,

    // Context and health
    getSearchContext,
    checkHealth,

    // Validation helpers
    validateFilters,
    validateFacets,
    validateSort,
} from './search.service';

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type {
    // Request types
    SearchRequest,
    FilterClause,
    FilterOperator,
    FilterValue,
    RangeValue,
    FacetRequest,
    FacetType,
    FacetRange,
    SortClause,
    HighlightConfig,

    // Response types
    SearchResponse,
    SearchHit,
    TotalHits,
    PaginationInfo,
    FacetResult,
    FacetBucket,
    QueryExplanation,

    // Context types
    SearchContext,
    SearchableFieldConfig,
    FacetableFieldConfig,
    FieldConfig,
    EmbeddingConfig,
    RRFConfig,

    // Provider types
    ProviderSearchRequest,
    ProviderSearchResponse,
    ProviderHit,

    // Identifier types
    SearchIndexIdentifier,

    // Error types
    SearchErrorCode,
} from './search.types';

export { SearchError, SEARCH_DEFAULTS } from './search.types';

// ============================================================================
// VALIDATION EXPORTS
// ============================================================================

export {
    // Schemas
    searchRequestSchema,
    filterClauseSchema,
    facetRequestSchema,
    sortClauseSchema,
    highlightConfigSchema,
    searchHitSchema,
    searchResponseSchema,

    // DTO types
    type SearchRequestDTO,
    type SearchResponseDTO,

    // Validation functions
    validateSearchRequest,
    safeParseSearchRequest,
} from './search.validation';

// ============================================================================
// CONTEXT BUILDER EXPORTS
// ============================================================================

export {
    buildSearchContext,
    validateSearchableField,
    validateFacetableField,
    validateFilterableField,
    validateSortableField,
    getVectorSourceFields,
    supportsSemanticSearch,
    supportsHybridSearch,
} from './search-context.builder';

// ============================================================================
// PROVIDER EXPORTS
// ============================================================================

export {
    // Provider interface
    type SearchProvider,
    type ProviderStats,
    type SearchProviderFactory,
    SearchProviderRegistry,
    providerRegistry,

    // Elasticsearch provider
    ElasticsearchSearchProvider,
    getElasticsearchSearchProvider,
} from './providers';

// ============================================================================
// BUILDER EXPORTS (for advanced use)
// ============================================================================

export {
    buildFilterQuery,
    buildSearchBody,
    buildLexicalSearchBody,
    buildSemanticSearchBody,
    type ESQuery,
    type ESBoolQuery,
    type ESSearchBody,
    type ESKnnQuery,
} from './builders';

// ============================================================================
// HYBRID FUSION EXPORTS (for custom hybrid search)
// ============================================================================

export {
    fuseSearchResults,
    calculateRRFScore,
    createRRFConfig,
    DEFAULT_RRF_CONFIG,
    type RRFConfig as HybridRRFConfig,
    type HybridSearchResult,
    type FusionInput,
} from './hybrid-fusion';

// ============================================================================
// NORMALIZER EXPORTS (for advanced use)
// ============================================================================

export {
    normalizeSearchResponse,
    normalizeScores,
    calculateScoreStats,
} from './response.normalizer';

// ============================================================================
// API HANDLER EXPORTS
// ============================================================================

export {
    handleSearchById,
    handleSearchByName,
    handleGetSearchContextById,
    handleGetSearchContextByName,
    handleHealthCheck,
} from './search.api.handlers';
