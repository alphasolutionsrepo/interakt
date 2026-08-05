// src/features/ingestion-keys/ingestion-key.repository.ts

/**
 * Ingestion Key Repository
 */

import 'server-only';

import { db } from '@/db/index';
import { and, desc, eq } from 'drizzle-orm';
import { createLogger } from '@/shared/logger/logger';
import {
    ingestionKeys,
    ingestionKeyIndexes,
    type IngestionOperation,
} from '@/db/schema/ingestion-keys.schema';
import type { IngestionKeyWithIndexes } from './ingestion-key.types';

const logger = createLogger('ingestion-key-repository');

/**
 * Attach the scoped index ids to a key row.
 */
async function withIndexes(
    key: typeof ingestionKeys.$inferSelect
): Promise<IngestionKeyWithIndexes> {
    const grants = await db
        .select({ searchIndexId: ingestionKeyIndexes.searchIndexId })
        .from(ingestionKeyIndexes)
        .where(eq(ingestionKeyIndexes.ingestionKeyId, key.id));

    return { ...key, searchIndexIds: grants.map(grant => grant.searchIndexId) };
}

/**
 * Find a key by its public prefix.
 *
 * The prefix is the only part of a key that can be queried — the secret is
 * hashed, so authentication is always "look up by prefix, then verify".
 */
export async function getByPrefix(keyPrefix: string): Promise<IngestionKeyWithIndexes | null> {
    try {
        const [key] = await db
            .select()
            .from(ingestionKeys)
            .where(eq(ingestionKeys.keyPrefix, keyPrefix))
            .limit(1);

        if (!key) return null;
        return withIndexes(key);
    } catch (error) {
        logger.error('Failed to get ingestion key by prefix', error as Error);
        throw error;
    }
}

export async function getById(id: string): Promise<IngestionKeyWithIndexes | null> {
    try {
        const [key] = await db
            .select()
            .from(ingestionKeys)
            .where(eq(ingestionKeys.id, id))
            .limit(1);

        if (!key) return null;
        return withIndexes(key);
    } catch (error) {
        logger.error('Failed to get ingestion key by id', error as Error, { id });
        throw error;
    }
}

/**
 * All keys granting access to a given index, newest first.
 */
export async function listBySearchIndexId(
    searchIndexId: string
): Promise<IngestionKeyWithIndexes[]> {
    try {
        const rows = await db
            .select({ key: ingestionKeys })
            .from(ingestionKeys)
            .innerJoin(
                ingestionKeyIndexes,
                eq(ingestionKeyIndexes.ingestionKeyId, ingestionKeys.id)
            )
            .where(eq(ingestionKeyIndexes.searchIndexId, searchIndexId))
            .orderBy(desc(ingestionKeys.createdAt));

        return Promise.all(rows.map(row => withIndexes(row.key)));
    } catch (error) {
        logger.error('Failed to list ingestion keys', error as Error, { searchIndexId });
        throw error;
    }
}

/**
 * Insert a key and its index grants.
 */
export async function create(input: {
    name: string;
    keyPrefix: string;
    keyHash: string;
    operations: IngestionOperation[];
    searchIndexIds: string[];
    expiresAt?: Date | null;
    createdBy?: string | null;
}): Promise<IngestionKeyWithIndexes> {
    try {
        const [key] = await db.insert(ingestionKeys).values({
            name: input.name,
            keyPrefix: input.keyPrefix,
            keyHash: input.keyHash,
            operations: input.operations,
            expiresAt: input.expiresAt ?? null,
            createdBy: input.createdBy ?? null,
        }).returning();

        if (input.searchIndexIds.length > 0) {
            await db.insert(ingestionKeyIndexes).values(
                input.searchIndexIds.map(searchIndexId => ({
                    ingestionKeyId: key.id,
                    searchIndexId,
                }))
            );
        }

        logger.info('Created ingestion key', {
            id: key.id,
            keyPrefix: key.keyPrefix,
            operations: input.operations,
            indexCount: input.searchIndexIds.length,
        });

        return withIndexes(key);
    } catch (error) {
        logger.error('Failed to create ingestion key', error as Error);
        throw error;
    }
}

/**
 * Revoke a key, scoped to an index it actually grants.
 *
 * The scope check is why this takes searchIndexId: the route is nested under an
 * index, and without it a key belonging to another index could be revoked
 * through the wrong URL.
 */
export async function revoke(
    id: string,
    searchIndexId: string
): Promise<IngestionKeyWithIndexes | null> {
    try {
        const grant = await db
            .select({ id: ingestionKeyIndexes.id })
            .from(ingestionKeyIndexes)
            .where(and(
                eq(ingestionKeyIndexes.ingestionKeyId, id),
                eq(ingestionKeyIndexes.searchIndexId, searchIndexId)
            ))
            .limit(1);

        if (grant.length === 0) {
            return null;
        }

        const [updated] = await db
            .update(ingestionKeys)
            .set({ revokedAt: new Date(), updatedAt: new Date() })
            .where(eq(ingestionKeys.id, id))
            .returning();

        if (!updated) return null;

        logger.info('Revoked ingestion key', { id, keyPrefix: updated.keyPrefix });

        return withIndexes(updated);
    } catch (error) {
        logger.error('Failed to revoke ingestion key', error as Error, { id });
        throw error;
    }
}

/**
 * Record a successful use.
 *
 * Deliberately not awaited by callers — a failure to stamp this must never fail
 * the request it was authenticating.
 */
export async function touchLastUsed(id: string): Promise<void> {
    try {
        await db
            .update(ingestionKeys)
            .set({ lastUsedAt: new Date() })
            .where(eq(ingestionKeys.id, id));
    } catch (error) {
        logger.warn('Failed to update ingestion key lastUsedAt', {
            id,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
}
