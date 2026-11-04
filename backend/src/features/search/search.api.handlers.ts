// src/features/search/search.api.handlers.ts

/**
 * Search Feature - API Handlers
 *
 * Handles HTTP request/response for search operations.
 * All business logic is delegated to the service layer.
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { apiResponse } from '@/shared/api/response';
import { getGlobalSearchConfig } from '@/features/global-settings';
import { withAnalyticsSource } from '@/features/analytics/analytics-source-context';
import { runWithTelemetryLevel } from '@/features/telemetry';
import * as searchService from './search.service';
import { searchRequestSchema } from './search.validation';
import type { SearchRequest } from './search.types';

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const searchByIdParamsSchema = z.object({
    id: z.string().uuid('Invalid search index ID format'),
});

const searchByNameParamsSchema = z.object({
    name: z.string().min(1, 'Index name is required'),
});

// ============================================================================
// SEARCH BY INDEX ID
// ============================================================================

/** Whether a playground request asked for its search to be traced (`trace: true`). */
function wantsTrace(body: unknown): boolean {
    return (body as { trace?: unknown } | null)?.trace === true;
}

/**
 * POST /api/search/index/:id
 * Search documents in a search index by ID
 *
 * For direct index searches (without Search Experience), we fetch
 * global hybrid search defaults to ensure consistent behavior.
 */
export async function handleSearchById(
    request: NextRequest,
    params: { id: string }
) {
    try {
        // Validate params
        const paramsValidation = searchByIdParamsSchema.safeParse(params);
        if (!paramsValidation.success) {
            return apiResponse.validationError(paramsValidation.error);
        }

        // Parse and validate request body
        const body = await request.json();
        const bodyValidation = searchRequestSchema.safeParse(body);

        if (!bodyValidation.success) {
            return apiResponse.validationError(bodyValidation.error);
        }

        // Get global search config for direct index searches
        // (Search Experience searches have their own hybridConfig populated)
        const globalConfig = await getGlobalSearchConfig();

        // Execute search - cast validated data to SearchRequest
        // (zod's inferred type differs slightly but query is validated as required)
        // Admin playground searches: untraced, or traced in full when asked for.
        // Its embedding calls are playground traffic too.
        const result = await runWithTelemetryLevel(wantsTrace(body) ? 'full' : 'off', () => withAnalyticsSource('playground', () =>
            searchService.searchById(
                paramsValidation.data.id,
                bodyValidation.data as SearchRequest,
                {
                    source: 'playground',
                    hybridConfig: globalConfig.hybridDefaults,
                    timeoutMs: globalConfig.timeout.timeoutMs,
                }
            )
        ));

        return apiResponse.success(result);
    } catch (error) {
        return handleSearchError(error, 'searchById');
    }
}

// ============================================================================
// SEARCH BY INDEX NAME
// ============================================================================

/**
 * POST /api/search/name/:name
 * Search documents in a search index by name
 *
 * For direct index searches (without Search Experience), we fetch
 * global hybrid search defaults to ensure consistent behavior.
 */
export async function handleSearchByName(
    request: NextRequest,
    params: { name: string }
) {
    try {
        // Validate params
        const paramsValidation = searchByNameParamsSchema.safeParse(params);
        if (!paramsValidation.success) {
            return apiResponse.validationError(paramsValidation.error);
        }

        // Parse and validate request body
        const body = await request.json();
        const bodyValidation = searchRequestSchema.safeParse(body);

        if (!bodyValidation.success) {
            return apiResponse.validationError(bodyValidation.error);
        }

        // Get global search config for direct index searches
        const globalConfig = await getGlobalSearchConfig();

        // Execute search - cast validated data to SearchRequest
        // Admin playground searches: untraced, or traced in full when asked for.
        // Its embedding calls are playground traffic too.
        const result = await runWithTelemetryLevel(wantsTrace(body) ? 'full' : 'off', () => withAnalyticsSource('playground', () =>
            searchService.searchByName(
                paramsValidation.data.name,
                bodyValidation.data as SearchRequest,
                {
                    source: 'playground',
                    hybridConfig: globalConfig.hybridDefaults,
                    timeoutMs: globalConfig.timeout.timeoutMs,
                }
            )
        ));

        return apiResponse.success(result);
    } catch (error) {
        return handleSearchError(error, 'searchByName');
    }
}

// ============================================================================
// GET SEARCH CONTEXT
// ============================================================================

/**
 * GET /api/search/index/:id/context
 * Get search context for an index (available fields, facets, etc.)
 */
