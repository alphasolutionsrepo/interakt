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
import { apiResponse } from '@/shared/api/response';
import { readJsonBody } from '@/shared/api/read-json-body';
import { AppError } from '@/shared/errors/app-error';
import { withAnalyticsSource } from '@/features/analytics/analytics-source-context';
import { analyticsSourceOfTokenCaller } from '@/features/auth/token-or-session';
import {
  authenticateAccessToken,
  createCorsHeaders,
  handleCorsPreflight,
  withCors,
} from './access-token.middleware';
import { publicSearchRequestSchema, autocompleteRequestSchema } from './search-experience.schemas';
import type {
  SearchExperienceWithIndexes,
  PublicSearchRequest,
  PublicSearchResponse,
} from './search-experience.types';
import * as autocompleteService from './autocomplete.service';
import { executeExperienceSearch, NoSourcesError } from './experience-search';

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
    const body = await readJsonBody(request);
    const validated = publicSearchRequestSchema.parse(body) as PublicSearchRequest;

    // 3–6. Search every source the experience uses and merge the results
    // (the admin's own Widget playground is test traffic, its AI calls too)
    const source = await analyticsSourceOfTokenCaller(request);
    const { results, sourcesSearched, failedSources } = await withAnalyticsSource(source, () =>
      executeExperienceSearch(experience, validated, { source }));

    // 7. Build response
    const response: PublicSearchResponse = {
      results: results.hits,
      total: results.total,
      pagination: results.pagination,
      facets: results.facets,
      took: Date.now() - startTime,
      searchExperienceId: experience.id,
      indexesSearched: sourcesSearched,
      // Include display configuration for frontend rendering
      displayConfig: experience.displayConfig ?? undefined,
      // A source failed while others answered
      ...(failedSources.length > 0 && { partial: true }),
    };

    logger.info('Public search completed', {
      experienceId: experience.id,
      query: validated.query.substring(0, 50),
      indexCount: sourcesSearched.length,
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
 * Handle search errors and return appropriate response
 */
function handleSearchError(
  error: unknown,
  experience: SearchExperienceWithIndexes,
  origin: string | null
): NextResponse {
  if (error instanceof NoSourcesError) {
    return withCors(apiResponse.error(new AppError(error.message, { code: 'NO_INDEXES', status: 400 }), undefined, { operation: 'publicSearch', experienceId: experience.id }), experience, origin);
  }

  if (error instanceof ZodError) return withCors(apiResponse.validationError(error), experience, origin);
  // A search error answers with its own status (SEARCH_ERROR_STATUS); a server failure
  // gets the plain public message and a request id (apiResponse), which logs it once
  return withCors(apiResponse.error(error, undefined, { operation: 'publicSearch', experienceId: experience.id }), experience, origin);
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
    const body = await readJsonBody(request);
    const validated = autocompleteRequestSchema.parse(body);

    // 3. Check if autocomplete is enabled
    const autocompleteConfig = experience.searchConfig?.autocomplete;
    if (!autocompleteConfig?.enabled) {
      return withCors(
        apiResponse.error(new AppError('Autocomplete is not enabled for this search experience', { code: 'AUTOCOMPLETE_DISABLED', status: 400 }), undefined, { operation: 'autocomplete', experienceId: experience.id }),
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
    // Zod validation error
    if (error instanceof ZodError) {
      return withCors(apiResponse.validationError(error), experience, origin);
    }

    // Logged once by apiResponse
    return withCors(apiResponse.error(error, undefined, { operation: 'autocomplete', experienceId: experience.id }), experience, origin);
  }
}
