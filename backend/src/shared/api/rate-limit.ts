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

import { clientKey, limitFor, type ClientKey } from './client-ip';
import { apiResponse } from './response';

// ============================================================================
// TYPES
// ============================================================================

export interface RateLimitConfig {
  /** Max requests per window (default: 60) */
  maxRequests?: number;
  /** Window duration in milliseconds (default: 60_000 = 1 minute) */
  windowMs?: number;
  /**
   * Who a request is counted as (default: its client address, see clientKey). A shared key is
   * held to SHARED_LIMIT_FACTOR times maxRequests.
   *
   * null: this request is counted by a limit of its own elsewhere (the document routes'
   * failed-key-check limit), so this one doesn't count it. It gets no limit headers here.
   *
   * id: the route's own [id] (a search index, a data source), when it has one. The default
   * counts each id apart; a key function includes it only once it knows the id is one the
   * caller may use, so made-up ids share one count instead of adding one each.
   */
  keyFn?: (request: NextRequest, id?: string) => ClientKey | null | Promise<ClientKey | null>;
}

interface WindowEntry {
  count: number;
  windowStart: number;
  windowMs: number;
}

// ============================================================================
// STORE
// ============================================================================

const store = new Map<string, WindowEntry>();
let lastCleanup = Date.now();
const CLEANUP_INTERVAL = 60_000; // 1 minute
// Most entries held at once: past it, expired entries go first, then the short windows that
// started first, and long ones (a daily total) only when nothing else is left
const MAX_ENTRIES = 100_000;
let maxEntries = MAX_ENTRIES;
// Windows shorter than this are dropped before longer ones when the store is full
const SHORT_WINDOW_MS = 60 * 60_000;
// A full sweep when the store is full runs at most this often, so a flood can't make every new
// entry scan the whole store
const FULL_SWEEP_INTERVAL = 1_000;
let lastFullSweep = 0;

function cleanup(force = false): void {
  const now = Date.now();
  if (!force && now - lastCleanup < CLEANUP_INTERVAL) return;

  // Each entry goes once its own window is over (a minute, a day, …).
  for (const [key, entry] of store.entries()) {
    if (now - entry.windowStart >= entry.windowMs) {
      store.delete(key);
    }
  }
  lastCleanup = now;
}

/** Make room for one more entry when the store is full. */
function makeRoom(now: number): void {
  if (now - lastFullSweep >= FULL_SWEEP_INTERVAL) {
    lastFullSweep = now;
    cleanup(true);
  }
  // Map keeps insertion order, and a new window goes to the end: among windows of one length,
  // the first ones end soonest
  for (const [key, entry] of store) {
    if (store.size < maxEntries) return;
    if (entry.windowMs < SHORT_WINDOW_MS || now - entry.windowStart >= entry.windowMs) store.delete(key);
  }
  for (const key of store.keys()) {
    if (store.size < maxEntries) return;
    store.delete(key);
  }
}

// ============================================================================
// CORE RATE LIMITER
// ============================================================================

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

    // A new window goes to the end, so the Map's order stays the order windows started
    if (entry) store.delete(key);
    if (store.size >= maxEntries) makeRoom(now);
    store.set(key, { count: 1, windowStart: now, windowMs });
    return { allowed: true, remaining: maxRequests - 1 };
  },

  /** Change the most entries held (for testing); no argument restores the default. */
  setMaxEntries(max: number = MAX_ENTRIES): void {
    maxEntries = max;
  },

  /** Reset a specific key (for testing) */
  reset(identifier: string): void {
    store.delete(identifier);
  },

  /** Clear all entries (for testing) */
  clear(): void {
    store.clear();
    lastCleanup = 0;
    lastFullSweep = 0;
  },

  /** How many entries are held in memory (for testing) */
  size(): number {
    return store.size;
  },
};

// ============================================================================
// HANDLER WRAPPER
// ============================================================================

let routes = 0;

/** The default count: the client address, per id (the routes using it check access first). */
function clientKeyPerId(request: NextRequest, id?: string): ClientKey {
  const client = clientKey(request);
  return id ? { ...client, key: `${id}:${client.key}` } : client;
}

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
    keyFn = clientKeyPerId,
  } = config;

  // One count per wrapped handler (a route's method), not per URL: an id below the route's own
  // [id] in the path (a document, a span) would otherwise give each of those its own allowance.
  // Whether the route's own [id] is counted apart is up to keyFn
  const route = `route-${++routes}`;

  const wrapped = async (...args: Parameters<T>): Promise<NextResponse> => {
    const request = args[0] as NextRequest;
    const { id } = (await (args[1] as { params?: Promise<{ id?: unknown }> } | undefined)?.params) ?? {};
    const key = await keyFn(request, typeof id === 'string' ? id : undefined);
    if (key === null) return handler(...args);
    const limit = limitFor(key, maxRequests);
    const routeKey = `${route}:${key.key}`;

    const result = rateLimiter.check(routeKey, limit, windowMs);

    if (!result.allowed) {
      const refused = apiResponse.tooManyRequests(result.retryAfter ?? 60, 'Too many requests');
      refused.headers.set('X-RateLimit-Limit', String(limit));
      refused.headers.set('X-RateLimit-Remaining', '0');
      return refused;
    }

    const response = await handler(...args);

    // Add rate limit headers to successful responses
    response.headers.set('X-RateLimit-Limit', String(limit));
    response.headers.set('X-RateLimit-Remaining', String(result.remaining));

    return response;
  };

  return wrapped as T;
}
