// src/features/search/search.types.ts

/**
 * Search Feature - Type Definitions
 *
 * Core types for the search service, providers, and API.
 */

import type { SearchType, VectorSimilarity } from '@/shared/constants/search-index.constants';

// ============================================================================
// SEARCH REQUEST TYPES
// ============================================================================

/**
 * Main search request from API
 */
export interface SearchRequest {
    /** Search query string */
    query: string;

    /** Override search type (defaults to index's configured type) */
    searchType?: SearchType | 'auto';

    /** Filters to apply */
    filters?: FilterClause[];

    /** Facets to compute */
    facets?: FacetRequest[];

    /** Pagination */
    page?: number;
    pageSize?: number;

    /** Sorting */
    sort?: SortClause[];

    /** Fields to include in response (defaults to includeInResponse fields) */
    includeFields?: string[];

    /** Fields to exclude from response */
    excludeFields?: string[];

    /** Highlight configuration */
    highlight?: HighlightConfig;

    /** Minimum score threshold (0-1 for normalized, or raw ES score) */
    minScore?: number;

    /** Enable query explanation (for debugging) */
    explain?: boolean;
}

/**
 * Filter clause for search queries
 */
export interface FilterClause {
    /** Field name to filter on */
    field: string;

    /** Filter operator */
    operator: FilterOperator;

    /** Value(s) for the filter */
    value?: FilterValue;

    /** Nested filters for bool combinations */
    filters?: FilterClause[];
}

export type FilterOperator =
    | 'eq'        // Equals
    | 'neq'       // Not equals
    | 'gt'        // Greater than
    | 'gte'       // Greater than or equal
    | 'lt'        // Less than
    | 'lte'       // Less than or equal
    | 'in'        // In array
    | 'nin'       // Not in array
    | 'contains'  // Text contains (for text fields)
    | 'prefix'    // Starts with
    | 'exists'    // Field exists
    | 'missing'   // Field is missing/null
    | 'range'     // Range (uses value as { from?, to? })
    | 'and'       // Boolean AND (uses nested filters)
    | 'or'        // Boolean OR (uses nested filters)
    | 'not';      // Boolean NOT (uses nested filters)

export type FilterValue = string | number | boolean | null | string[] | number[] | RangeValue;

export interface RangeValue {
    from?: number | string;
    to?: number | string;
    includeLower?: boolean;
    includeUpper?: boolean;
}

/**
 * Facet request configuration
 */
export interface FacetRequest {
    /** Field name for facet */
    field: string;

    /** Facet type */
    type: FacetType;

    /** Maximum number of buckets (for terms) */
    size?: number;

    /** Range configuration (for range/date_histogram) */
    ranges?: FacetRange[];

    /** Interval for histograms */
    interval?: string | number;

    /** Include count of docs with missing values */
    includeMissing?: boolean;

    /** Minimum document count for bucket */
    minDocCount?: number;

    /** Sort order for buckets */
    orderBy?: 'count' | 'value';
    orderDirection?: 'asc' | 'desc';
}

export type FacetType =
    | 'terms'          // Keyword/category facets
    | 'range'          // Numeric ranges
    | 'date_range'     // Date ranges
    | 'date_histogram' // Date histogram
    | 'histogram';     // Numeric histogram

export interface FacetRange {
    key?: string;
    from?: number | string;
    to?: number | string;
}

/**
 * Sort clause
 */
export interface SortClause {
    field: string;
    direction: 'asc' | 'desc';
    missing?: '_first' | '_last';
}

/**
 * Highlight configuration
 */
export interface HighlightConfig {
    /** Fields to highlight (empty = all searchable) */
    fields?: string[];

    /** Pre-tag for highlights */
    preTag?: string;

    /** Post-tag for highlights */
    postTag?: string;

    /** Fragment size */
    fragmentSize?: number;

    /** Number of fragments */
    numberOfFragments?: number;
}

// ============================================================================
// SEARCH RESPONSE TYPES
// ============================================================================

