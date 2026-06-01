// src/features/search/response.normalizer.ts

/**
 * Response Normalizer
 *
 * Transforms provider-specific responses into the standard SearchResponse format.
 * Handles facet parsing, pagination calculation, and score normalization.
 */

import type {
    SearchRequest,
    SearchResponse,
    SearchHit,
    TotalHits,
    PaginationInfo,
    FacetResult,
    FacetBucket,
    FacetRequest,
    FacetType,
    QueryExplanation,
    ProviderSearchResponse,
    ProviderHit,
    SearchContext,
} from './search.types';
import { SEARCH_DEFAULTS } from './search.types';
import type { SearchType } from '@/shared/constants/search-index.constants';

// ============================================================================
// MAIN NORMALIZER
// ============================================================================

/**
 * Normalize provider response to standard SearchResponse
 */
export function normalizeSearchResponse(
    providerResponse: ProviderSearchResponse,
    request: SearchRequest,
    context: SearchContext,
    searchType: SearchType
): SearchResponse {
    const page = request.page || 1;
    const pageSize = request.pageSize || SEARCH_DEFAULTS.pageSize;

    // Normalize hits
    const hits = normalizeHits(providerResponse.hits, providerResponse.maxScore);

    // Calculate pagination
    const pagination = calculatePagination(
        providerResponse.total,
        page,
        pageSize
    );

    // Parse facets
    const facets = request.facets
        ? parseFacets(providerResponse.aggregations, request.facets)
        : undefined;

    // Build response
    const response: SearchResponse = {
        hits,
        total: providerResponse.total,
        took: providerResponse.took,
        pagination,
    };

    // Add optional fields
    if (providerResponse.maxScore !== undefined) {
        response.maxScore = providerResponse.maxScore;
    }

    if (facets && facets.length > 0) {
        response.facets = facets;
    }

    // Add explanation if requested
    if (request.explain) {
        response.explanation = buildExplanation(request, context, searchType);
    }

    return response;
}

// ============================================================================
// HIT NORMALIZATION
// ============================================================================

/**
 * Normalize provider hits to standard SearchHit format
 */
function normalizeHits(
    providerHits: ProviderHit[],
    maxScore?: number
): SearchHit[] {
    return providerHits.map(hit => normalizeHit(hit, maxScore));
}

/**
 * Normalize a single hit
 */
function normalizeHit(hit: ProviderHit, maxScore?: number): SearchHit {
    const normalizedHit: SearchHit = {
        id: hit.id,
        score: hit.score,
        source: hit.source,
    };

    // Add highlights if present
    if (hit.highlight && Object.keys(hit.highlight).length > 0) {
        normalizedHit.highlights = hit.highlight;
    }

    // Add explanation if present
    if (hit.explanation) {
        normalizedHit.explanation = formatExplanation(hit.explanation);
    }

    return normalizedHit;
}

/**
 * Format hit explanation for readability
 */
function formatExplanation(explanation: unknown): string {
    if (typeof explanation === 'string') {
        return explanation;
    }

    try {
        return JSON.stringify(explanation, null, 2);
    } catch {
        return String(explanation);
    }
}

// ============================================================================
// PAGINATION
// ============================================================================

/**
 * Calculate pagination info from total hits
 */
function calculatePagination(
    total: TotalHits,
    page: number,
    pageSize: number
): PaginationInfo {
    const totalItems = total.value;
    const totalPages = Math.ceil(totalItems / pageSize);

    return {
        page,
        pageSize,
        totalPages,
        totalItems,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
    };
}

// ============================================================================
// FACET PARSING
// ============================================================================

/**
 * Parse ES aggregations into FacetResult array
 */
function parseFacets(
    aggregations: Record<string, unknown> | undefined,
    facetRequests: FacetRequest[]
): FacetResult[] {
    if (!aggregations) {
        return [];
    }

    const results: FacetResult[] = [];

    for (const facetRequest of facetRequests) {
        const aggName = `facet_${facetRequest.field}`;
        const aggResult = aggregations[aggName];

        if (!aggResult) {
            continue;
        }

        const facetResult = parseSingleFacet(
            facetRequest.field,
            facetRequest.type,
            aggResult
        );

        if (facetResult) {
            results.push(facetResult);
        }
    }

    return results;
}

/**
 * Parse a single facet aggregation result
 */
function parseSingleFacet(
    field: string,
    type: FacetType,
    aggResult: unknown
): FacetResult | null {
    const result = aggResult as {
        buckets?: unknown[];
        sum_other_doc_count?: number;
        doc_count_error_upper_bound?: number;
    };

    if (!result.buckets || !Array.isArray(result.buckets)) {
        return null;
    }

    const buckets = result.buckets.map(bucket => parseBucket(bucket, type));

    // Check for missing bucket
    const missingAgg = (aggResult as { missing_count?: { doc_count?: number } }).missing_count;
    const missingCount = missingAgg?.doc_count;

    return {
        field,
        type,
        buckets,
        missingCount,
    };
}

/**
 * Parse a single bucket from aggregation
 */
function parseBucket(bucket: unknown, type: FacetType): FacetBucket {
    const b = bucket as {
        key?: string | number;
        key_as_string?: string;
        doc_count?: number;
        from?: number | string;
        to?: number | string;
        from_as_string?: string;
        to_as_string?: string;
    };

    const result: FacetBucket = {
        key: b.key ?? '',
        count: b.doc_count ?? 0,
    };

    // For date histograms, use the string representation as label
    if (b.key_as_string) {
        result.label = b.key_as_string;
    }

    // For range facets, include from/to
    if (type === 'range' || type === 'date_range') {
        if (b.from !== undefined) {
            result.from = b.from_as_string ?? b.from;
        }
        if (b.to !== undefined) {
            result.to = b.to_as_string ?? b.to;
        }
    }

    return result;
}

// ============================================================================
// QUERY EXPLANATION
// ============================================================================

/**
 * Build query explanation for debugging
 */
function buildExplanation(
    request: SearchRequest,
    context: SearchContext,
    searchType: SearchType
): QueryExplanation {
    return {
        originalQuery: request.query,
        searchType,
        searchedFields: context.searchableFields.map(f => f.fieldName),
        appliedFilters: request.filters
            ? request.filters.map(f => `${f.field} ${f.operator} ${JSON.stringify(f.value)}`)
            : [],
    };
}

// ============================================================================
// SCORE UTILITIES
// ============================================================================

/**
 * Normalize scores to 0-1 range (optional)
 * This can be useful for consistent score interpretation across search types
 */
export function normalizeScores(hits: SearchHit[], maxScore?: number): SearchHit[] {
    if (!maxScore || maxScore === 0) {
        return hits;
    }

    return hits.map(hit => ({
        ...hit,
        score: hit.score / maxScore,
    }));
}

/**
 * Calculate score statistics for a set of hits
 */
export function calculateScoreStats(hits: SearchHit[]): {
    min: number;
    max: number;
    avg: number;
    median: number;
} {
    if (hits.length === 0) {
        return { min: 0, max: 0, avg: 0, median: 0 };
    }

    const scores = hits.map(h => h.score).sort((a, b) => a - b);

    const min = scores[0];
    const max = scores[scores.length - 1];
    const avg = scores.reduce((sum, s) => sum + s, 0) / scores.length;
    const median = scores.length % 2 === 0
        ? (scores[scores.length / 2 - 1] + scores[scores.length / 2]) / 2
        : scores[Math.floor(scores.length / 2)];

    return { min, max, avg, median };
}
