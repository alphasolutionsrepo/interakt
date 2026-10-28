// app/api/v1/search/[slug]/search/route.ts

/**
 * Search API Route (by slug)
 *
 * Execute search queries through a Search Experience identified by slug.
 * Supports both access token auth (X-Access-Token) and session auth (for playground).
 * The search itself is the shared experience flow (experience-search.ts); this
 * route only adds session auth and the playground's response shape.
 *
 * POST /api/v1/search/:slug/search
 */

import { NextRequest, NextResponse } from 'next/server';
import { ZodError, z } from 'zod';
import { createLogger } from '@/shared/logger/logger';
import { searchExperienceAccess } from '@/features/auth/public-access';
import { withAnalyticsSource } from '@/features/analytics/analytics-source-context';
import { authenticateTokenOrSession } from '@/features/auth/token-or-session';
import { flushTelemetry, runWithTelemetryLevel } from '@/features/telemetry';
import type { FacetResult, SearchErrorCode } from '@/features/search/search.types';
import { SearchError } from '@/features/search/search.types';
import * as repository from '@/features/search-experience/search-experience.repository';
import { publicSearchRequestSchema } from '@/features/search-experience/search-experience.schemas';
import { executeExperienceSearch, NoSourcesError } from '@/features/search-experience/experience-search';
import type { PublicSearchRequest } from '@/features/search-experience/search-experience.types';

// Extended schema: playground-only switches
const searchRequestSchema = publicSearchRequestSchema.extend({
  includeHighlights: z.boolean().optional(),
  /** Admin requests are not traced unless this is true (then traced in full) */
  trace: z.boolean().optional(),
});

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

    const experience = await repository.getSearchExperienceWithIndexes(baseExperience.id);
    if (!experience) {
      return NextResponse.json(
        { success: false, error: 'Search experience not found', code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    // 2. Authenticate: the experience's access token (real traffic) or an admin
    //    session (playground). Admin searches are recorded as 'admin_test', which
    //    analytics leaves out by default, and are not traced unless asked for.
    const { caller, refused, analyticsSource } = await authenticateTokenOrSession(request, searchExperienceAccess(experience));
    if (!caller) {
      return refused ?? NextResponse.json(
        { success: false, error: 'Unauthorized', code: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }
    const isAdmin = caller === 'admin';

    // 3. Parse and validate request body
    const body = await request.json();
    const validated = searchRequestSchema.parse(body);

    // 4. Search through the experience (same flow as the public search API)
    // Everything the search records (its AI calls too) carries where it came from
    const run = () => withAnalyticsSource(analyticsSource, () => executeExperienceSearch(experience, validated as PublicSearchRequest, {
      source: analyticsSource,
      includeHighlights: validated.includeHighlights,
    }));
    // Admin searches: untraced, or traced in full when the admin asks for it.
    const { results, hitOrigins, failedSources, interpretation } = isAdmin
      ? await runWithTelemetryLevel(validated.trace ? 'full' : 'off', run)
      : await run();

    // 5. Shape the playground response
    const response = {
      query: validated.query,
      // What the phrase was understood to mean, so a client can show it (and let
      // the user undo it). Absent when interpretation is off or was skipped.
      ...(interpretation?.interpreted && {
        interpretation: {
          effectiveQuery: interpretation.effectiveQuery,
          appliedFilters: interpretation.appliedFilters,
          droppedFilters: interpretation.droppedFilters,
        },
      }),
      results: results.hits.map((hit) => {
        const origin = hitOrigins.get(hit);
        return {
          id: hit.id,
          index: { id: origin?.id ?? '', name: origin?.name ?? '' },
          score: hit.score,
          fields: hit.source,
          highlights: hit.highlights,
        };
      }),
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
      // A source failed while others answered
      ...(failedSources.length > 0 && { partial: true }),
    };

    logger.info('Search completed via slug', {
      slug,
      query: validated.query.substring(0, 50),
      totalHits: results.total.value,
      took: response.timing.totalMs,
      admin: isAdmin,
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

  if (error instanceof NoSourcesError) {
    return NextResponse.json(
      { success: false, error: error.message, code: 'NO_INDEXES' },
      { status: 400 }
    );
  }

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
    // Typed as Record<SearchErrorCode, …> on purpose: this is the customer-facing
    // route, and an unmapped code falls through to 500 — so a bad filter, facet or
    // field name read as "search is down" rather than "your request was invalid".
    // The exhaustive type means adding a code to the union without deciding its
    // status here is a compile error instead of a silent 500 in production.
    const statusMap: Record<SearchErrorCode, number> = {
      INDEX_NOT_FOUND: 404,
      INDEX_NOT_READY: 503,
      INVALID_QUERY: 400,
      INVALID_FILTER: 400,
      INVALID_FACET: 400,
      INVALID_SORT: 400,
      FIELD_NOT_FOUND: 400,
      FIELD_NOT_SEARCHABLE: 400,
      FIELD_NOT_FACETABLE: 400,
      EMBEDDING_FAILED: 503,
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