/**
 * Main search response
 */
export interface SearchResponse {
    /** Search hits */
    hits: SearchHit[];

    /** Total count */
    total: TotalHits;

    /** Facet results */
    facets?: FacetResult[];

    /** Query execution time in ms */
    took: number;

    /** Maximum score */
    maxScore?: number;

    /** Pagination info */
    pagination: PaginationInfo;

    /** Query explanation (if requested) */
    explanation?: QueryExplanation;
}

/**
 * Individual search hit
 */
export interface SearchHit {
    /** Document ID */
    id: string;

    /** Relevance score */
    score: number;

    /** Document source fields */
    source: Record<string, unknown>;

    /** Highlighted fields */
    highlights?: Record<string, string[]>;

    /** Score explanation (if requested) */
    explanation?: string;
}

/**
 * Total hits information
 */
export interface TotalHits {
    value: number;
    relation: 'eq' | 'gte';
}

/**
 * Pagination information
 */
export interface PaginationInfo {
    page: number;
    pageSize: number;
    totalPages: number;
    totalItems: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
}

/**
 * Facet result
 */
export interface FacetResult {
    /** Field name */
    field: string;

    /** Human-readable label sourced from the index field's `displayName`. Optional — clients should fall back to humanizing `field` when absent. */
    label?: string;

    /** Facet type */
    type: FacetType;

    /** Buckets/values */
    buckets: FacetBucket[];

    /** Count of documents with missing value */
    missingCount?: number;
}

/**
 * Individual facet bucket
 */
export interface FacetBucket {
    /** Bucket key/value */
    key: string | number;

    /** Display label */
    label?: string;

    /** Document count in bucket */
    count: number;

    /** From value (for ranges) */
    from?: number | string;

    /** To value (for ranges) */
    to?: number | string;
}

/**
 * Query explanation for debugging
 */
export interface QueryExplanation {
    /** Original query */
    originalQuery: string;

    /** Effective search type used */
    searchType: SearchType;

    /** Fields searched */
    searchedFields: string[];

    /** Filters applied */
    appliedFilters: string[];

    /** Provider-specific query (sanitized, for debugging) */
    providerQuery?: Record<string, unknown>;
}

// ============================================================================
// SEARCH CONTEXT (Internal - passed to providers)
// ============================================================================

/**
 * Search context built from SearchIndexComplete
 * Contains all configuration needed for search execution
 */
export interface SearchContext {
    /** Search provider index name */
    indexName: string;

    /** Search index ID (for reference) */
    indexId: string;

    /** Search provider type (e.g., 'elasticsearch', 'azure-ai-search') */
    searchProvider: string;

    /** Configured search type */
    searchType: SearchType;

    /** Searchable fields with boost values */
    searchableFields: SearchableFieldConfig[];

    /** Facetable fields */
    facetableFields: FacetableFieldConfig[];

    /** Fields to include in response by default */
    defaultResponseFields: string[];

    /** All indexed fields (for validation) */
    allFields: Map<string, FieldConfig>;

    /** Text analysis language */
    language: string;

    /** AI/Embedding configuration (for semantic/hybrid) */
    embedding?: EmbeddingConfig;

    /** Hybrid search RRF configuration */
    rrf?: RRFConfig;
}

/**
 * Searchable field configuration
 */
export interface SearchableFieldConfig {
    fieldName: string;
    fieldType: string;
    boostValue: number;
    analyzer?: string;
}

/**
 * Facetable field configuration
 */
export interface FacetableFieldConfig {
    fieldName: string;
    fieldType: string;
    displayName?: string;
}

/**
 * Generic field configuration
 */
export interface FieldConfig {
    fieldName: string;
    fieldType: string;
    isSearchable: boolean;
    isFacetable: boolean;
    isIndexed: boolean;
    includeInResponse: boolean;
    boostValue: number;
}

/**
 * Embedding configuration for semantic search
 */