export async function handleGetSearchContextById(
    _request: NextRequest,
    params: { id: string }
) {
    try {
        // Validate params
        const paramsValidation = searchByIdParamsSchema.safeParse(params);
        if (!paramsValidation.success) {
            return apiResponse.validationError(paramsValidation.error);
        }

        const context = await searchService.getSearchContext({
            id: paramsValidation.data.id,
        });

        // Convert Map to object for JSON serialization
        const serializedContext = {
            ...context,
            allFields: Object.fromEntries(context.allFields),
        };

        return apiResponse.success(serializedContext);
    } catch (error) {
        return handleSearchError(error, 'getSearchContextById');
    }
}

/**
 * GET /api/search/name/:name/context
 * Get search context for an index by name
 */
export async function handleGetSearchContextByName(
    _request: NextRequest,
    params: { name: string }
) {
    try {
        // Validate params
        const paramsValidation = searchByNameParamsSchema.safeParse(params);
        if (!paramsValidation.success) {
            return apiResponse.validationError(paramsValidation.error);
        }

        const context = await searchService.getSearchContext({
            name: paramsValidation.data.name,
        });

        // Convert Map to object for JSON serialization
        const serializedContext = {
            ...context,
            allFields: Object.fromEntries(context.allFields),
        };

        return apiResponse.success(serializedContext);
    } catch (error) {
        return handleSearchError(error, 'getSearchContextByName');
    }
}

// ============================================================================
// HEALTH CHECK
// ============================================================================

/**
 * GET /api/search/health
 * Check search service health
 */
export async function handleHealthCheck() {
    try {
        const isHealthy = await searchService.checkHealth();

        if (isHealthy) {
            return apiResponse.success({ status: 'healthy' });
        } else {
            return apiResponse.error('Search service is unhealthy', 503);
        }
    } catch (error) {
        return apiResponse.error('Search service health check failed', 503, { operation: 'healthCheck', err: error });
    }
}

// ============================================================================
// AUTOCOMPLETE
// ============================================================================

const autocompleteRequestSchema = z.object({
    query: z.string().min(1, 'Query is required'),
    maxSuggestions: z.number().int().min(1).max(20).optional(),
});

/**
 * POST /api/search/index/:id/autocomplete
 * Get autocomplete suggestions for an index by ID
 */
export async function handleAutocompleteById(
    request: NextRequest,
    params: { id: string }
) {
    try {
        // Validate params
        const paramsValidation = searchByIdParamsSchema.safeParse(params);
        if (!paramsValidation.success) {
            return apiResponse.validationError(paramsValidation.error);
        }

        // Parse and validate request body (may be empty if client aborted the request)
        let body: unknown;
        try {
            body = await request.json();
        } catch {
            return apiResponse.badRequest('Invalid or empty request body');
        }
        const bodyValidation = autocompleteRequestSchema.safeParse(body);

        if (!bodyValidation.success) {
            return apiResponse.validationError(bodyValidation.error);
        }

        // Execute autocomplete
        const result = await searchService.autocompleteById(
            paramsValidation.data.id,
            { query: bodyValidation.data.query, maxSuggestions: bodyValidation.data.maxSuggestions }
        );

        return apiResponse.success(result);
    } catch (error) {
        return handleSearchError(error, 'autocompleteById');
    }
}

/**
 * POST /api/search/name/:name/autocomplete
 * Get autocomplete suggestions for an index by name
 */
export async function handleAutocompleteByName(
    request: NextRequest,
    params: { name: string }
) {
    try {
        // Validate params
        const paramsValidation = searchByNameParamsSchema.safeParse(params);
        if (!paramsValidation.success) {
            return apiResponse.validationError(paramsValidation.error);
        }

        // Parse and validate request body (may be empty if client aborted the request)
        let body: unknown;
        try {
            body = await request.json();
        } catch {
            return apiResponse.badRequest('Invalid or empty request body');
        }
        const bodyValidation = autocompleteRequestSchema.safeParse(body);

        if (!bodyValidation.success) {
            return apiResponse.validationError(bodyValidation.error);
        }

        // Execute autocomplete
        const result = await searchService.autocompleteByName(
            paramsValidation.data.name,
            { query: bodyValidation.data.query, maxSuggestions: bodyValidation.data.maxSuggestions }
        );

        return apiResponse.success(result);
    } catch (error) {
        return handleSearchError(error, 'autocompleteByName');
    }
}

// ============================================================================
// ERROR HANDLING
// ============================================================================

/**
 * Handle search errors and return appropriate HTTP responses
 */
function handleSearchError(error: unknown, operation: string) {
    // The error itself: a search error answers with its own status (SEARCH_ERROR_STATUS),
    // and a provider failure is explained from its cause or hidden. apiResponse logs it
    // once, with the request id and the operation.
    return apiResponse.error(error, undefined, { operation });
}
