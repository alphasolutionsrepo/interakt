// src/shared/seeders/seed-registry.service.ts

/**
 * Seed Registry Service
 * Manages tracking of seeded data with checksum-based change detection
 */

import crypto from 'crypto';
import { db } from '@/db/index';
import { seedRegistry, SEED_TYPES, type SeedType } from '@/db/schema/seed-registry.schema';
import { eq, and } from 'drizzle-orm';
import { createLogger } from '@/shared/logger/logger';
import type { ChecksumComparison, SeedRegistryEntry } from './seeder.types';

const logger = createLogger('seed-registry');

// ============================================================================
// CHECKSUM UTILITIES
// ============================================================================

/**
 * Calculate SHA-256 checksum of data
 * Includes template metadata AND all fields for complete change detection
 */
export function calculateChecksum(data: unknown): string {
    const jsonString = JSON.stringify(data, Object.keys(data as object).sort());
    return crypto.createHash('sha256').update(jsonString).digest('hex');
}

// ============================================================================
// REGISTRY OPERATIONS
// ============================================================================

/**
 * Get a seed registry entry
 * Uses direct select to avoid type inference issues with relational queries
 */
export async function getRegistryEntry(
    seedType: SeedType,
    seedKey: string
): Promise<SeedRegistryEntry | null> {
    try {
        const results = await db
            .select()
            .from(seedRegistry)
            .where(
                and(
                    eq(seedRegistry.seedType, seedType),
                    eq(seedRegistry.seedKey, seedKey)
                )
            )
            .limit(1);

        if (results.length === 0) return null;

        const entry = results[0];
        return {
            seedType: entry.seedType as SeedType,
            seedKey: entry.seedKey,
            checksum: entry.checksum,
            seededAt: entry.seededAt,
            updatedAt: entry.updatedAt,
            metadata: entry.metadata ? JSON.parse(entry.metadata) : undefined,
        };
    } catch (error) {
        logger.error('Failed to get registry entry', error as Error, { seedType, seedKey });
        throw error;
    }
}

/**
 * Get all registry entries for a seed type
 * Uses direct select to avoid type inference issues
 */
export async function getRegistryEntriesByType(
    seedType: SeedType
): Promise<SeedRegistryEntry[]> {
    try {
        const entries = await db
            .select()
            .from(seedRegistry)
            .where(eq(seedRegistry.seedType, seedType));

        return entries.map(entry => ({
            seedType: entry.seedType as SeedType,
            seedKey: entry.seedKey,
            checksum: entry.checksum,
            seededAt: entry.seededAt,
            updatedAt: entry.updatedAt,
            metadata: entry.metadata ? JSON.parse(entry.metadata) : undefined,
        }));
    } catch (error) {
        logger.error('Failed to get registry entries', error as Error, { seedType });
        throw error;
    }
}

/**
 * Create or update a registry entry
 */
export async function upsertRegistryEntry(
    seedType: SeedType,
    seedKey: string,
    checksum: string,
    metadata?: Record<string, unknown>
): Promise<void> {
    try {
        const existing = await getRegistryEntry(seedType, seedKey);

        if (existing) {
            // Update existing entry
            await db
                .update(seedRegistry)
                .set({
                    checksum,
                    metadata: metadata ? JSON.stringify(metadata) : null,
                    updatedAt: new Date(),
                })
                .where(
                    and(
                        eq(seedRegistry.seedType, seedType),
                        eq(seedRegistry.seedKey, seedKey)
                    )
                );

            logger.debug('Updated registry entry', { seedType, seedKey });
        } else {
            // Create new entry
            await db.insert(seedRegistry).values({
                seedType,
                seedKey,
                checksum,
                metadata: metadata ? JSON.stringify(metadata) : null,
            });

            logger.debug('Created registry entry', { seedType, seedKey });
        }
    } catch (error) {
        logger.error('Failed to upsert registry entry', error as Error, { seedType, seedKey });
        throw error;
    }
}

/**
 * Delete a registry entry
 */
export async function deleteRegistryEntry(
    seedType: SeedType,
    seedKey: string
): Promise<boolean> {
    try {
        await db
            .delete(seedRegistry)
            .where(
                and(
                    eq(seedRegistry.seedType, seedType),
                    eq(seedRegistry.seedKey, seedKey)
                )
            );

        logger.debug('Deleted registry entry', { seedType, seedKey });
        return true;
    } catch (error) {
        logger.error('Failed to delete registry entry', error as Error, { seedType, seedKey });
        throw error;
    }
}

/**
 * Delete all registry entries for a seed type
 */
export async function clearRegistryByType(seedType: SeedType): Promise<number> {
    try {
        const entries = await getRegistryEntriesByType(seedType);

        await db
            .delete(seedRegistry)
            .where(eq(seedRegistry.seedType, seedType));

        logger.info('Cleared registry entries', { seedType, count: entries.length });
        return entries.length;
    } catch (error) {
        logger.error('Failed to clear registry', error as Error, { seedType });
        throw error;
    }
}

// ============================================================================
// CHECKSUM COMPARISON
// ============================================================================

/**
 * Compare checksum of seed data with stored checksum
 */
export async function compareChecksum(
    seedType: SeedType,
    seedKey: string,
    seedData: unknown
): Promise<ChecksumComparison> {
    const currentChecksum = calculateChecksum(seedData);
    const entry = await getRegistryEntry(seedType, seedKey);

    return {
        key: seedKey,
        currentChecksum,
        storedChecksum: entry?.checksum ?? null,
        isNew: entry === null,
        hasChanged: entry !== null && entry.checksum !== currentChecksum,
    };
}

/**
 * Compare checksums for multiple seeds
 */
export async function compareChecksums(
    seedType: SeedType,
    seeds: Array<{ key: string; data: unknown }>
): Promise<ChecksumComparison[]> {
    const results: ChecksumComparison[] = [];

    for (const seed of seeds) {
        const comparison = await compareChecksum(seedType, seed.key, seed.data);
        results.push(comparison);
    }

    return results;
}

// ============================================================================
// STATUS & REPORTING
// ============================================================================

/**
 * Get seeding status summary
 * Uses direct select to avoid type inference issues
 */
export async function getSeedingStatus(): Promise<{
    types: Record<string, { count: number; lastUpdated: Date | null }>;
    totalSeeds: number;
}> {
    try {
        const allEntries = await db
            .select()
            .from(seedRegistry);

        const types: Record<string, { count: number; lastUpdated: Date | null }> = {};

        for (const entry of allEntries) {
            const seedType = entry.seedType;

            if (!types[seedType]) {
                types[seedType] = { count: 0, lastUpdated: null };
            }

            types[seedType].count++;

            if (!types[seedType].lastUpdated ||
                entry.updatedAt > types[seedType].lastUpdated) {
                types[seedType].lastUpdated = entry.updatedAt;
            }
        }

        return {
            types,
            totalSeeds: allEntries.length,
        };
    } catch (error) {
        logger.error('Failed to get seeding status', error as Error);
        throw error;
    }
}

// Re-export seed types for convenience
export { SEED_TYPES, type SeedType };