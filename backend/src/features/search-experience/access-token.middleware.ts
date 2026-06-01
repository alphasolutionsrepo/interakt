// src/features/search-experience/access-token.middleware.ts

/**
 * Access Token Middleware
 *
 * Handles authentication and authorization for public Search Experience APIs.
 * Validates access tokens, checks CORS origins, and enforces rate limits.
 */

import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/shared/logger/logger';
import { apiResponse } from '@/shared/api/response';
import * as service from './search-experience.service';
import type { SearchExperienceWithIndexes } from './search-experience.types';

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
// RATE LIMITING (Simple in-memory implementation)
// ============================================================================

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

// In-memory rate limit store (replace with Redis in production)
const rateLimitStore = new Map<string, RateLimitEntry>();

// Clean up old entries periodically
const CLEANUP_INTERVAL = 60 * 1000; // 1 minute
let lastCleanup = Date.now();

function cleanupRateLimitStore(): void {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;

  const oneHourAgo = now - 60 * 60 * 1000;
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.windowStart < oneHourAgo) {
      rateLimitStore.delete(key);
    }
  }
  lastCleanup = now;
}

function checkRateLimit(
  experienceId: string,
  clientIp: string,
  config?: { searchPerMinute?: number; chatPerMinute?: number }
): { allowed: boolean; retryAfter?: number } {
  cleanupRateLimitStore();

  // Use searchPerMinute from config, default to 60
  const requestsPerMinute = config?.searchPerMinute ?? 60;
  const requestsPerHour = (config?.searchPerMinute ?? 60) * 60; // Derive hourly from per-minute

  const now = Date.now();
  const minuteKey = `${experienceId}:${clientIp}:minute`;
  const hourKey = `${experienceId}:${clientIp}:hour`;

  // Check minute limit
  const minuteEntry = rateLimitStore.get(minuteKey);
  const minuteWindowStart = now - 60 * 1000;

  if (minuteEntry && minuteEntry.windowStart > minuteWindowStart) {
    if (minuteEntry.count >= requestsPerMinute) {
      const retryAfter = Math.ceil((minuteEntry.windowStart + 60 * 1000 - now) / 1000);
      return { allowed: false, retryAfter };
    }
    minuteEntry.count++;
  } else {
    rateLimitStore.set(minuteKey, { count: 1, windowStart: now });
  }

  // Check hour limit
  const hourEntry = rateLimitStore.get(hourKey);
  const hourWindowStart = now - 60 * 60 * 1000;

  if (hourEntry && hourEntry.windowStart > hourWindowStart) {
    if (hourEntry.count >= requestsPerHour) {
      const retryAfter = Math.ceil((hourEntry.windowStart + 60 * 60 * 1000 - now) / 1000);
      return { allowed: false, retryAfter };
    }
    hourEntry.count++;
  } else {
    rateLimitStore.set(hourKey, { count: 1, windowStart: now });
  }

  return { allowed: true };
}

// ============================================================================
// TOKEN EXTRACTION
// ============================================================================

const ACCESS_TOKEN_HEADER = 'x-access-token';
const AUTHORIZATION_HEADER = 'authorization';

function extractAccessToken(request: NextRequest): string | null {
  // Try X-Access-Token header first
  const xAccessToken = request.headers.get(ACCESS_TOKEN_HEADER);
  if (xAccessToken) {
    return xAccessToken;
  }

  // Try Authorization header with Bearer scheme
  const authorization = request.headers.get(AUTHORIZATION_HEADER);
  if (authorization?.startsWith('Bearer ')) {
    return authorization.slice(7);
  }

  return null;
}

// ============================================================================
// CORS VALIDATION
// ============================================================================

function getClientIp(request: NextRequest): string {
  // Try common proxy headers
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }

  const realIp = request.headers.get('x-real-ip');
  if (realIp) {
    return realIp;
  }

  // Fallback to connection info (if available)
  return 'unknown';
}

function validateCorsOrigin(
  experience: SearchExperienceWithIndexes,
  origin: string | null
): boolean {
  return service.validateOrigin(experience, origin);
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
  options: {
    validateOrigin?: boolean;
    checkRateLimit?: boolean;
  } = {}
): Promise<MiddlewareResult | MiddlewareError> {
  const { validateOrigin: shouldValidateOrigin = true, checkRateLimit: shouldCheckRateLimit = true } = options;

  try {
    // 1. Extract access token
    const accessToken = extractAccessToken(request);
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

    // 3. Validate CORS origin (if enabled)
    if (shouldValidateOrigin) {
      const origin = request.headers.get('origin');
      if (!validateCorsOrigin(experience, origin)) {
        logger.warn('CORS origin rejected', {
          experienceId: experience.id,
          origin,
          allowedOrigins: experience.allowedOrigins,
        });

        return {
          success: false,
          response: apiResponse.forbidden('Origin not allowed'),
        };
      }
    }

    // 4. Check rate limit (if enabled)
    if (shouldCheckRateLimit) {
      const clientIp = getClientIp(request);
      const rateLimitResult = checkRateLimit(
        experience.id,
        clientIp,
        experience.rateLimitConfig ?? undefined
      );

      if (!rateLimitResult.allowed) {
        logger.warn('Rate limit exceeded', {
          experienceId: experience.id,
          clientIp,
          retryAfter: rateLimitResult.retryAfter,
        });

        return {
          success: false,
          response: NextResponse.json(
            {
              success: false,
              error: 'Rate limit exceeded',
              code: 'RATE_LIMIT_EXCEEDED',
              retryAfter: rateLimitResult.retryAfter,
            },
            {
              status: 429,
              headers: {
                'Retry-After': String(rateLimitResult.retryAfter ?? 60),
              },
            }
          ),
        };
      }
    }

    // 5. Log successful authentication
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
  if (origin && validateCorsOrigin(experience, origin)) {
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
  options: {
    validateOrigin?: boolean;
    checkRateLimit?: boolean;
  } = {}
) {
  return async (request: NextRequest): Promise<NextResponse> => {
    // Handle preflight
    if (request.method === 'OPTIONS') {
      return handleCorsPreflight();
    }

    // Authenticate
    const authResult = await authenticateAccessToken(request, options);
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
