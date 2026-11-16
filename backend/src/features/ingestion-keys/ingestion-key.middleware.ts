// src/features/ingestion-keys/ingestion-key.middleware.ts

/**
 * Ingestion Key Middleware
 *
 * Authenticates server-to-server document writes.
 *
 * Note what this deliberately does NOT do, compared with
 * search-experience/access-token.middleware.ts:
 * - It does not read `X-Access-Token`. Only `Authorization: Bearer` is accepted,
 *   so a public widget token can never be mistaken for an ingestion key.
 * - It attaches no CORS headers. Ingestion is server-to-server; making these
 *   endpoints browser-reachable would invite putting a secret key in a page.
 */

import 'server-only';

import type { NextRequest, NextResponse } from 'next/server';

import { identifyIngestionKey, isKeyLive, verifyIngestionKey } from './ingestion-key.service';
import { isIngestionAuthFailure } from './ingestion-key.types';
import type {
    IngestionAuthFailure,
    IngestionAuthResult,
    IngestionKeyWithIndexes,
    IngestionOperation,
} from './ingestion-key.types';

import { clientKey, clientLabel, limitFor, type ClientKey } from '@/shared/api/client-ip';
import { rateLimiter } from '@/shared/api/rate-limit';
import { apiResponse } from '@/shared/api/response';
import { createLogger } from '@/shared/logger/logger';

const logger = createLogger('ingestion-key-middleware');

const AUTHORIZATION_HEADER = 'authorization';
const BEARER_PREFIX = 'Bearer ';

/**
 * Whether a request is even attempting ingestion-key auth.
 *
 * Used by callers to decide between the key path and the session path without
 * running a lookup.
 */
export function hasBearerCredentials(request: NextRequest): boolean {
    const header = request.headers.get(AUTHORIZATION_HEADER);
    return !!header && header.startsWith(BEARER_PREFIX);
}

function extractBearer(request: NextRequest): string | null {
    const header = request.headers.get(AUTHORIZATION_HEADER);
    if (!header?.startsWith(BEARER_PREFIX)) return null;
    return header.slice(BEARER_PREFIX.length).trim() || null;
}

/** Failed key checks allowed per client address in a window, across the document routes. */
export const FAILED_KEY_CHECKS = { maxRequests: 20, windowMs: 60_000 } as const;

type Identity = IngestionAuthResult | { success: false; throttled: { retryAfter: number } };

// One identification per request, shared by the rate limit, the route guard, the built-in
// check and the handler (they all get the same request object)
const identities = new WeakMap<object, Promise<Identity>>();

// Key lookups in flight per client (by failed-check count), so a burst can't run more lookups
// than the client has failed checks left
const inFlight = new Map<string, Set<Promise<unknown>>>();

/**
 * Which key the request presents, looked up once per request. A client with FAILED_KEY_CHECKS
 * failures (no such key, wrong secret, revoked or expired) in the window is refused before its
 * key is looked up. At most as many lookups as it has failures left run at once; requests past
 * that wait for one to finish and check again, so a parallel burst of wrong keys can't get more
 * lookups than the limit, and a server's own parallel requests only wait. Requests without a
 * trusted address share one count at a higher limit (see clientKey).
 */
function identify(request: NextRequest, presented: string): Promise<Identity> {
    let identity = identities.get(request);
    if (!identity) {
        identity = (async (): Promise<Identity> => {
            const client = clientKey(request);
            const failures = `ingestion-key-failures:${client.key}`;
            const maxRequests = limitFor(client, FAILED_KEY_CHECKS.maxRequests);
            const { windowMs } = FAILED_KEY_CHECKS;
            for (;;) {
                const left = maxRequests - rateLimiter.count(failures);
                if (left <= 0) return { success: false, throttled: { retryAfter: rateLimiter.retryAfter(failures) || 60 } };
                const running = inFlight.get(failures);
                if (!running || running.size < left) break;
                await Promise.race(running).catch(() => undefined);
            }
            const lookup = identifyIngestionKey(presented);
            const running = inFlight.get(failures) ?? new Set<Promise<unknown>>();
            inFlight.set(failures, running);
            running.add(lookup);
            let result: IngestionAuthResult;
            try {
                result = await lookup;
            } finally {
                running.delete(lookup);
                if (running.size === 0) inFlight.delete(failures);
            }
            if (isIngestionAuthFailure(result) || !isKeyLive(result.key)) {
                const counted = rateLimiter.check(failures, maxRequests, windowMs);
                // Once per window, when the client uses up its last failed check
                if (counted.allowed && counted.remaining === 0) {
                    logger.warn('A client reached the failed ingestion key check limit', {
                        client: clientLabel(client),
                        limit: maxRequests,
                        windowMs,
                    });
                }
            }
            return result;
        })();
        identities.set(request, identity);
    }
    return identity;
}

