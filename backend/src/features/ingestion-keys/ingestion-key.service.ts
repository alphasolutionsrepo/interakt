// src/features/ingestion-keys/ingestion-key.service.ts

/**
 * Ingestion Key Service
 *
 * Generation, verification, and lifecycle for server-to-server write credentials.
 */

import 'server-only';

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import * as repository from './ingestion-key.repository';
import { isIngestionAuthFailure } from './ingestion-key.types';
import type {
    CreatedIngestionKey,
    IngestionAuthResult,
    IngestionKeySummary,
    IngestionKeyWithIndexes,
    IngestionOperation,
} from './ingestion-key.types';

import { memoryCacheStore } from '@/shared/cache/cache-store';
import { createLogger } from '@/shared/logger/logger';

const logger = createLogger('ingestion-key-service');

// ============================================================================
// KEY FORMAT
// ============================================================================

/**
 * Marker so a key is recognisable on sight — in a log, an env file, or a leaked
 * commit — and distinguishable from a search access token (a bare UUID).
 */
const KEY_MARKER = 'ik';

/**
 * Bytes of randomness in the public prefix. 6 bytes → 12 hex chars.
 *
 * Hex, not base64url: the prefix sits between the two separators, so it must not
 * be able to contain an underscore — and `_` is in the base64url alphabet.
 */
const PREFIX_BYTES = 6;

/** Bytes of randomness in the secret. 32 bytes → 43 base64url chars, 256 bits. */
const SECRET_BYTES = 32;

/** A valid prefix body: hex only, so parsing is unambiguous. */
const PREFIX_BODY_PATTERN = /^[0-9a-f]+$/;

/**
 * `ik_<prefix>_<secret>`
 *
 * The prefix is stored in the clear and indexed; the secret is only ever stored
 * as a SHA-256 hash. Splitting them is what makes a hashed credential usable —
 * you cannot look a row up by its hash.
 */
export interface ParsedKey {
    keyPrefix: string;
    secret: string;
}

/**
 * Parse a presented key without throwing.
 *
 * Returns null for anything that is not well-formed, so a malformed header is
 * indistinguishable to the caller from an unknown key.
 */
export function parseKey(presented: string): ParsedKey | null {
    const trimmed = presented.trim();
    if (!trimmed) return null;

    // Split on the first two separators only. The secret is base64url, whose
    // alphabet includes '_', so it may legitimately contain more separators —
    // splitting on every underscore would reject most valid keys.
    const firstSeparator = trimmed.indexOf('_');
    if (firstSeparator === -1) return null;

    const secondSeparator = trimmed.indexOf('_', firstSeparator + 1);
    if (secondSeparator === -1) return null;

    const marker = trimmed.slice(0, firstSeparator);
    const prefixBody = trimmed.slice(firstSeparator + 1, secondSeparator);
    const secret = trimmed.slice(secondSeparator + 1);

    if (marker !== KEY_MARKER) return null;
    if (!prefixBody || !secret) return null;
    // The prefix is hex by construction; anything else is not one of our keys
    if (!PREFIX_BODY_PATTERN.test(prefixBody)) return null;

    // The stored prefix includes the marker, so it reads as a key in the admin UI
    return { keyPrefix: `${marker}_${prefixBody}`, secret };
}

/**
 * Hash a secret for storage or comparison.
 *
 * SHA-256, not bcrypt: the secret is 256 bits of CSPRNG output, so there is no
 * low-entropy guess space for a slow KDF to defend, and bcrypt at the cost this
 * repo uses for passwords (12) would add roughly a quarter-second to every
 * ingestion request.
 */
export function hashSecret(secret: string): string {
    return createHash('sha256').update(secret, 'utf8').digest('hex');
}

/**
 * Compare hashes without leaking their difference through timing.
 */
function hashesMatch(a: string, b: string): boolean {
    const bufferA = Buffer.from(a, 'utf8');
    const bufferB = Buffer.from(b, 'utf8');
    // timingSafeEqual throws on length mismatch, which is itself a leak-free
    // signal here: both sides are fixed-length hex digests.
    if (bufferA.length !== bufferB.length) return false;
    return timingSafeEqual(bufferA, bufferB);
}

