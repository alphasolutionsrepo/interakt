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

import { withAnalyticsSource } from '@/features/analytics/analytics-source-context';
import { searchExperienceAccess } from '@/features/auth/public-access';
import { authenticateTokenOrSession } from '@/features/auth/token-or-session';
import type { FacetResult } from '@/features/search/search.types';
import { executeExperienceSearch, NoSourcesError } from '@/features/search-experience/experience-search';
import * as repository from '@/features/search-experience/search-experience.repository';
import { publicSearchRequestSchema } from '@/features/search-experience/search-experience.schemas';
import type { PublicSearchRequest } from '@/features/search-experience/search-experience.types';
import { flushTelemetry, runWithTelemetryLevel } from '@/features/telemetry';
import { publicApiRoute } from '@/features/feature-switches/gate';
import { readJsonBody } from '@/shared/api/read-json-body';
import { apiResponse } from '@/shared/api/response';
import { AppError } from '@/shared/errors/app-error';
import { createLogger } from '@/shared/logger/logger';

// Extended schema: playground-only switches
const searchRequestSchema = publicSearchRequestSchema.extend({
  includeHighlights: z.boolean().optional(),
  /** Admin requests are not traced unless this is true (then traced in full) */
  trace: z.boolean().optional(),
});

const logger = createLogger('search-api-slug');

async function post(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const startTime = Date.now();

  try {
    // 1. Get search experience by slug
    const baseExperience = await repository.getSearchExperienceBySlug(slug);

    if (!baseExperience) {
      return apiResponse.notFound('Search experience not found');
    }

    if (!baseExperience.isActive) {
      return apiResponse.error(new AppError('Search experience is not active', { code: 'INACTIVE', status: 403 }), undefined, { operation: 'searchBySlug', slug });
    }

    const experience = await repository.getSearchExperienceWithIndexes(baseExperience.id);
    if (!experience) {
      return apiResponse.notFound('Search experience not found');
    }

    // 2. Authenticate: the experience's access token (real traffic) or an admin
    //    session (playground). Admin searches are recorded as 'admin_test', which
    //    analytics leaves out by default, and are not traced unless asked for.
    const { caller, refused, analyticsSource } = await authenticateTokenOrSession(request, searchExperienceAccess(experience));
    if (!caller) {
      return refused ?? apiResponse.unauthorized('Unauthorized');
    }
    const isAdmin = caller === 'admin';

    // 3. Parse and validate request body
    const body = await readJsonBody(request);
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
  if (error instanceof NoSourcesError) {
    return apiResponse.error(new AppError(error.message, { code: 'NO_INDEXES', status: 400 }), undefined, { operation: 'searchBySlug', slug });
  }
  if (error instanceof ZodError) return apiResponse.validationError(error);

  // A search error answers with its own status (SEARCH_ERROR_STATUS); provider failures
  // are explained to admins and given the plain public message here (apiResponse), which
  // logs it once
  return apiResponse.error(error, undefined, { operation: 'searchBySlug', slug });
}

export const POST = publicApiRoute(post);
