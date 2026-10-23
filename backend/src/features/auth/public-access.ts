// src/features/auth/public-access.ts

/**
 * Access settings for the public experience API (`/api/v1/...`).
 *
 * Every route that accepts an experience's access token applies that experience's
 * settings here, in one place:
 * - allowed origins: when the list is set, web pages on other sites may not call; an
 *   empty list allows any site.
 * - rate limits: requests per minute for each client, and for AI experiences a total
 *   of chat messages per day for the experience (widget setup calls don't count).
 *
 * Interakt's own pages (the admin's widget previews) are always allowed.
 *
 * Limits are counted in memory per server instance (see SECURITY.md).
 */

import 'server-only';

import { NextResponse, type NextRequest } from 'next/server';

import { clientIp } from '@/shared/api/client-ip';
import { rateLimiter } from '@/shared/api/rate-limit';
import { apiResponse } from '@/shared/api/response';
import { createLogger } from '@/shared/logger/logger';

const logger = createLogger('public-access');

/** What one experience allows. */
export interface AccessPolicy {
  /** Sites allowed to call; empty allows any site. */
  allowedOrigins: string[];
  /** Requests per minute for each client. */
  perMinute: number;
  /** Requests per day for the whole experience (AI experiences: chat messages); unset means no daily total. */
  perDay?: number;
}

export interface AccessCheckOptions {
  /**
   * Setup calls (widget settings) aren't counted: every page with the widget makes one, and
   * they do no AI work. Allowed origins still apply.
   */
  setup?: boolean;
}

const DEFAULT_PER_MINUTE = 60;
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

// ============================================================================
// POLICIES
// ============================================================================

/** The experience being called, as far as access is concerned. */
export interface ExperienceAccess {
  /** Identifies the experience for rate limits; every route for one experience shares it. */
  scope: string;
  accessToken: string | null | undefined;
  policy: AccessPolicy;
}

/** A search experience. Searches, autocomplete, AI summaries and document reads count against searchPerMinute. */
export function searchExperienceAccess(experience: {
  id: string;
  accessToken?: string | null;
  allowedOrigins?: string[] | null;
  rateLimitConfig?: { searchPerMinute?: number } | null;
}): ExperienceAccess {
  return {
    scope: `search:${experience.id}`,
    accessToken: experience.accessToken,
    policy: {
      allowedOrigins: experience.allowedOrigins ?? [],
      perMinute: experience.rateLimitConfig?.searchPerMinute ?? DEFAULT_PER_MINUTE,
    },
  };
}

/** An AI experience, from its access configuration. */
export function aiExperienceAccess(experience: {
  id: string;
  accessToken?: string | null;
  accessConfig?: { allowedOrigins?: string[]; rateLimits?: { chatPerMinute?: number; requestsPerDay?: number } } | null;
}): ExperienceAccess {
  const access = experience.accessConfig;
  return {
    scope: `ai:${experience.id}`,
    accessToken: experience.accessToken,
    policy: {
      allowedOrigins: access?.allowedOrigins ?? [],
      perMinute: access?.rateLimits?.chatPerMinute ?? DEFAULT_PER_MINUTE,
      perDay: access?.rateLimits?.requestsPerDay,
    },
  };
}

// ============================================================================
// REQUEST DETAILS
// ============================================================================

/** The access token from `X-Access-Token` or `Authorization: Bearer`; '' when there is none. */
export function readAccessToken(request: NextRequest): string {
  const header = request.headers.get('x-access-token');
  if (header?.trim()) return header.trim();
  const authorization = request.headers.get('authorization') ?? '';
  return authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
}

/**
 * Whether a calling site may use an experience. Browsers name the calling site in
 * Origin; requests without one (servers, apps) aren't from a web page and are allowed,
 * leaving them to the rate limits.
 */
export function isOriginAllowed(allowedOrigins: string[], origin: string | null): boolean {
  if (allowedOrigins.length === 0 || origin === null) return true;
  return allowedOrigins.some((entry) => asOrigin(entry) === origin);
}

/** A saved entry as the browser names a site, so 'https://shop.example/' matches 'https://shop.example'. */
function asOrigin(entry: string): string {
  try {
    return new URL(entry).origin;
  } catch {
    return entry;
  }
}

/**
 * Whether the request comes from a page on this Interakt (the admin's widget previews).
 * The browser sets Sec-Fetch-Site itself; pages can't.
 */
function isFromOwnPage(request: NextRequest): boolean {
  return request.headers.get('sec-fetch-site') === 'same-origin';
}

/**
 * The address this Interakt is reached at, as the browser sees it (behind a proxy too).
 * Built from request headers, so it's for building links, not for access decisions.
 */
export function publicOrigin(request: NextRequest): string {
  const forwardedProto = request.headers.get('x-forwarded-proto');
  const forwardedHost = request.headers.get('x-forwarded-host');
  if (forwardedProto && forwardedHost) return `${forwardedProto}://${forwardedHost}`;
  return request.nextUrl.origin;
}

// ============================================================================
// THE CHECK
// ============================================================================

/**
 * Apply an experience's settings to a request.
 *
 * @returns null when the request may go ahead, otherwise the 403 or 429 response to send
 */
export function checkPublicAccess(
  request: NextRequest,
  { scope, policy }: Pick<ExperienceAccess, 'scope' | 'policy'>,
  options: AccessCheckOptions = {},
): NextResponse | null {
  const origin = request.headers.get('origin');
  if (
    !isFromOwnPage(request)
    && !isOriginAllowed(policy.allowedOrigins, origin)
  ) {
    logger.warn('Origin not allowed', { scope, origin });
    return apiResponse.forbidden('Origin not allowed');
  }

  if (options.setup) return null;

  const client = clientIp(request);
  let { retryAfter } = rateLimiter.check(`${scope}:${client}:minute`, policy.perMinute, MINUTE);
  let limit = 'per-minute';
  // The daily total is checked only for requests the per-client limit lets through.
  if (!retryAfter && policy.perDay) {
    ({ retryAfter } = rateLimiter.check(`${scope}:day`, policy.perDay, DAY));
    limit = 'daily';
  }

  if (retryAfter) {
    logger.warn(limit === 'daily' ? 'Daily total reached' : 'Rate limit exceeded', { scope, client, retryAfter });
    return NextResponse.json(
      { success: false, error: 'Rate limit exceeded', code: 'RATE_LIMIT_EXCEEDED', retryAfter },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
    );
  }
  return null;
}
