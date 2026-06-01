// src/shared/api/rate-limit.ts

/**
 * Generic Rate Limiter for API Routes
 *
 * In-memory sliding window rate limiter.
 * Can be applied to any Next.js API route handler.
 *
 * Usage:
 * ```ts
 * import { withRateLimit, rateLimiter } from '@/shared/api/rate-limit';
 *
 * // Option 1: Wrap a handler
 * export const GET = withRateLimit(handler, { maxRequests: 30, windowMs: 60_000 });
 *
 * // Option 2: Check inside a handler
 * const result = rateLimiter.check(identifier);
 * if (!result.allowed) return apiResponse.tooManyRequests(result.retryAfter);
 * ```
 */

import { NextRequest, NextResponse } from 'next/server';

// ============================================================================
// TYPES
// ============================================================================

export interface RateLimitConfig {
  /** Max requests per window (default: 60) */
  maxRequests?: number;
  /** Window duration in milliseconds (default: 60_000 = 1 minute) */
  windowMs?: number;
  /** Function to extract identifier from request (default: IP address) */
  keyFn?: (request: NextRequest) => string;
}

interface WindowEntry {
  count: number;
  windowStart: number;
}

// ============================================================================
// STORE
// ============================================================================

const store = new Map<string, WindowEntry>();
let lastCleanup = Date.now();
const CLEANUP_INTERVAL = 60_000; // 1 minute

function cleanup(): void {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;

  const cutoff = now - 10 * 60_000; // Remove entries older than 10 minutes
  for (const [key, entry] of store.entries()) {
    if (entry.windowStart < cutoff) {
      store.delete(key);
    }
  }
  lastCleanup = now;
}

// ============================================================================
// CORE RATE LIMITER
// ============================================================================

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'unknown'
  );
}

export const rateLimiter = {
  /**
   * Check if a request is within the rate limit.
   */
  check(
    identifier: string,
    maxRequests: number = 60,
    windowMs: number = 60_000
  ): { allowed: boolean; retryAfter?: number; remaining: number } {
    cleanup();

    const now = Date.now();
    const key = identifier;
    const entry = store.get(key);

    if (entry && now - entry.windowStart < windowMs) {
      if (entry.count >= maxRequests) {
        const retryAfter = Math.ceil((entry.windowStart + windowMs - now) / 1000);
        return { allowed: false, retryAfter, remaining: 0 };
      }
      entry.count++;
      return { allowed: true, remaining: maxRequests - entry.count };
    }

    store.set(key, { count: 1, windowStart: now });
    return { allowed: true, remaining: maxRequests - 1 };
  },

  /** Reset a specific key (for testing) */
  reset(identifier: string): void {
    store.delete(identifier);
  },

  /** Clear all entries (for testing) */
  clear(): void {
    store.clear();
  },
};

// ============================================================================
// HANDLER WRAPPER
// ============================================================================

/**
 * Wrap a Next.js API route handler with rate limiting.
 *
 * @example
 * export const GET = withRateLimit(myHandler, { maxRequests: 30 });
 */
export function withRateLimit<T extends (...args: never[]) => Promise<NextResponse>>(
  handler: T,
  config: RateLimitConfig = {}
): T {
  const {
    maxRequests = 60,
    windowMs = 60_000,
    keyFn = getClientIp,
  } = config;

  const wrapped = async (...args: Parameters<T>): Promise<NextResponse> => {
    const request = args[0] as NextRequest;
    const identifier = keyFn(request);
    const routeKey = `${request.method}:${request.nextUrl.pathname}:${identifier}`;

    const result = rateLimiter.check(routeKey, maxRequests, windowMs);

    if (!result.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: 'Too many requests',
          code: 'RATE_LIMIT_EXCEEDED',
          retryAfter: result.retryAfter,
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(result.retryAfter ?? 60),
            'X-RateLimit-Limit': String(maxRequests),
            'X-RateLimit-Remaining': '0',
          },
        }
      );
    }

    const response = await handler(...args);

    // Add rate limit headers to successful responses
    response.headers.set('X-RateLimit-Limit', String(maxRequests));
    response.headers.set('X-RateLimit-Remaining', String(result.remaining));

    return response;
  };

  return wrapped as T;
}
