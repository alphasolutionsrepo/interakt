// src/features/search/providers/elasticsearch/query-builders/query.builder.ts

/**
 * Elasticsearch Search Query Builders
 *
 * Builds Elasticsearch query DSL for different search types:
 * - Lexical: multi_match with boosting
 * - Semantic: kNN vector search
 * - Hybrid: RRF combination of lexical + semantic
 *
 * This is ES-specific — other providers will have their own query builders
 * (e.g., Azure AI Search uses a different query format with vectorQueries).
 */

import type { SearchType } from '@/shared/constants/search-index.constants';
import type {
    SearchContext,
    SearchRequest,
    SearchableFieldConfig,
    SortClause,
    HighlightConfig,
    FacetRequest,
} from '../../../search.types';
import { SEARCH_DEFAULTS } from '../../../search.types';
import type { ESQuery } from './filter.builder';
import { buildFilterQuery } from './filter.builder';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Complete Elasticsearch search request body
 */
export interface ESSearchBody {
    query?: ESQuery;
    knn?: ESKnnQuery;
    rank?: ESRankQuery;
    from?: number;
    size?: number;
    sort?: ESSortClause[];
    _source?: ESSourceConfig;
    highlight?: ESHighlightConfig;
    aggs?: Record<string, ESAggregation>;
    explain?: boolean;
    min_score?: number;
}

export interface ESKnnQuery {
    field: string;
    query_vector: number[];
    k: number;
    num_candidates: number;
    filter?: ESQuery;
}

export interface ESRankQuery {
    rrf: {
        window_size: number;
        rank_constant: number;
    };
}

export type ESSortClause = Record<string, ESSortOptions> | '_score' | string;

export interface ESSortOptions {
    order: 'asc' | 'desc';
    missing?: '_first' | '_last';
}

export interface ESSourceConfig {
    includes?: string[];
    excludes?: string[];
}

export interface ESHighlightConfig {
    fields: Record<string, ESHighlightFieldConfig>;
    pre_tags?: string[];
    post_tags?: string[];
    fragment_size?: number;
    number_of_fragments?: number;
}

export interface ESHighlightFieldConfig {
    fragment_size?: number;
    number_of_fragments?: number;
}

export interface ESAggregation {
    terms?: ESTermsAggregation;
    range?: ESRangeAggregation;
    date_range?: ESDateRangeAggregation;
    date_histogram?: ESDateHistogramAggregation;
    histogram?: ESHistogramAggregation;
}

export interface ESTermsAggregation {
    field: string;
    size?: number;
    min_doc_count?: number;
    order?: Record<string, 'asc' | 'desc'>;
    missing?: string;
}

export interface ESRangeAggregation {
    field: string;
    ranges: Array<{ key?: string; from?: number; to?: number }>;
}

export interface ESDateRangeAggregation {
    field: string;
    ranges: Array<{ key?: string; from?: string; to?: string }>;
}

export interface ESDateHistogramAggregation {
    field: string;
    calendar_interval?: string;
    fixed_interval?: string;
    min_doc_count?: number;
}

export interface ESHistogramAggregation {
    field: string;
    interval: number;
    min_doc_count?: number;
}

// ============================================================================
// MAIN QUERY BUILDER
// ============================================================================

/**
 * Build complete Elasticsearch search request body
 */
export function buildSearchBody(
    request: SearchRequest,
    context: SearchContext,
    searchType: SearchType,
    queryEmbedding?: number[]
): ESSearchBody {
    const body: ESSearchBody = {};

    // Build filter query first (used by all search types)
    const filterQuery = request.filters
        ? buildFilterQuery(request.filters, context)
        : undefined;

    // Build main query based on search type
    switch (searchType) {
        case 'lexical':
            body.query = buildLexicalQuery(request.query, context, filterQuery);
            break;

        case 'semantic':
            if (!queryEmbedding || !context.embedding) {
                throw new Error('Semantic search requires embedding configuration and query vector');
            }
            body.knn = buildSemanticQuery(queryEmbedding, context, filterQuery, request.pageSize);
            break;

        case 'hybrid':
            if (!queryEmbedding || !context.embedding || !context.rrf) {
                throw new Error('Hybrid search requires embedding and RRF configuration');
            }
            body.query = buildLexicalQuery(request.query, context, filterQuery);
            body.knn = buildSemanticQuery(queryEmbedding, context, filterQuery, request.pageSize);
            body.rank = buildRRFRank(context);
            break;
    }

    // Pagination
    const page = request.page || 1;
    const pageSize = request.pageSize || SEARCH_DEFAULTS.pageSize;
    body.from = (page - 1) * pageSize;
    body.size = pageSize;

    // Sorting
    if (request.sort && request.sort.length > 0) {
        body.sort = buildSortClauses(request.sort);
    }

    // Source filtering
    body._source = buildSourceConfig(request, context);

    // Highlighting
    if (request.highlight) {
        body.highlight = buildHighlightConfig(request.highlight, context);
    }

    // Facets/Aggregations
    if (request.facets && request.facets.length > 0) {
        body.aggs = buildAggregations(request.facets, context);
    }

    // Debug explain
    if (request.explain) {
        body.explain = true;
    }

    // Minimum score threshold
    if (request.minScore !== undefined) {
        body.min_score = request.minScore;
    }

    return body;
}

