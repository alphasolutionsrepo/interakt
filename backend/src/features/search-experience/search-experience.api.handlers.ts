// src/features/search-experience/search-experience.api.handlers.ts

/**
 * Search Experience API Handlers
 *
 * Public API handlers for search experiences, including:
 * - Search API with multi-index support
 * - AI Summary generation
 * - Chat with streaming
 */

import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { createLogger } from '@/shared/logger/logger';
import * as searchService from '@/features/search/search.service';
import type { SearchRequest, SearchResponse, FacetResult, FacetType } from '@/features/search/search.types';
import { SearchError } from '@/features/search/search.types';
import {
  authenticateAccessToken,
  createCorsHeaders,
  handleCorsPreflight,
} from './access-token.middleware';
import { publicSearchRequestSchema, autocompleteRequestSchema } from './search-experience.schemas';
import type {
  SearchExperienceWithIndexes,
  PublicSearchRequest,
  PublicSearchResponse,
  SearchExperienceIndex,
} from './search-experience.types';
import * as autocompleteService from './autocomplete.service';
import * as searchIndexService from '@/features/search-index/search-index.service';

const logger = createLogger('search-experience-api');

// ============================================================================
// PUBLIC SEARCH HANDLER
// ============================================================================

/**
 * Handle public search request
 * POST /api/v1/search
 */