/**
 * Whether a presented secret matches a stored hash.
 */
export function secretMatchesHash(secret: string, storedHash: string): boolean {
    return hashesMatch(hashSecret(secret), storedHash);
}

/**
 * Generate the material for a new key.
 *
 * Separated from persistence so the format is testable, and so the plaintext is
 * assembled in exactly one place.
 */
export function generateKeyMaterial(): {
    keyPrefix: string;
    secret: string;
    keyHash: string;
    plaintextKey: string;
} {
    const prefixPart = randomBytes(PREFIX_BYTES).toString('hex');
    const secret = randomBytes(SECRET_BYTES).toString('base64url');
    const keyPrefix = `${KEY_MARKER}_${prefixPart}`;

    return {
        keyPrefix,
        secret,
        keyHash: hashSecret(secret),
        plaintextKey: `${keyPrefix}_${secret}`,
    };
}

// ============================================================================
// LIFECYCLE HELPERS
// ============================================================================

function isExpired(key: IngestionKeyWithIndexes, now: Date): boolean {
    return !!key.expiresAt && key.expiresAt.getTime() <= now.getTime();
}

function isRevoked(key: IngestionKeyWithIndexes): boolean {
    return !!key.revokedAt;
}

/**
 * Decide whether an authenticated key may act, given its lifecycle and scope.
 *
 * Pure and exported so every authorization rule can be tested without a database
 * — these are the checks that stand between a leaked key and someone else's index.
 *
 * @param now - injected so expiry is testable
 */
export function evaluateKeyAccess(
    key: IngestionKeyWithIndexes,
    requirement: { searchIndexId: string; operation?: IngestionOperation },
    now: Date = new Date()
): IngestionAuthResult {
    if (isRevoked(key)) {
        return { success: false, reason: 'revoked' };
    }

    if (isExpired(key, now)) {
        return { success: false, reason: 'expired' };
    }

    if (!key.searchIndexIds.includes(requirement.searchIndexId)) {
        return { success: false, reason: 'index-forbidden' };
    }

    if (requirement.operation && !(key.operations ?? []).includes(requirement.operation)) {
        return { success: false, reason: 'operation-forbidden' };
    }

    return { success: true, key };
}

/**
 * Shape a key for display. Never includes the hash or the secret.
 */
export function toSummary(key: IngestionKeyWithIndexes): IngestionKeySummary {
    return {
        id: key.id,
        name: key.name,
        keyPrefix: key.keyPrefix,
        operations: key.operations ?? [],
        searchIndexIds: key.searchIndexIds,
        lastUsedAt: key.lastUsedAt?.toISOString() ?? null,
        revokedAt: key.revokedAt?.toISOString() ?? null,
        expiresAt: key.expiresAt?.toISOString() ?? null,
        createdAt: key.createdAt.toISOString(),
        isActive: !isRevoked(key) && !isExpired(key, new Date()),
    };
}

// ============================================================================
// KEY LOOKUP CACHE
// ============================================================================

/**
 * How long a key looked up by its prefix (or "no such key") is reused. A server sending the
 * same key, right or wrong, costs one database read per window. The secret is checked on every
 * request; revoked and expired are judged from the cached row (expiry against the clock at use).
 * Creating or revoking a key here drops its entry at once on this server. Other servers, and
 * changes made outside this service (an index deleted, a row edited), are seen within this time:
 * the cache is per process until the shared store replaces it.
 */
export const KEY_LOOKUP_TTL_MS = 10_000;

const keysByPrefix = memoryCacheStore<IngestionKeyWithIndexes | null>('ingestion-keys', { maxSize: 10_000 });

function keyByPrefix(keyPrefix: string): Promise<IngestionKeyWithIndexes | null> {
    return keysByPrefix.getOrSet(keyPrefix, () => repository.getByPrefix(keyPrefix), KEY_LOOKUP_TTL_MS);
}