// ============================================================================
// LEXICAL QUERY BUILDER
// ============================================================================

/**
 * Build lexical (text-based) search query
 */
function buildLexicalQuery(
    queryText: string,
    context: SearchContext,
    filterQuery?: ESQuery
): ESQuery {
    // Match-all sentinel: empty query or "*" means "every document" (e.g. facet
    // enumeration, or filter-only browsing). Azure AI Search treats `*` as
    // match-all natively; Elasticsearch does not (a multi_match for "*" looks for
    // the literal token and matches nothing), so normalize it here to keep
    // match-all behavior consistent across providers.
    const trimmed = (queryText ?? '').trim();
    const mainQuery: ESQuery =
        trimmed === '' || trimmed === '*'
            ? ({ match_all: {} } as unknown as ESQuery)
            : buildMultiMatchQuery(queryText, context.searchableFields);

    // Combine with filter if present
    if (filterQuery) {
        return {
            bool: {
                must: [mainQuery],
                filter: [filterQuery],
            },
        };
    }

    return mainQuery;
}

/**
 * Build multi_match query with boosted fields
 */
function buildMultiMatchQuery(
    queryText: string,
    searchableFields: SearchableFieldConfig[]
): ESQuery {
    // Build fields array with boost values
    const fields = searchableFields.map(field => {
        if (field.boostValue !== 1.0) {
            return `${field.fieldName}^${field.boostValue}`;
        }
        return field.fieldName;
    });

    // Filter to only text fields for phrase_prefix (keyword fields don't support it)
    const textFields = searchableFields
        .filter(field => field.fieldType === 'text')
        .map(field => {
            if (field.boostValue !== 1.0) {
                return `${field.fieldName}^${field.boostValue}`;
            }
            return field.fieldName;
        });

    const shouldClauses: ESQuery[] = [
        // Best fields for exact/phrase matches (works on all field types)
        {
            multi_match: {
                query: queryText,
                fields: fields,
                type: 'best_fields',
                tie_breaker: 0.3,
            },
        } as unknown as ESQuery,
        // Cross fields for distributed matches (works on all field types)
        {
            multi_match: {
                query: queryText,
                fields: fields,
                type: 'cross_fields',
                operator: 'and',
            },
        } as unknown as ESQuery,
    ];

    // Only add phrase_prefix if there are text fields (phrase_prefix only works on text fields)
    if (textFields.length > 0) {
        shouldClauses.push({
            multi_match: {
                query: queryText,
                fields: textFields,
                type: 'phrase_prefix',
            },
        } as unknown as ESQuery);
    }

    return {
        bool: {
            should: shouldClauses,
            minimum_should_match: 1,
        },
    };
}

// ============================================================================
// SEMANTIC QUERY BUILDER
// ============================================================================

/**
 * Build semantic (vector) search query
 */
function buildSemanticQuery(
    queryEmbedding: number[],
    context: SearchContext,
    filterQuery?: ESQuery,
    pageSize?: number
): ESKnnQuery {
    if (!context.embedding) {
        throw new Error('Semantic search requires embedding configuration');
    }

    const k = pageSize || SEARCH_DEFAULTS.pageSize;
    const numCandidates = Math.max(k * 2, 100); // Ensure enough candidates

    const knn: ESKnnQuery = {
        field: context.embedding.fieldName,
        query_vector: queryEmbedding,
        k: k,
        num_candidates: numCandidates,
    };

    if (filterQuery) {
        knn.filter = filterQuery;
    }

    return knn;
}

// ============================================================================
// HYBRID QUERY BUILDER (for ES native RRF - requires Platinum license)
// ============================================================================

/**
 * Build RRF rank configuration for hybrid search
 * Note: ES native RRF requires Platinum/Enterprise license
 * For basic license, use executeCustomHybridSearch in the provider instead
 */
function buildRRFRank(context: SearchContext): ESRankQuery {
    if (!context.rrf) {
        throw new Error('Hybrid search requires RRF configuration');
    }

    return {
        rrf: {
            window_size: context.rrf.windowSize,
            rank_constant: context.rrf.rankConstant,
        },
    };
}

// ============================================================================
// STANDALONE QUERY BUILDERS (for custom hybrid search)
// ============================================================================

