// src/features/search-experience/access-token.middleware.ts

/**
 * Access Token Middleware
 *
 * Handles authentication and authorization for public Search Experience APIs.
 * Validates access tokens, checks CORS origins, and enforces rate limits.
 */

import 'server-only';

import { NextRequest, NextResponse } from 'next/server';

import * as service from './search-experience.service';
import type { SearchExperienceWithIndexes } from './search-experience.types';

import {
  checkPublicAccess,
  isOriginAllowed,
  readAccessToken,
  searchExperienceAccess,
} from '@/features/auth/public-access';
import { apiResponse } from '@/shared/api/response';
import { createLogger } from '@/shared/logger/logger';

const logger = createLogger('access-token-middleware');

// ============================================================================
// TYPES
// ============================================================================

export interface AuthenticatedRequest extends NextRequest {
  searchExperience: SearchExperienceWithIndexes;
}

export interface MiddlewareResult {
  success: true;
  experience: SearchExperienceWithIndexes;
}

export interface MiddlewareError {
  success: false;
  response: NextResponse;
}

// ============================================================================
// MIDDLEWARE FUNCTION
// ============================================================================

/**
 * Authenticate request using access token
 *
 * Usage:
 * ```ts
 * const authResult = await authenticateAccessToken(request);
 * if (!authResult.success) {
 *   return authResult.response;
 * }
 * const { experience } = authResult;
 * ```
 */
export async function authenticateAccessToken(
  request: NextRequest,
): Promise<MiddlewareResult | MiddlewareError> {
  try {
    // 1. Extract access token
    const accessToken = readAccessToken(request);
    if (!accessToken) {
      logger.warn('Missing access token', {
        path: request.nextUrl.pathname,
        method: request.method,
      });

      return {
        success: false,
        response: apiResponse.unauthorized('Access token is required'),
      };
    }

    // 2. Look up experience by token
    let experience: SearchExperienceWithIndexes;
    try {
      experience = await service.getSearchExperienceByAccessToken(accessToken);
    } catch (error) {
      if (error instanceof service.UnauthorizedError) {
        logger.warn('Invalid access token', {
          path: request.nextUrl.pathname,
        });
        return {
          success: false,
          response: apiResponse.unauthorized('Invalid access token'),
        };
      }

      if (error instanceof service.ForbiddenError) {
        logger.warn('Search experience inactive', {
          path: request.nextUrl.pathname,
        });
        return {
          success: false,
          response: apiResponse.forbidden('This search experience is not active'),
        };
      }

      throw error;
    }

    // 3. The experience's allowed origins and rate limits
    const refused = checkPublicAccess(request, searchExperienceAccess(experience));
    if (refused) {
      return { success: false, response: refused };
    }

    // 4. Log successful authentication
    logger.debug('Access token authenticated', {
      experienceId: experience.id,
      experienceName: experience.name,
      path: request.nextUrl.pathname,
    });

    return {
      success: true,
      experience,
    };
  } catch (error) {
    logger.error('Access token authentication error', { error });

    return {
      success: false,
      response: apiResponse.internalError('Authentication failed'),
    };
  }
}

// ============================================================================
// CORS HEADERS HELPER
// ============================================================================

/**
 * Create CORS headers for response
 */
export function createCorsHeaders(
  experience: SearchExperienceWithIndexes,
  origin: string | null
): Headers {
  const headers = new Headers();

  // Set allowed origin
  if (origin && isOriginAllowed(experience.allowedOrigins ?? [], origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
  } else if (!experience.allowedOrigins || experience.allowedOrigins.length === 0) {
    headers.set('Access-Control-Allow-Origin', '*');
  }

  headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, X-Access-Token, Authorization');
  headers.set('Access-Control-Max-Age', '86400');

  return headers;
}

/**
 * Handle OPTIONS preflight request
 */
export function handleCorsPreflightWithExperience(
  experience: SearchExperienceWithIndexes,
  origin: string | null
): NextResponse {
  const headers = createCorsHeaders(experience, origin);
  return new NextResponse(null, { status: 204, headers });
}

/**
 * Handle OPTIONS preflight request (without experience - for when we can't validate token)
 */
export function handleCorsPreflight(): NextResponse {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Access-Token, Authorization',
      'Access-Control-Max-Age': '86400',
    },
  });
}

// ============================================================================
// WRAPPER HELPER
// ============================================================================

/**
 * Higher-order function to wrap API handlers with access token authentication
 *
 * Usage:
 * ```ts
 * export const POST = withAccessToken(async (request, experience) => {
 *   // Handler logic with authenticated experience
 *   return apiResponse.success({ ... });
 * });
 * ```
 */
export function withAccessToken(
  handler: (
    request: NextRequest,
    experience: SearchExperienceWithIndexes
  ) => Promise<NextResponse>,
) {
  return async (request: NextRequest): Promise<NextResponse> => {
    // Handle preflight
    if (request.method === 'OPTIONS') {
      return handleCorsPreflight();
    }

    // Authenticate
    const authResult = await authenticateAccessToken(request);
    if (!authResult.success) {
      return (authResult as MiddlewareError).response;
    }

    // Call handler
    const { experience } = authResult as MiddlewareResult;
    const response = await handler(request, experience);

    // Add CORS headers to response
    const origin = request.headers.get('origin');
    const corsHeaders = createCorsHeaders(experience, origin);
    corsHeaders.forEach((value, key) => {
      response.headers.set(key, value);
    });

    return response;
  };
}