/** Forget every cached key lookup (tests). */
export function clearKeyLookupCache(): Promise<void> {
    return keysByPrefix.clear();
}

// ============================================================================
// CREATE / LIST / REVOKE
// ============================================================================

/**
 * Mint a key. The plaintext is returned once and never stored.
 */
export async function createIngestionKey(input: {
    name: string;
    operations: IngestionOperation[];
    searchIndexIds: string[];
    expiresAt?: Date | null;
    createdBy?: string | null;
}): Promise<CreatedIngestionKey> {
    const material = generateKeyMaterial();

    const key = await repository.create({
        name: input.name,
        keyPrefix: material.keyPrefix,
        keyHash: material.keyHash,
        operations: input.operations,
        searchIndexIds: input.searchIndexIds,
        expiresAt: input.expiresAt,
        createdBy: input.createdBy,
    });
    // A lookup of this prefix just before (cached as "no such key") must not refuse the new key
    await keysByPrefix.delete(key.keyPrefix);

    return {
        key: toSummary(key),
        plaintextKey: material.plaintextKey,
    };
}

export async function listIngestionKeys(
    searchIndexId: string
): Promise<IngestionKeySummary[]> {
    const keys = await repository.listBySearchIndexId(searchIndexId);
    return keys.map(toSummary);
}

/**
 * Revoke a key. Returns null when the key does not exist or is not granted on
 * this index, so the caller can 404 without confirming the key exists elsewhere.
 */
export async function revokeIngestionKey(
    keyId: string,
    searchIndexId: string
): Promise<IngestionKeySummary | null> {
    const revoked = await repository.revoke(keyId, searchIndexId);
    if (!revoked) return null;
    await keysByPrefix.delete(revoked.keyPrefix);
    return toSummary(revoked);
}

// ============================================================================
// VERIFICATION
// ============================================================================

/**
 * Which key was presented: the stored key when the secret matches, whatever its state
 * (revoked, expired, scope are checked by evaluateKeyAccess). At most one database read
 * (see KEY_LOOKUP_TTL_MS).
 */
export async function identifyIngestionKey(presented: string): Promise<IngestionAuthResult> {
    const parsed = parseKey(presented);
    if (!parsed) {
        return { success: false, reason: 'malformed' };
    }

    const key = await keyByPrefix(parsed.keyPrefix);
    if (!key) {
        return { success: false, reason: 'unknown' };
    }

    if (!secretMatchesHash(parsed.secret, key.keyHash)) {
        // Same reason as a missing prefix: a caller must not learn that a prefix
        // is real but the secret wrong.
        return { success: false, reason: 'unknown' };
    }

    return { success: true, key };
}

/** Whether an identified key can be used at all now (not revoked or expired). */
export function isKeyLive(key: IngestionKeyWithIndexes, now: Date = new Date()): boolean {
    return !isRevoked(key) && !isExpired(key, now);
}

/**
 * Verify a presented key and check it may perform an operation on an index.
 *
 * The order matters: identity first (is this a real, live key?), then
 * authorization (may it act here?). The caller maps the former to 401 and the
 * latter to 403. `identified` is the result of identifyIngestionKey when the caller
 * already has it.
 */
export async function verifyIngestionKey(
    presented: string,
    requirement: { searchIndexId: string; operation?: IngestionOperation },
    identified?: IngestionAuthResult,
): Promise<IngestionAuthResult> {
    const identity = identified ?? await identifyIngestionKey(presented);
    if (isIngestionAuthFailure(identity)) {
        return identity;
    }
    const { key } = identity;

    const access = evaluateKeyAccess(key, requirement);
    if (isIngestionAuthFailure(access)) {
        return access;
    }

    // Fire-and-forget: never let audit bookkeeping fail the request
    void repository.touchLastUsed(key.id);

    logger.debug('Ingestion key authenticated', {
        keyId: key.id,
        keyPrefix: key.keyPrefix,
        searchIndexId: requirement.searchIndexId,
        operation: requirement.operation,
    });

    return { success: true, key };
}
