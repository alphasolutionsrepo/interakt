// src/features/global-settings/global-settings.service.ts

/**
 * Global Settings Service
 *
 * Provides access to system-wide search configuration settings.
 * Uses a singleton pattern with caching for performance.
 */

import 'server-only';

import { db } from '@/db/index';
import { eq, sql } from 'drizzle-orm';
import {
    globalSearchSettings,
    DEFAULT_GLOBAL_SETTINGS,
    weightToDecimal,
    decimalToWeight,
    validateGlobalSettings,
    type GlobalSearchSettings
} from '@/db/schema/global-search-settings.schema';
import { AppError } from '@/shared/errors/app-error';
import { createLogger } from '@/shared/logger/logger';

const logger = createLogger('global-settings-service');

// ============================================================================
// TYPES
// ============================================================================

/**
 * Hybrid search defaults with weights as decimal values
 */
export interface HybridSearchDefaults {
    rrfRankConstant: number;
    rrfWindowSize: number;
    lexicalWeight: number;  // Decimal value (e.g., 1.0)
    semanticWeight: number; // Decimal value (e.g., 1.0)
}

/**
 * Search timeout configuration
 */
export interface SearchTimeoutConfig {
    timeoutMs: number;
}

/**
 * Complete global search settings (ready to use)
 */
export interface GlobalSearchConfig {
    timeout: SearchTimeoutConfig;
    hybridDefaults: HybridSearchDefaults;
}

// ============================================================================
// CACHED SETTINGS
// ============================================================================

let cachedSettings: GlobalSearchSettings | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL_MS = 60000; // 1 minute cache

// ============================================================================
// SERVICE FUNCTIONS
// ============================================================================

/**
 * Get global search settings from database or cache
 */
export async function getGlobalSettings(): Promise<GlobalSearchSettings> {
    // Check cache
    const now = Date.now();
    if (cachedSettings && (now - cacheTimestamp) < CACHE_TTL_MS) {
        return cachedSettings;
    }

    try {
        const settings = await db.query.globalSearchSettings.findFirst() as GlobalSearchSettings | undefined;

        if (settings) {
            cachedSettings = settings;
            cacheTimestamp = now;
            return settings;
        }

        // No settings found - return defaults (don't create automatically)
        logger.warn('No global search settings found, using defaults');
        return createDefaultSettings();
    } catch (error) {
        logger.error('Failed to fetch global settings', { error });
        return createDefaultSettings();
    }
}

/**
 * Get hybrid search default settings
 * Returns values ready for use (weights as decimals)
 */
export async function getHybridSearchDefaults(): Promise<HybridSearchDefaults> {
    const settings = await getGlobalSettings();

    return {
        rrfRankConstant: settings.rrfRankConstant,
        rrfWindowSize: settings.rrfWindowSize,
        lexicalWeight: weightToDecimal(settings.lexicalWeight),
        semanticWeight: weightToDecimal(settings.semanticWeight),
    };
}

/**
 * Get search timeout configuration
 */
export async function getSearchTimeout(): Promise<SearchTimeoutConfig> {
    const settings = await getGlobalSettings();

    return {
        timeoutMs: settings.searchTimeout,
    };
}

/**
 * Get complete global search configuration
 * Convenience method to get all settings at once
 */
export async function getGlobalSearchConfig(): Promise<GlobalSearchConfig> {
    const settings = await getGlobalSettings();

    return {
        timeout: {
            timeoutMs: settings.searchTimeout,
        },
        hybridDefaults: {
            rrfRankConstant: settings.rrfRankConstant,
            rrfWindowSize: settings.rrfWindowSize,
            lexicalWeight: weightToDecimal(settings.lexicalWeight),
            semanticWeight: weightToDecimal(settings.semanticWeight),
        },
    };
}

/**
 * Invalidate the cached settings (call after updates)
 */
export function invalidateCache(): void {
    cachedSettings = null;
    cacheTimestamp = 0;
}