/**
 * Build standalone lexical search body (without knn or rank)
 * Used for custom hybrid search implementation that runs queries separately
 */
export function buildLexicalSearchBody(
    request: SearchRequest,
    context: SearchContext
): ESSearchBody {
    const body: ESSearchBody = {};

    // Build filter query first
    const filterQuery = request.filters
        ? buildFilterQuery(request.filters, context)
        : undefined;

    // Build lexical query
    body.query = buildLexicalQuery(request.query, context, filterQuery);

    // Pagination - for hybrid, fetch more to allow for fusion
    const windowSize = context.rrf?.windowSize || 100;
    body.from = 0;
    body.size = windowSize;

    // Source filtering
    body._source = buildSourceConfig(request, context);

    // Highlighting - lexical query supports highlighting
    if (request.highlight) {
        body.highlight = buildHighlightConfig(request.highlight, context);
    }

    // Facets/Aggregations - only on lexical query (more accurate counts)
    if (request.facets && request.facets.length > 0) {
        body.aggs = buildAggregations(request.facets, context);
    }

    return body;
}

/**
 * Build standalone semantic search body (knn only)
 * Used for custom hybrid search implementation that runs queries separately
 */
export function buildSemanticSearchBody(
    request: SearchRequest,
    context: SearchContext,
    queryEmbedding: number[]
): ESSearchBody {
    if (!context.embedding) {
        throw new Error('Semantic search requires embedding configuration');
    }

    const body: ESSearchBody = {};

    // Build filter query
    const filterQuery = request.filters
        ? buildFilterQuery(request.filters, context)
        : undefined;

    // Pagination - for hybrid, fetch more to allow for fusion
    const windowSize = context.rrf?.windowSize || 100;

    // Build knn query
    body.knn = buildSemanticQuery(queryEmbedding, context, filterQuery, windowSize);

    // Source filtering
    body._source = buildSourceConfig(request, context);

    // Note: knn query doesn't directly support highlighting

    return body;
}

// ============================================================================
// SORT BUILDER
// ============================================================================

/**
 * Build sort clauses for ES
 */
function buildSortClauses(sortClauses: SortClause[]): ESSortClause[] {
    return sortClauses.map(clause => {
        if (clause.field === '_score') {
            return '_score';
        }

        const sortOptions: ESSortOptions = {
            order: clause.direction,
        };

        if (clause.missing) {
            sortOptions.missing = clause.missing;
        }

        return {
            [clause.field]: sortOptions,
        };
    });
}

// ============================================================================
// SOURCE CONFIG BUILDER
// ============================================================================

/**
 * Build source filtering configuration
 */
function buildSourceConfig(
    request: SearchRequest,
    context: SearchContext
): ESSourceConfig {
    const config: ESSourceConfig = {};

    // If specific fields requested, use those
    if (request.includeFields && request.includeFields.length > 0) {
        config.includes = request.includeFields;
    } else {
        // Use default response fields from context
        config.includes = context.defaultResponseFields;
    }

    // Exclude specified fields
    if (request.excludeFields && request.excludeFields.length > 0) {
        config.excludes = request.excludeFields;
    }

    // Always exclude embedding vector from response (large and not useful)
    if (context.embedding) {
        config.excludes = config.excludes || [];
        if (!config.excludes.includes(context.embedding.fieldName)) {
            config.excludes.push(context.embedding.fieldName);
        }
    }

    return config;
}

// ============================================================================
// HIGHLIGHT CONFIG BUILDER
// ============================================================================

/**
 * Build highlight configuration
 */
function buildHighlightConfig(
    highlight: HighlightConfig,
    context: SearchContext
): ESHighlightConfig {
    // Determine which fields to highlight
    const fieldsToHighlight = highlight.fields && highlight.fields.length > 0
        ? highlight.fields
        : context.searchableFields
            .filter(f => f.fieldType === 'text')
            .map(f => f.fieldName);

    const fieldConfig: Record<string, ESHighlightFieldConfig> = {};
    for (const field of fieldsToHighlight) {
        fieldConfig[field] = {
            fragment_size: highlight.fragmentSize || SEARCH_DEFAULTS.defaultFragmentSize,
            number_of_fragments: highlight.numberOfFragments || SEARCH_DEFAULTS.defaultNumberOfFragments,
        };
    }

    return {
        fields: fieldConfig,
        pre_tags: [highlight.preTag || SEARCH_DEFAULTS.defaultHighlightPreTag],
        post_tags: [highlight.postTag || SEARCH_DEFAULTS.defaultHighlightPostTag],
    };
}

// ============================================================================
// AGGREGATION BUILDER
// ============================================================================

/**
 * Build facet aggregations
 */
