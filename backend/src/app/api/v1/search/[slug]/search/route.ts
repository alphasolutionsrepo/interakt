// app/api/v1/search/[slug]/search/route.ts

/**
 * Search API Route (by slug)
 *
 * Execute search queries through a Search Experience identified by slug.
 * Supports both access token auth (X-Access-Token) and session auth (for playground).
 *
 * POST /api/v1/search/:slug/search
 */

import { NextRequest, NextResponse } from 'next/server';
import { ZodError, z } from 'zod';
import { createLogger } from '@/shared/logger/logger';
import { auth } from '@/features/auth/auth.api.handlers';
import { flushTelemetry } from '@/features/telemetry';
import * as searchService from '@/features/search/search.service';
import type { SearchRequest, SearchResponse, FacetResult, FacetType } from '@/features/search/search.types';
import { SearchError } from '@/features/search/search.types';
import * as repository from '@/features/search-experience/search-experience.repository';
import { publicSearchRequestSchema } from '@/features/search-experience/search-experience.schemas';
import type {
  SearchExperienceWithIndexes,
  SearchExperienceIndex,
} from '@/features/search-experience/search-experience.types';

// Extended schema with includeHighlights
const searchRequestSchema = publicSearchRequestSchema.extend({
  includeHighlights: z.boolean().optional(),
});

type PlaygroundSearchRequest = z.infer<typeof searchRequestSchema>;