export async function handlePublicSearch(request: NextRequest): Promise<NextResponse> {
  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return handleCorsPreflight();
  }

  const startTime = Date.now();

  // 1. Authenticate using access token
  const authResult = await authenticateAccessToken(request);
  if (!authResult.success) {
    return (authResult as { success: false; response: NextResponse }).response;
  }

  const { experience } = authResult as { success: true; experience: SearchExperienceWithIndexes };
  const origin = request.headers.get('origin');

  try {
    // 2. Parse request body
    const body = await request.json();
    const validated = publicSearchRequestSchema.parse(body) as PublicSearchRequest;

    // 3. Determine which indexes to search
    const indexesToSearch = resolveIndexesToSearch(experience, validated.indexId);

    if (indexesToSearch.length === 0) {
      return createErrorResponse(
        'No valid indexes configured for this search experience',
        'NO_INDEXES',
        400,
        experience,
        origin
      );
    }

    // 4. Build search request from public request (includes auto-generating facets if enabled)
    const searchRequest = await buildSearchRequest(validated, experience, indexesToSearch);

    // 5. Execute search across indexes
    const results = await executeMultiIndexSearch(indexesToSearch, searchRequest, experience);

    // 6. Enrich facets with human labels pulled from the index field config.
    // The widget needs a label for each facet ("Content Type" rather than
    // "contentType"); we look it up once here rather than forcing the client
    // to humanize field names.
    const facetLabels = await collectFacetLabels(indexesToSearch);
    const enrichedFacets = results.facets?.map((f) => ({
      ...f,
      label: facetLabels.get(f.field) ?? undefined,
    }));

    // 7. Build response
    const response: PublicSearchResponse = {
      results: results.hits,
      total: results.total,
      pagination: results.pagination,
      facets: enrichedFacets,
      took: Date.now() - startTime,
      searchExperienceId: experience.id,
      indexesSearched: indexesToSearch.map((idx) => ({
        id: idx.searchIndex.id,
        name: idx.searchIndex.name,
        displayName: idx.searchIndex.displayName,
      })),
      // Include display configuration for frontend rendering
      displayConfig: experience.displayConfig ?? undefined,
    };

    logger.info('Public search completed', {
      experienceId: experience.id,
      query: validated.query.substring(0, 50),
      indexCount: indexesToSearch.length,
      totalHits: results.total.value,
      took: response.took,
    });

    // Return with CORS headers
    const corsHeaders = createCorsHeaders(experience, origin);
    return NextResponse.json(
      { success: true, data: response },
      { headers: corsHeaders }
    );
  } catch (error) {
    return handleSearchError(error, experience, origin);
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Resolve which indexes to search based on request
 */
function resolveIndexesToSearch(
  experience: SearchExperienceWithIndexes,
  requestedIndexId?: string
): Array<SearchExperienceIndex & { searchIndex: { id: string; name: string; displayName: string } }> {
  // Filter to only active indexes (using searchIndex.isActive from the joined data)
  const activeIndexes = experience.indexes.filter((idx) => idx.searchIndex.isActive);

  // If specific index requested, validate and use it
  if (requestedIndexId) {
    const requestedIndex = activeIndexes.find(
      (idx) => idx.searchIndexId === requestedIndexId || idx.searchIndex.name === requestedIndexId
    );

    if (requestedIndex) {
      return [requestedIndex];
    }

    // Index not found in this experience
    logger.warn('Requested index not found in experience', {
      experienceId: experience.id,
      requestedIndexId,
      availableIndexes: activeIndexes.map((idx) => idx.searchIndexId),
    });

    return [];
  }

  // Default behavior based on configuration
  // For now, search all enabled indexes
  // In the future, this could be smarter based on AI routing
  return activeIndexes;
}

/**
 * Build internal search request from public request
 */
async function buildSearchRequest(
  publicRequest: PublicSearchRequest,
  experience: SearchExperienceWithIndexes,
  indexes: Array<SearchExperienceIndex & { searchIndex: { id: string; name: string; displayName: string } }>
): Promise<SearchRequest> {
  const searchConfig = experience.searchConfig;

  // Cast filters to the expected types (they come validated from schema)
  const filters = publicRequest.filters as SearchRequest['filters'];

  // Handle facets: either use explicit facets from request or auto-generate from facetable fields
  let facets: SearchRequest['facets'] | undefined;

  if (publicRequest.facets && publicRequest.facets.length > 0) {
    // Use explicit facets from request
    facets = publicRequest.facets.map((f) => ({
      field: f.field,
      type: (f.type ?? 'terms') as 'terms' | 'range' | 'date_range' | 'date_histogram' | 'histogram',
      size: f.size,
    }));
  } else if (searchConfig.enableFacets) {
    // Auto-generate facets from facetable fields in attached indexes
    facets = await getDefaultFacets(indexes);
  }

  return {
    query: publicRequest.query,
    searchType: publicRequest.searchType ?? 'auto',
    filters,
    facets,
    page: publicRequest.page ?? 1,
    pageSize: Math.min(
      publicRequest.pageSize ?? searchConfig.defaultPageSize ?? 20,
      searchConfig.maxPageSize ?? 100
    ),
    sort: publicRequest.sort,
    includeFields: publicRequest.includeFields,
    excludeFields: publicRequest.excludeFields,
    highlight: searchConfig.enableHighlighting
      ? {
          preTag: '<em>',
          postTag: '</em>',
        }
      : undefined,
  };
}

/**
 * Collect human labels for facetable fields across all indexes in the
 * experience. Keyed by raw field name → human displayName. Falls back to
 * empty map on errors so the search response still ships without labels.
 */
async function collectFacetLabels(
  indexes: Array<SearchExperienceIndex & { searchIndex: { id: string } }>,
): Promise<Map<string, string>> {
  const labels = new Map<string, string>();
  try {
    for (const indexConfig of indexes) {
      const searchIndex = await searchIndexService.getSearchIndexById(indexConfig.searchIndexId);
      if (!searchIndex?.fields) continue;
      for (const field of searchIndex.fields) {
        if (field.displayName && !labels.has(field.fieldName)) {
          labels.set(field.fieldName, field.displayName);
        }
      }
    }
  } catch (err) {
    logger.warn('Failed to collect facet labels; continuing without them', { err });
  }
  return labels;
}

/**
 * Get default facets from facetable fields in search indexes
 */
async function getDefaultFacets(
  indexes: Array<SearchExperienceIndex & { searchIndex: { id: string; name: string; displayName: string } }>
): Promise<SearchRequest['facets']> {
  // Collect facetable fields from all indexes
  const facetableFieldsSet = new Set<string>();

  for (const indexConfig of indexes) {
    const searchIndex = await searchIndexService.getSearchIndexById(indexConfig.searchIndexId);
    if (searchIndex?.fields) {
      for (const field of searchIndex.fields) {
        if (field.isFacetable && field.isIndexed) {
          facetableFieldsSet.add(field.fieldName);
        }
      }
    }
  }

  // Convert to facet requests (default to terms aggregation with size 10)
  const facets: SearchRequest['facets'] = Array.from(facetableFieldsSet).map(fieldName => ({
    field: fieldName,
    type: 'terms' as const,
    size: 10,
  }));

  logger.debug('Auto-generated default facets', {
    facetCount: facets.length,
    fields: facets.map(f => f.field),
  });

  return facets.length > 0 ? facets : undefined;
}

/**
 * Execute search across multiple indexes
 */
async function executeMultiIndexSearch(
  indexes: Array<SearchExperienceIndex & { searchIndex: { id: string; name: string; displayName: string } }>,
  request: SearchRequest,
  experience: SearchExperienceWithIndexes
): Promise<SearchResponse> {
  const searchOptions = {
    source: 'api' as const,
    experienceId: experience.id,
    experienceSlug: experience.slug,
  };

  // Single index search
  if (indexes.length === 1) {
    return searchService.searchById(indexes[0].searchIndexId, request, searchOptions);
  }

  // Multi-index search with result merging
  const searchPromises = indexes.map((idx) =>
    searchService
      .searchById(idx.searchIndexId, request, searchOptions)
      .then((result) => ({ indexId: idx.searchIndexId, result, error: null }))
      .catch((error) => ({ indexId: idx.searchIndexId, result: null, error }))
  );

  const searchResults = await Promise.all(searchPromises);

  // Merge results based on strategy
  return mergeSearchResults(searchResults, request, experience);
}

/**
 * Merge search results from multiple indexes
 */
function mergeSearchResults(
  results: Array<{ indexId: string; result: SearchResponse | null; error: unknown }>,
  request: SearchRequest,
  experience: SearchExperienceWithIndexes
): SearchResponse {
  // Filter successful results
  const successfulResults = results.filter((r) => r.result !== null) as Array<{
    indexId: string;
    result: SearchResponse;
  }>;

  if (successfulResults.length === 0) {
    // All searches failed
    const firstError = results.find((r) => r.error);
    if (firstError?.error instanceof Error) {
      throw firstError.error;
    }
    throw new SearchError('All index searches failed', 'PROVIDER_ERROR');
  }

  // Log any partial failures
  const failedResults = results.filter((r) => r.error);
  if (failedResults.length > 0) {
    logger.warn('Some index searches failed', {
      experienceId: experience.id,
      failedIndexes: failedResults.map((r) => r.indexId),
    });
  }

  // Merge hits using RRF (Reciprocal Rank Fusion) by default
  const mergedHits = mergeHitsWithRRF(
    successfulResults.map((r) => r.result.hits),
    request.pageSize ?? 20
  );

  // Merge facets
  const mergedFacets = mergeFacets(successfulResults.map((r) => r.result.facets ?? []));

  // Calculate totals
  const totalValue = successfulResults.reduce((sum, r) => sum + r.result.total.value, 0);
  const maxTook = Math.max(...successfulResults.map((r) => r.result.took));
  const maxScore = Math.max(...successfulResults.map((r) => r.result.maxScore ?? 0));

  const pageSize = request.pageSize ?? 20;
  const page = request.page ?? 1;
  const totalPages = Math.ceil(totalValue / pageSize);

  return {
    hits: mergedHits,
    total: {
      value: totalValue,
      relation: 'gte', // Approximation when merging
    },
    facets: mergedFacets.length > 0 ? mergedFacets : undefined,
    took: maxTook,
    maxScore: maxScore > 0 ? maxScore : undefined,
    pagination: {
      page,
      pageSize,
      totalPages,
      totalItems: totalValue,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
  };
}

/**
 * Merge hits from multiple result sets using Reciprocal Rank Fusion
 */
function mergeHitsWithRRF(
  hitSets: Array<Array<{ id: string; score: number; source: Record<string, unknown>; highlights?: Record<string, string[]> }>>,
  limit: number,
  k: number = 60 // RRF constant
): Array<{ id: string; score: number; source: Record<string, unknown>; highlights?: Record<string, string[]> }> {
  const scoreMap = new Map<
    string,
    {
      hit: { id: string; score: number; source: Record<string, unknown>; highlights?: Record<string, string[]> };
      rrfScore: number;
    }
  >();

  // Calculate RRF scores
  for (const hits of hitSets) {
    hits.forEach((hit, rank) => {
      const rrfContribution = 1 / (k + rank + 1);

      const existing = scoreMap.get(hit.id);
      if (existing) {
        existing.rrfScore += rrfContribution;
        // Keep the hit with higher original score for source data
        if (hit.score > existing.hit.score) {
          existing.hit = hit;
        }
      } else {
        scoreMap.set(hit.id, {
          hit,
          rrfScore: rrfContribution,
        });
      }
    });
  }

  // Sort by RRF score and take top N
  return Array.from(scoreMap.values())
    .sort((a, b) => b.rrfScore - a.rrfScore)
    .slice(0, limit)
    .map(({ hit, rrfScore }) => ({
      ...hit,
      score: rrfScore, // Use RRF score as the final score
    }));
}

/**
 * Merge facets from multiple result sets
 */
function mergeFacets(
  facetSets: Array<FacetResult[]>
): FacetResult[] {
  const facetMap = new Map<
    string,
    {
      field: string;
      type: FacetType;
      buckets: Map<string | number, number>;
    }
  >();

  for (const facets of facetSets) {
    for (const facet of facets) {
      let existing = facetMap.get(facet.field);
      if (!existing) {
        existing = {
          field: facet.field,
          type: facet.type,
          buckets: new Map(),
        };
        facetMap.set(facet.field, existing);
      }

      for (const bucket of facet.buckets) {
        const currentCount = existing.buckets.get(bucket.key) ?? 0;
        existing.buckets.set(bucket.key, currentCount + bucket.count);
      }
    }
  }

  return Array.from(facetMap.values()).map((facet) => ({
    field: facet.field,
    type: facet.type,
    buckets: Array.from(facet.buckets.entries())
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count),
  }));
}

/**
 * Handle search errors and return appropriate response
 */
function handleSearchError(
  error: unknown,
  experience: SearchExperienceWithIndexes,
  origin: string | null
): NextResponse {
  logger.error('Search error', {
    experienceId: experience.id,
    error: error instanceof Error ? error.message : 'Unknown error',
  });

  // Zod validation error
  if (error instanceof ZodError) {
    return createErrorResponse(
      'Invalid request',
      'VALIDATION_ERROR',
      400,
      experience,
      origin,
      error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }))
    );
  }

  // Search service error
  if (error instanceof SearchError) {
    const statusMap: Record<string, number> = {
      INDEX_NOT_FOUND: 404,
      INDEX_NOT_READY: 503,
      INVALID_QUERY: 400,
      INVALID_FILTER: 400,
      INVALID_FACET: 400,
      INVALID_SORT: 400,
      FIELD_NOT_FOUND: 400,
      EMBEDDING_FAILED: 503,
      PROVIDER_ERROR: 503,
      TIMEOUT: 504,
    };

    return createErrorResponse(
      error.message,
      error.code,
      statusMap[error.code] ?? 500,
      experience,
      origin
    );
  }

  // Unknown error
  return createErrorResponse(
    'An unexpected error occurred',
    'INTERNAL_ERROR',
    500,
    experience,
    origin
  );
}