// ============================================================================
// UPDATE FUNCTIONS
// ============================================================================

/**
 * Input for updating global search settings
 * Weights should be provided as decimals (e.g., 1.0, 1.5)
 */
export interface UpdateGlobalSettingsInput {
    searchTimeout?: number;
    rrfRankConstant?: number;
    rrfWindowSize?: number;
    lexicalWeight?: number;  // Decimal (0.1-3.0)
    semanticWeight?: number; // Decimal (0.1-3.0)
}

/**
 * Update global search settings
 * Creates the settings row if it doesn't exist (upsert)
 */
export async function updateGlobalSettings(
    input: UpdateGlobalSettingsInput
): Promise<GlobalSearchSettings> {
    // Convert decimal weights to stored integers
    const updateData: Partial<GlobalSearchSettings> = {};

    if (input.searchTimeout !== undefined) {
        updateData.searchTimeout = input.searchTimeout;
    }
    if (input.rrfRankConstant !== undefined) {
        updateData.rrfRankConstant = input.rrfRankConstant;
    }
    if (input.rrfWindowSize !== undefined) {
        updateData.rrfWindowSize = input.rrfWindowSize;
    }
    if (input.lexicalWeight !== undefined) {
        updateData.lexicalWeight = decimalToWeight(input.lexicalWeight);
    }
    if (input.semanticWeight !== undefined) {
        updateData.semanticWeight = decimalToWeight(input.semanticWeight);
    }

    // Validate the settings
    const validation = validateGlobalSettings(updateData);
    if (!validation.valid) {
        throw new Error(`Invalid settings: ${validation.errors.join(', ')}`);
    }

    // Update the settings row, or create it with defaults + overrides
    const { row: result, created } = await writeSettingsRow(db, updateData, {
        searchTimeout: updateData.searchTimeout ?? DEFAULT_GLOBAL_SETTINGS.searchTimeout,
        rrfRankConstant: updateData.rrfRankConstant ?? DEFAULT_GLOBAL_SETTINGS.rrfRankConstant,
        rrfWindowSize: updateData.rrfWindowSize ?? DEFAULT_GLOBAL_SETTINGS.rrfWindowSize,
        lexicalWeight: updateData.lexicalWeight ?? DEFAULT_GLOBAL_SETTINGS.lexicalWeight,
        semanticWeight: updateData.semanticWeight ?? DEFAULT_GLOBAL_SETTINGS.semanticWeight,
    });
    logger.info(created ? 'Created global search settings' : 'Updated global search settings', { id: result.id });

    // Invalidate cache
    invalidateCache();

    return result;
}

/**
 * Get settings for API response (with weights as decimals)
 */
export interface GlobalSettingsResponse {
    id: string;
    searchTimeout: number;
    rrfRankConstant: number;
    rrfWindowSize: number;
    lexicalWeight: number;  // Decimal
    semanticWeight: number; // Decimal
    createdAt: Date;
    updatedAt: Date;
}

/**
 * Get global settings formatted for API response
 */
export async function getGlobalSettingsForApi(): Promise<GlobalSettingsResponse> {
    const settings = await getGlobalSettings();

    return {
        id: settings.id,
        searchTimeout: settings.searchTimeout,
        rrfRankConstant: settings.rrfRankConstant,
        rrfWindowSize: settings.rrfWindowSize,
        lexicalWeight: weightToDecimal(settings.lexicalWeight),
        semanticWeight: weightToDecimal(settings.semanticWeight),
        createdAt: settings.createdAt,
        updatedAt: settings.updatedAt,
    };
}

// ============================================================================
// FEATURE SWITCHES
// ============================================================================

/** Postgres undefined_column (42703), as thrown by the driver or wrapped by drizzle. */
function isMissingColumn(error: unknown): boolean {
    for (let e: unknown = error, depth = 0; e && depth < 5; depth++) {
        if ((e as { code?: unknown }).code === '42703') return true;
        e = (e as { cause?: unknown }).cause;
    }
    return false;
}

