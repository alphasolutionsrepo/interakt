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
import { apiResponse } from '@/shared/api/response';
import { createLogger } from '@/shared/logger/logger';
import { parseKey, verifyIngestionKey } from './ingestion-key.service';
import { isIngestionAuthFailure } from './ingestion-key.types';
import type {
    IngestionAuthFailure,
    IngestionKeyWithIndexes,
    IngestionOperation,
} from './ingestion-key.types';

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

/**
 * Rate-limit identity for a request.
 *
 * Uses the presented key's public prefix, which identifies the caller without a
 * database lookup (keyFn is synchronous) and cannot be forged without the real
 * key. Contrast the default IP-based key, which `x-forwarded-for` makes
 * trivially spoofable.
 *
 * Session requests fall back to the client IP — the admin UI is low-volume, and
 * resolving a session is async.
 */
export function ingestionRateLimitKey(request: NextRequest): string {
    const presented = extractBearer(request);
    const parsed = presented ? parseKey(presented) : null;

    if (parsed) {
        return `key:${parsed.keyPrefix}`;
    }

    const forwarded = request.headers.get('x-forwarded-for');
    const ip = forwarded?.split(',')[0].trim()
        || request.headers.get('x-real-ip')
        || 'unknown';

    return `ip:${ip}`;
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

    const result = await verifyIngestionKey(presented, requirement);

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
