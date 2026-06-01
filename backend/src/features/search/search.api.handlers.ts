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
import { createLogger } from '@/shared/logger/logger';
import { getGlobalSearchConfig } from '@/features/global-settings';
import * as searchService from './search.service';
import { searchRequestSchema } from './search.validation';
import { SearchError } from './search.types';
import type { SearchRequest } from './search.types';

const logger = createLogger('search-handlers');

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
        const result = await searchService.searchById(
            paramsValidation.data.id,
            bodyValidation.data as SearchRequest,
            {
                source: 'playground',
                hybridConfig: globalConfig.hybridDefaults,
                timeoutMs: globalConfig.timeout.timeoutMs,
            }
        );

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
        const result = await searchService.searchByName(
            paramsValidation.data.name,
            bodyValidation.data as SearchRequest,
            {
                source: 'playground',
                hybridConfig: globalConfig.hybridDefaults,
                timeoutMs: globalConfig.timeout.timeoutMs,
            }
        );

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
        return handleSearchError(error, 'getSearchContext');
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
        return handleSearchError(error, 'getSearchContext');
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
        logger.error('Health check failed', {
            error: error instanceof Error ? error.message : 'Unknown error',
        });
        return apiResponse.error('Search service health check failed', 503);
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
    if (error instanceof SearchError) {
        logger.warn(`Search error in ${operation}`, {
            code: error.code,
            message: error.message,
            details: error.details,
        });

        switch (error.code) {
            case 'INDEX_NOT_FOUND':
                return apiResponse.notFound(error.message);

            case 'INDEX_NOT_READY':
                return apiResponse.error(error.message, 503);

            case 'INVALID_QUERY':
            case 'INVALID_FILTER':
            case 'INVALID_FACET':
            case 'INVALID_SORT':
                return apiResponse.badRequest(error.message);

            case 'FIELD_NOT_FOUND':
            case 'FIELD_NOT_SEARCHABLE':
            case 'FIELD_NOT_FACETABLE':
                return apiResponse.badRequest(error.message);

            case 'EMBEDDING_FAILED':
                return apiResponse.error(
                    'Failed to generate query embedding for semantic search',
                    500
                );

            case 'PROVIDER_ERROR':
            case 'TIMEOUT':
                return apiResponse.error(error.message, 500);

            default:
                return apiResponse.error(error.message, 500);
        }
    }

    // Log unexpected errors
    logger.error(`Unexpected error in ${operation}`, {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
    });

    return apiResponse.error(
        error instanceof Error ? error.message : 'An unexpected error occurred',
        500
    );
}