let warnedMissingColumn = false;

/**
 * The areas an Admin turned off, as stored (features/feature-switches reads them through its
 * own short cache, so this reads the database each time). A database the update hasn't run
 * on yet (no column) means nothing is switched off. Any other failed read throws.
 */
export async function getStoredFeaturesOff(): Promise<string[]> {
    try {
        const row = await db.query.globalSearchSettings.findFirst({ columns: { featuresOff: true } });
        return row?.featuresOff ?? [];
    } catch (error) {
        if (!isMissingColumn(error)) throw error;
        if (!warnedMissingColumn) {
            warnedMissingColumn = true;
            logger.warn('The features_off column is missing: the database update (migration) has not run. Every area is treated as on.');
        }
        return [];
    }
}

/**
 * Change the stored list under a lock, so two saves at once can't lose a change: `change`
 * gets the list as stored and returns the new one. Creates the settings row when there is
 * none. Returns the list before and after. Fails with a 503 when the database update that
 * adds the column hasn't run.
 */
export async function updateFeaturesOff(
    change: (current: string[]) => string[],
): Promise<{ before: string[]; after: string[] }> {
    try {
        const result = await db.transaction(async (tx) => {
            // Held to the end of the transaction; also covers the first save, when there is no row to lock
            await tx.execute(sql`select pg_advisory_xact_lock(${FEATURES_OFF_LOCK})`);
            const row = await tx.query.globalSearchSettings.findFirst({ columns: { featuresOff: true } });
            const before = row?.featuresOff ?? [];
            const after = change([...before]);
            await writeSettingsRow(tx, { featuresOff: after }, { featuresOff: after });
            return { before, after };
        });
        invalidateCache();
        logger.info('Saved feature switches', { featuresOff: result.after });
        return result;
    } catch (error) {
        if (!isMissingColumn(error)) throw error;
        throw new AppError("The database update for feature switches hasn't run yet, so they can't be saved. Run the database update and try again.", {
            code: 'DATABASE_UPDATE_PENDING', status: 503, ourSide: true, cause: error,
        });
    }
}

// ============================================================================
// HELPERS
// ============================================================================

// Arbitrary key for the advisory lock that serializes feature switch saves
const FEATURES_OFF_LOCK = 4_071_113;

type SettingsExecutor = Pick<typeof db, 'query' | 'update' | 'insert'>;

/** Update the settings row, or insert one (with insertValues) when there is none yet. */
async function writeSettingsRow(
    executor: SettingsExecutor,
    changes: Partial<GlobalSearchSettings>,
    insertValues: Partial<GlobalSearchSettings>,
): Promise<{ row: GlobalSearchSettings; created: boolean }> {
    const existing = await executor.query.globalSearchSettings.findFirst({ columns: { id: true } });
    if (existing) {
        const [updated] = await executor
            .update(globalSearchSettings)
            .set({ ...changes, updatedAt: new Date() })
            .where(eq(globalSearchSettings.id, existing.id))
            .returning();
        return { row: updated, created: false };
    }
    const [created] = await executor.insert(globalSearchSettings).values(insertValues).returning();
    return { row: created, created: true };
}

function createDefaultSettings(): GlobalSearchSettings {
    return {
        id: 'default',
        createdAt: new Date(),
        updatedAt: new Date(),
        searchTimeout: DEFAULT_GLOBAL_SETTINGS.searchTimeout,
        rrfRankConstant: DEFAULT_GLOBAL_SETTINGS.rrfRankConstant,
        rrfWindowSize: DEFAULT_GLOBAL_SETTINGS.rrfWindowSize,
        lexicalWeight: DEFAULT_GLOBAL_SETTINGS.lexicalWeight,
        semanticWeight: DEFAULT_GLOBAL_SETTINGS.semanticWeight,
        featuresOff: [],
    };
}