function buildAggregations(
    facets: FacetRequest[],
    context: SearchContext
): Record<string, ESAggregation> {
    const aggs: Record<string, ESAggregation> = {};

    for (const facet of facets) {
        const aggName = `facet_${facet.field}`;

        // Find field type from context to determine correct ES field path
        const facetableField = context.facetableFields.find(f => f.fieldName === facet.field);
        const fieldType = facetableField?.fieldType || 'text';

        switch (facet.type) {
            case 'terms':
                aggs[aggName] = buildTermsAggregation(facet, fieldType);
                break;

            case 'range':
                aggs[aggName] = buildRangeAggregation(facet);
                break;

            case 'date_range':
                aggs[aggName] = buildDateRangeAggregation(facet);
                break;

            case 'date_histogram':
                aggs[aggName] = buildDateHistogramAggregation(facet);
                break;

            case 'histogram':
                aggs[aggName] = buildHistogramAggregation(facet);
                break;
        }
    }

    return aggs;
}

/**
 * Field types that don't need .keyword subfield for aggregations
 */
const NON_TEXT_FIELD_TYPES = new Set([
    'keyword', 'boolean', 'integer', 'float', 'long', 'double', 'short', 'byte',
    'date', 'geo_point', 'ip', 'number', 'decimal', 'price', 'currency', 'percent', 'rating',
]);

/**
 * Build terms aggregation
 */
function buildTermsAggregation(facet: FacetRequest, fieldType: string): ESAggregation {
    // Determine the correct field path for aggregation
    let fieldConfig: string;

    if (facet.field.endsWith('.keyword')) {
        // Already specified as keyword
        fieldConfig = facet.field;
    } else if (NON_TEXT_FIELD_TYPES.has(fieldType.toLowerCase())) {
        // Non-text field types can be aggregated directly
        fieldConfig = facet.field;
    } else {
        // Text field - try to use .keyword subfield if available
        // Note: This requires the ES mapping to have fields.keyword defined
        fieldConfig = `${facet.field}.keyword`;
    }

    const terms: ESTermsAggregation = {
        field: fieldConfig,
        size: facet.size || 10,
    };

    if (facet.minDocCount !== undefined) {
        terms.min_doc_count = facet.minDocCount;
    }

    if (facet.orderBy) {
        const orderField = facet.orderBy === 'count' ? '_count' : '_key';
        terms.order = { [orderField]: facet.orderDirection || 'desc' };
    }

    if (facet.includeMissing) {
        terms.missing = '__missing__';
    }

    return { terms };
}

/**
 * Build range aggregation
 */
function buildRangeAggregation(facet: FacetRequest): ESAggregation {
    if (!facet.ranges || facet.ranges.length === 0) {
        throw new Error(`Range facet "${facet.field}" requires ranges configuration`);
    }

    return {
        range: {
            field: facet.field,
            ranges: facet.ranges.map(r => ({
                key: r.key,
                from: r.from as number | undefined,
                to: r.to as number | undefined,
            })),
        },
    };
}

/**
 * Build date range aggregation
 */
function buildDateRangeAggregation(facet: FacetRequest): ESAggregation {
    if (!facet.ranges || facet.ranges.length === 0) {
        throw new Error(`Date range facet "${facet.field}" requires ranges configuration`);
    }

    return {
        date_range: {
            field: facet.field,
            ranges: facet.ranges.map(r => ({
                key: r.key,
                from: r.from as string | undefined,
                to: r.to as string | undefined,
            })),
        },
    };
}

/**
 * Build date histogram aggregation
 */
function buildDateHistogramAggregation(facet: FacetRequest): ESAggregation {
    if (!facet.interval) {
        throw new Error(`Date histogram facet "${facet.field}" requires interval`);
    }

    const agg: ESDateHistogramAggregation = {
        field: facet.field,
    };

    // Determine if calendar or fixed interval
    const calendarIntervals = ['minute', 'hour', 'day', 'week', 'month', 'quarter', 'year'];
    if (typeof facet.interval === 'string' && calendarIntervals.includes(facet.interval)) {
        agg.calendar_interval = facet.interval;
    } else {
        agg.fixed_interval = String(facet.interval);
    }

    if (facet.minDocCount !== undefined) {
        agg.min_doc_count = facet.minDocCount;
    }

    return { date_histogram: agg };
}

/**
 * Build histogram aggregation
 */
function buildHistogramAggregation(facet: FacetRequest): ESAggregation {
    if (!facet.interval || typeof facet.interval !== 'number') {
        throw new Error(`Histogram facet "${facet.field}" requires numeric interval`);
    }

    const agg: ESHistogramAggregation = {
        field: facet.field,
        interval: facet.interval,
    };

    if (facet.minDocCount !== undefined) {
        agg.min_doc_count = facet.minDocCount;
    }

    return { histogram: agg };
}