/**
 * Rate-limit identity for a document request: a live key is counted on its own (`key:<id>`),
 * so nobody else can spend its allowance, and per index for the indexes it may use; a request
 * with any other key is left to the failed-check limit per client (null); a request without a
 * key (an admin session) is counted by its client address, or with the requests that have none
 * (see clientKey). This limit runs before the access checks, so an index id the caller may not
 * use is left out of the count: made-up ids share one count instead of adding one each.
 */
export async function ingestionRateLimitKey(request: NextRequest, indexId?: string): Promise<ClientKey | null> {
    const presented = extractBearer(request);
    if (!presented) {
        const client = clientKey(request);
        return { ...client, key: `ip:${client.key}` };
    }
    let identity: Identity;
    try {
        identity = await identify(request, presented);
    } catch {
        // The lookup failed (database down): the route's own key check meets the same error
        // and answers it as an error, logged
        return null;
    }
    if (!identity.success || !isKeyLive(identity.key)) return null;
    const { id, searchIndexIds } = identity.key;
    return { key: indexId && searchIndexIds.includes(indexId) ? `key:${id}:${indexId}` : `key:${id}`, shared: false };
}

/**
 * Map a failure to a response.
 *
 * Identity problems are 401; authorization problems are 403. Both use messages
 * that reveal nothing about which indexes or keys exist — these endpoints are
 * internet-facing, and a precise error is an enumeration oracle.
 */
function toErrorResponse(reason: IngestionAuthFailure): NextResponse {
    switch (reason) {
        case 'missing':
            return apiResponse.unauthorized(
                'Authentication required. Send an ingestion key as "Authorization: Bearer <key>".'
            );
        case 'malformed':
        case 'unknown':
            return apiResponse.unauthorized('Invalid ingestion key');
        case 'revoked':
            return apiResponse.unauthorized('This ingestion key has been revoked');
        case 'expired':
            return apiResponse.unauthorized('This ingestion key has expired');
        case 'index-forbidden':
        case 'operation-forbidden':
            return apiResponse.forbidden(
                'This ingestion key is not permitted to perform that operation'
            );
    }
}

export interface IngestionKeyAuthSuccess {
    success: true;
    key: IngestionKeyWithIndexes;
    response?: undefined;
}

export interface IngestionKeyAuthError {
    success: false;
    key?: undefined;
    response: NextResponse;
}

/**
 * Authenticate an ingestion key and check it may act on an index.
 *
 * @param requirement.operation - omit for read-only access; being scoped to the
 *   index is sufficient to read from it.
 */
export async function authenticateIngestionKey(
    request: NextRequest,
    requirement: { searchIndexId: string; operation?: IngestionOperation }
): Promise<IngestionKeyAuthSuccess | IngestionKeyAuthError> {
    const presented = extractBearer(request);

    if (!presented) {
        return { success: false, response: toErrorResponse('missing') };
    }

    const identity = await identify(request, presented);
    if ('throttled' in identity) {
        return { success: false, response: apiResponse.tooManyRequests(identity.throttled.retryAfter, 'Too many failed ingestion key checks') };
    }
    const result = await verifyIngestionKey(presented, requirement, identity);

    if (isIngestionAuthFailure(result)) {
        // Log the reason server-side even though the client gets a vague message
        logger.warn('Ingestion key authentication failed', {
            reason: result.reason,
            searchIndexId: requirement.searchIndexId,
            operation: requirement.operation,
        });
        return { success: false, response: toErrorResponse(result.reason) };
    }

    return { success: true, key: result.key };
}