/**
 * Create error response with CORS headers
 */
function createErrorResponse(
  message: string,
  code: string,
  status: number,
  experience: SearchExperienceWithIndexes,
  origin: string | null,
  details?: unknown
): NextResponse {
  const corsHeaders = createCorsHeaders(experience, origin);

  return NextResponse.json(
    {
      success: false,
      error: message,
      code,
      details,
    },
    {
      status,
      headers: corsHeaders,
    }
  );
}

// ============================================================================
// AUTOCOMPLETE HANDLER
// ============================================================================

/**
 * Handle autocomplete request
 * POST /api/v1/autocomplete
 */
export async function handleAutocomplete(request: NextRequest): Promise<NextResponse> {
  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return handleCorsPreflight();
  }

  const startTime = Date.now();

  // 1. Authenticate using access token
  const authResult = await authenticateAccessToken(request);
  if (!authResult.success) {
    return (authResult as { success: false; response: NextResponse }).response;
  }

  const { experience } = authResult as { success: true; experience: SearchExperienceWithIndexes };
  const origin = request.headers.get('origin');

  try {
    // 2. Parse request body
    const body = await request.json();
    const validated = autocompleteRequestSchema.parse(body);

    // 3. Check if autocomplete is enabled
    const autocompleteConfig = experience.searchConfig?.autocomplete;
    if (!autocompleteConfig?.enabled) {
      return createErrorResponse(
        'Autocomplete is not enabled for this search experience',
        'AUTOCOMPLETE_DISABLED',
        400,
        experience,
        origin
      );
    }

    // 4. Check minimum length
    if (validated.query.length < (autocompleteConfig.minLength ?? 2)) {
      // Return empty suggestions for queries below minimum length
      const corsHeaders = createCorsHeaders(experience, origin);
      return NextResponse.json(
        {
          success: true,
          data: {
            suggestions: [],
            query: validated.query,
            took: Date.now() - startTime,
          },
        },
        { headers: corsHeaders }
      );
    }

    // 5. Get autocomplete suggestions
    const result = await autocompleteService.getAutocompleteSuggestions(experience, {
      query: validated.query,
      indexId: validated.indexId,
      maxSuggestions: validated.maxSuggestions,
    });

    logger.info('Autocomplete completed', {
      experienceId: experience.id,
      query: validated.query.substring(0, 50),
      suggestionCount: result.suggestions.length,
      took: result.took,
    });

    // Return with CORS headers
    const corsHeaders = createCorsHeaders(experience, origin);
    return NextResponse.json(
      { success: true, data: result },
      { headers: corsHeaders }
    );
  } catch (error) {
    logger.error('Autocomplete error', {
      experienceId: experience.id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    // Zod validation error
    if (error instanceof ZodError) {
      return createErrorResponse(
        'Invalid request',
        'VALIDATION_ERROR',
        400,
        experience,
        origin,
        error.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        }))
      );
    }

    // Unknown error
    return createErrorResponse(
      'An unexpected error occurred',
      'INTERNAL_ERROR',
      500,
      experience,
      origin
    );
  }
}
