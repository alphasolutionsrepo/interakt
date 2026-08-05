// src/features/ingestion-keys/ingestion-key.types.ts

/**
 * Ingestion Key Types
 */

import type { IngestionKey, IngestionOperation } from '@/db/schema/ingestion-keys.schema';

export type { IngestionKey, IngestionOperation };

/**
 * A key with the indexes it is scoped to.
 */
export interface IngestionKeyWithIndexes extends IngestionKey {
    searchIndexIds: string[];
}

/**
 * A key as shown in the admin list.
 *
 * Deliberately omits keyHash — nothing outside the service needs it, and it
 * should not travel to a client even though it is only a hash.
 */
export interface IngestionKeySummary {
    id: string;
    name: string;
    /** Public half, safe to display, e.g. "ik_a1b2c3d4" */
    keyPrefix: string;
    operations: IngestionOperation[];
    searchIndexIds: string[];
    lastUsedAt: string | null;
    revokedAt: string | null;
    expiresAt: string | null;
    createdAt: string;
    /** False once revoked or expired */
    isActive: boolean;
}

/**
 * Result of creating a key.
 *
 * `plaintextKey` is the only time the full key exists outside the caller's
 * hands — it is not stored and cannot be recovered.
 */
export interface CreatedIngestionKey {
    key: IngestionKeySummary;
    plaintextKey: string;
}

/**
 * Why an authentication attempt failed.
 *
 * Split so the API can answer 401 for "we don't know you" and 403 for "we know
 * you but you may not do this", without leaking which indexes exist.
 */
export type IngestionAuthFailure =
    | 'missing'          // no Authorization: Bearer header
    | 'malformed'        // header present but not a well-formed ingestion key
    | 'unknown'          // prefix not found, or secret mismatch
    | 'revoked'
    | 'expired'
    | 'index-forbidden'  // valid key, not scoped to this index
    | 'operation-forbidden';

export interface IngestionAuthSuccess {
    success: true;
    key: IngestionKeyWithIndexes;
}

export interface IngestionAuthFailed {
    success: false;
    reason: IngestionAuthFailure;
}

export type IngestionAuthResult = IngestionAuthSuccess | IngestionAuthFailed;

/**
 * Narrow an auth result to its failure branch.
 *
 * An explicit guard rather than relying on `if (!result.success)`: this repo
 * compiles with `strict: false`, under which TypeScript does not narrow these
 * boolean-literal discriminants. The existing access-token middleware works
 * around the same limitation with a cast (`authResult as MiddlewareError`) — a
 * guard keeps it type-safe instead.
 */
export function isIngestionAuthFailure(
    result: IngestionAuthResult
): result is IngestionAuthFailed {
    return result.success === false;
}