const logger = createLogger('search-api-slug');

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const startTime = Date.now();

  try {
    // 1. Get search experience by slug
    const baseExperience = await repository.getSearchExperienceBySlug(slug);

    if (!baseExperience) {
      return NextResponse.json(
        { success: false, error: 'Search experience not found', code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    if (!baseExperience.isActive) {
      return NextResponse.json(
        { success: false, error: 'Search experience is not active', code: 'INACTIVE' },
        { status: 403 }
      );
    }

    // Get experience with indexes
    const experience = await repository.getSearchExperienceWithIndexes(baseExperience.id);
    if (!experience) {
      return NextResponse.json(
        { success: false, error: 'Search experience not found', code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    // 2. Check authentication - either access token or session
    const accessToken = request.headers.get('Authorization')?.replace('Bearer ', '') ||
                        request.headers.get('X-Access-Token');

    let isAuthenticated = false;

    // Try access token first
    if (accessToken && accessToken === experience.accessToken) {
      isAuthenticated = true;
    }

    // Fall back to session auth (for playground)
    if (!isAuthenticated) {
      const session = await auth();
      if (session?.user) {
        isAuthenticated = true;
      }
    }

    if (!isAuthenticated) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized', code: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    // 3. Parse and validate request body
    const body = await request.json();
    const validated = searchRequestSchema.parse(body);

    // 4. Resolve indexes to search
    const indexesToSearch = resolveIndexesToSearch(experience, validated.indexId);

    if (indexesToSearch.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No valid indexes configured', code: 'NO_INDEXES' },
        { status: 400 }
      );
    }

    // 5. Build search request
    const searchRequest = buildSearchRequest(validated, experience);

    // 6. Execute search (pass experience for hybrid config)
    const results = await executeMultiIndexSearch(indexesToSearch, searchRequest, experience);

    // 7. Transform results for response
    const response = {
      query: validated.query,
      results: results.hits.map((hit) => ({
        id: hit.id,
        index: {
          id: hit.source._indexId || indexesToSearch[0].searchIndexId,
          name: hit.source._indexName || indexesToSearch[0].searchIndex.name,
        },
        score: hit.score,
        fields: hit.source,
        highlights: hit.highlights,
      })),
      facets: results.facets ? transformFacets(results.facets) : undefined,
      pagination: {
        page: results.pagination.page,
        pageSize: results.pagination.pageSize,
        totalResults: results.total.value,
        totalPages: results.pagination.totalPages,
      },
      timing: {
        totalMs: Date.now() - startTime,
        searchMs: results.took,
      },
    };

    logger.info('Search completed via slug', {
      slug,
      query: validated.query.substring(0, 50),
      totalHits: results.total.value,
      took: response.timing.totalMs,
    });

    await flushTelemetry();
    return NextResponse.json({ success: true, data: response });
  } catch (error) {
    await flushTelemetry();
    return handleSearchError(error, slug);
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function resolveIndexesToSearch(
  experience: SearchExperienceWithIndexes,
  requestedIndexId?: string
): Array<SearchExperienceIndex & { searchIndex: { id: string; name: string; displayName: string; isActive: boolean } }> {
  const activeIndexes = experience.indexes.filter((idx) => idx.searchIndex.isActive);

  if (requestedIndexId) {
    const requestedIndex = activeIndexes.find(
      (idx) => idx.searchIndexId === requestedIndexId || idx.searchIndex.name === requestedIndexId
    );
    return requestedIndex ? [requestedIndex] : [];
  }

  return activeIndexes;
}

function buildSearchRequest(
  input: PlaygroundSearchRequest,
  experience: SearchExperienceWithIndexes
): SearchRequest {
  const searchConfig = experience.searchConfig;
  const filters = input.filters as SearchRequest['filters'];
  const facets = input.facets?.map((f: { field: string; type?: string; size?: number }) => ({
    field: f.field,
    type: (f.type ?? 'terms') as 'terms' | 'range' | 'date_range' | 'date_histogram' | 'histogram',
    size: f.size,
  }));

  // Cast sort to proper type with required direction
  const sort = input.sort
    ?.filter((s) => !!s.field)
    .map((s) => ({ field: s.field!, direction: s.direction ?? 'desc' as const }));

  // Determine search type: use request's searchType if explicitly set (not 'auto'),
  // otherwise fall back to experience's defaultSearchType, then 'auto'
  const searchType = (input.searchType && input.searchType !== 'auto')
    ? input.searchType
    : (searchConfig.defaultSearchType ?? 'auto');

  return {
    query: input.query,
    searchType,
    filters,
    facets,
    page: input.page ?? 1,
    pageSize: Math.min(
      input.pageSize ?? searchConfig.defaultPageSize ?? 20,
      searchConfig.maxPageSize ?? 100
    ),
    sort: sort && sort.length > 0 ? sort : undefined,
    includeFields: input.includeFields,
    excludeFields: input.excludeFields,
    highlight: input.includeHighlights || searchConfig.enableHighlighting
      ? { preTag: '<em>', postTag: '</em>' }
      : undefined,
  };
}

async function executeMultiIndexSearch(
  indexes: Array<SearchExperienceIndex & { searchIndex: { id: string; name: string; displayName: string; isActive: boolean } }>,
  request: SearchRequest,
  experience: SearchExperienceWithIndexes
): Promise<SearchResponse> {
  // Extract hybrid config from experience for search options
  const hybridConfig = experience.searchConfig?.hybridConfig;
  const searchOptions = hybridConfig ? {
    experienceId: experience.id,
    hybridConfig: {
      lexicalWeight: hybridConfig.lexicalWeight,
      semanticWeight: hybridConfig.semanticWeight,
      rrfRankConstant: hybridConfig.rrfRankConstant,
      rrfWindowSize: hybridConfig.rrfWindowSize,
    },
  } : { experienceId: experience.id };

  if (indexes.length === 1) {
    const result = await searchService.searchById(indexes[0].searchIndexId, request, searchOptions);
    // Add index info to each hit
    result.hits = result.hits.map((hit) => ({
      ...hit,
      source: {
        ...hit.source,
        _indexId: indexes[0].searchIndexId,
        _indexName: indexes[0].searchIndex.name,
      },
    }));
    return result;
  }

  // Multi-index search
  const searchPromises = indexes.map((idx) =>
    searchService
      .searchById(idx.searchIndexId, request, searchOptions)
      .then((result) => {
        // Add index info to hits
        result.hits = result.hits.map((hit) => ({
          ...hit,
          source: {
            ...hit.source,
            _indexId: idx.searchIndexId,
            _indexName: idx.searchIndex.name,
          },
        }));
        return { indexId: idx.searchIndexId, result, error: null };
      })
      .catch((error) => ({ indexId: idx.searchIndexId, result: null, error }))
  );

  const searchResults = await Promise.all(searchPromises);
  return mergeSearchResults(searchResults, request);
}

function mergeSearchResults(
  results: Array<{ indexId: string; result: SearchResponse | null; error: unknown }>,
  request: SearchRequest
): SearchResponse {
  const successfulResults = results.filter((r) => r.result !== null) as Array<{
    indexId: string;
    result: SearchResponse;
  }>;

  if (successfulResults.length === 0) {
    const firstError = results.find((r) => r.error);
    if (firstError?.error instanceof Error) {
      throw firstError.error;
    }
    throw new SearchError('All index searches failed', 'PROVIDER_ERROR');
  }

  // RRF merging
  const mergedHits = mergeHitsWithRRF(
    successfulResults.map((r) => r.result.hits),
    request.pageSize ?? 20
  );

  const totalValue = successfulResults.reduce((sum, r) => sum + r.result.total.value, 0);
  const maxTook = Math.max(...successfulResults.map((r) => r.result.took));
  const pageSize = request.pageSize ?? 20;
  const page = request.page ?? 1;
  const totalPages = Math.ceil(totalValue / pageSize);

  // Merge facets
  const allFacets = successfulResults.flatMap((r) => r.result.facets ?? []);

  return {
    hits: mergedHits,
    total: { value: totalValue, relation: 'gte' },
    facets: allFacets.length > 0 ? mergeFacets(allFacets) : undefined,
    took: maxTook,
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

function mergeHitsWithRRF(
  hitSets: Array<Array<{ id: string; score: number; source: Record<string, unknown>; highlights?: Record<string, string[]> }>>,
  limit: number,
  k: number = 60
): Array<{ id: string; score: number; source: Record<string, unknown>; highlights?: Record<string, string[]> }> {
  const scoreMap = new Map<
    string,
    {
      hit: { id: string; score: number; source: Record<string, unknown>; highlights?: Record<string, string[]> };
      rrfScore: number;
    }
  >();

  for (const hits of hitSets) {
    hits.forEach((hit, rank) => {
      const rrfContribution = 1 / (k + rank + 1);
      const existing = scoreMap.get(hit.id);
      if (existing) {
        existing.rrfScore += rrfContribution;
        if (hit.score > existing.hit.score) {
          existing.hit = hit;
        }
      } else {
        scoreMap.set(hit.id, { hit, rrfScore: rrfContribution });
      }
    });
  }

  return Array.from(scoreMap.values())
    .sort((a, b) => b.rrfScore - a.rrfScore)
    .slice(0, limit)
    .map(({ hit, rrfScore }) => ({ ...hit, score: rrfScore }));
}

function mergeFacets(facets: FacetResult[]): FacetResult[] {
  const facetMap = new Map<string, { field: string; type: FacetType; buckets: Map<string | number, number> }>();

  for (const facet of facets) {
    let existing = facetMap.get(facet.field);
    if (!existing) {
      existing = { field: facet.field, type: facet.type, buckets: new Map() };
      facetMap.set(facet.field, existing);
    }
    for (const bucket of facet.buckets) {
      const currentCount = existing.buckets.get(bucket.key) ?? 0;
      existing.buckets.set(bucket.key, currentCount + bucket.count);
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

function transformFacets(facets: FacetResult[]): Record<string, { buckets: Array<{ key: string; doc_count: number }> }> {
  const result: Record<string, { buckets: Array<{ key: string; doc_count: number }> }> = {};
  for (const facet of facets) {
    result[facet.field] = {
      buckets: facet.buckets.map((b) => ({
        key: String(b.key),
        doc_count: b.count,
      })),
    };
  }
  return result;
}

function handleSearchError(error: unknown, slug: string): NextResponse {
  logger.error('Search error', {
    slug,
    error: error instanceof Error ? error.message : 'Unknown error',
  });

  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        success: false,
        error: 'Invalid request',
        code: 'VALIDATION_ERROR',
        details: error.errors.map((e) => ({ field: e.path.join('.'), message: e.message })),
      },
      { status: 400 }
    );
  }

  if (error instanceof SearchError) {
    const statusMap: Record<string, number> = {
      INDEX_NOT_FOUND: 404,
      INDEX_NOT_READY: 503,
      INVALID_QUERY: 400,
      PROVIDER_ERROR: 503,
      TIMEOUT: 504,
    };
    return NextResponse.json(
      { success: false, error: error.message, code: error.code },
      { status: statusMap[error.code] ?? 500 }
    );
  }

  return NextResponse.json(
    { success: false, error: 'An unexpected error occurred', code: 'INTERNAL_ERROR' },
    { status: 500 }
  );
}