export interface EmbeddingConfig {
    dimensions: number;
    similarity: VectorSimilarity;
    fieldName: string; // Usually 'content_embedding'
}

/**
 * RRF configuration for hybrid search
 */
export interface RRFConfig {
    /** Rank constant (k) - higher values reduce impact of high-ranked docs */
    rankConstant: number;
    /** Window size - how many results to consider from each source */
    windowSize: number;
    /** Weight for lexical results (0.1-3.0, default 1.0) */
    lexicalWeight?: number;
    /** Weight for semantic results (0.1-3.0, default 1.0) */
    semanticWeight?: number;
}

// ============================================================================
// PROVIDER TYPES
// ============================================================================

/**
 * Hybrid config override for provider (from Search Experience)
 */
export interface HybridConfigOverride {
    /** Weight for lexical results (0.1-3.0, default 1.0) */
    lexicalWeight?: number;
    /** Weight for semantic results (0.1-3.0, default 1.0) */
    semanticWeight?: number;
    /** RRF rank constant (k) - override index-level setting */
    rrfRankConstant?: number;
    /** Window size - override index-level setting */
    rrfWindowSize?: number;
}

/**
 * Provider search request (internal)
 */
export interface ProviderSearchRequest {
    /** Search context with index configuration */
    context: SearchContext;

    /** Original search request */
    request: SearchRequest;

    /** Resolved search type to use */
    searchType: SearchType;

    /** Query embedding (for semantic/hybrid) */
    queryEmbedding?: number[];

    /** Hybrid config override from Search Experience */
    hybridConfigOverride?: HybridConfigOverride;

    /** Search timeout in milliseconds */
    timeoutMs?: number;
}

/**
 * Provider search response (internal)
 */
export interface ProviderSearchResponse {
    /** Raw hits from provider */
    hits: ProviderHit[];

    /** Total count */
    total: TotalHits;

    /** Raw aggregation results */
    aggregations?: Record<string, unknown>;

    /** Execution time in ms */
    took: number;

    /** Max score */
    maxScore?: number;
}

/**
 * Raw hit from provider
 */
export interface ProviderHit {
    id: string;
    score: number;
    source: Record<string, unknown>;
    highlight?: Record<string, string[]>;
    explanation?: unknown;
}

// ============================================================================
// ERROR TYPES
// ============================================================================

/**
 * Search error with details
 */
export class SearchError extends Error {
    constructor(
        message: string,
        public code: SearchErrorCode,
        public details?: Record<string, unknown>
    ) {
        super(message);
        this.name = 'SearchError';
    }
}

export type SearchErrorCode =
    | 'INDEX_NOT_FOUND'
    | 'INDEX_NOT_READY'
    | 'INVALID_QUERY'
    | 'INVALID_FILTER'
    | 'INVALID_FACET'
    | 'INVALID_SORT'
    | 'FIELD_NOT_FOUND'
    | 'FIELD_NOT_SEARCHABLE'
    | 'FIELD_NOT_FACETABLE'
    | 'EMBEDDING_FAILED'
    | 'PROVIDER_ERROR'
    | 'TIMEOUT';

// ============================================================================
// UTILITY TYPES
// ============================================================================

/**
 * Search by ID or name options
 */
export interface SearchIndexIdentifier {
    id?: string;
    name?: string;
}

/**
 * Default search configuration
 */
export const SEARCH_DEFAULTS = {
    pageSize: 20,
    maxPageSize: 100,
    // Upper bound for a facet's `size`. Kept at the public API ceiling (100) so
    // internal callers that enumerate distinct values for a field — e.g. the
    // chat pipeline's parameter enrichment, which needs the full filter
    // vocabulary — aren't truncated below the number of distinct values a
    // high-cardinality field (like subCategory) can have.
    maxFacetSize: 100,
    defaultHighlightPreTag: '<em>',
    defaultHighlightPostTag: '</em>',
    defaultFragmentSize: 150,
    defaultNumberOfFragments: 3,
} as const;
