// src/features/global-settings/global-settings.service.ts

/**
 * Global Settings Service
 *
 * Provides access to system-wide search configuration settings.
 * Uses a singleton pattern with caching for performance.
 */

import 'server-only';

import { db } from '@/db/index';
import { asc, eq, getTableColumns, sql } from 'drizzle-orm';
import { pgTable, uuid } from 'drizzle-orm/pg-core';
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

/**
 * The general settings: every column but the feature switches (read and saved on their own),
 * so these keep working on a database the switches' migration hasn't run on yet.
 */
export type GeneralSearchSettings = Omit<GlobalSearchSettings, 'featuresOff'>;
const { featuresOff: _featuresOff, ...generalColumns } = getTableColumns(globalSearchSettings);
const generalColumnNames = Object.fromEntries(Object.keys(generalColumns).map((k) => [k, true])) as { [K in keyof typeof generalColumns]: true };

let cachedSettings: GeneralSearchSettings | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL_MS = 60000; // 1 minute cache

// ============================================================================
// SERVICE FUNCTIONS
// ============================================================================

/**
 * Get global search settings from database or cache
 */
export async function getGlobalSettings(): Promise<GeneralSearchSettings> {
    // Check cache
    const now = Date.now();
    if (cachedSettings && (now - cacheTimestamp) < CACHE_TTL_MS) {
        return cachedSettings;
    }

    try {
        const settings = await db.query.globalSearchSettings.findFirst({ columns: generalColumnNames, orderBy: OLDEST_FIRST });

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
): Promise<GeneralSearchSettings> {
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

    // Update the settings row, created with the defaults when there is none
    const { result, created } = await underSettingsLock(async (tx) => {
        const { id, created } = await settingsRow(tx);
        const [row] = await tx
            .update(globalSearchSettings)
            .set({ ...updateData, updatedAt: new Date() })
            .where(eq(globalSearchSettings.id, id))
            .returning(generalColumns);
        return { result: row, created };
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
        const row = await db.query.globalSearchSettings.findFirst({ columns: { featuresOff: true }, orderBy: OLDEST_FIRST });
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
        const result = await underSettingsLock(async (tx) => {
            const row = await tx.query.globalSearchSettings.findFirst({ columns: { featuresOff: true }, orderBy: OLDEST_FIRST });
            const before = row?.featuresOff ?? [];
            const after = change([...before]);
            const { id } = await settingsRow(tx);
            await tx.update(globalSearchSettings).set({ featuresOff: after, updatedAt: new Date() }).where(eq(globalSearchSettings.id, id));
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

// Arbitrary key for the advisory lock that serializes the settings saves
const SETTINGS_LOCK = 4_071_113;

// One settings row is expected; should there be more, every read and save uses the oldest
const OLDEST_FIRST = [asc(globalSearchSettings.createdAt), asc(globalSearchSettings.id)];

type SettingsTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Runs a settings save in a transaction holding the settings lock to its end, so saves run one
 * at a time: none loses another's change, and the first two can't both create the row (there is
 * no row to lock yet, hence an advisory lock).
 */
function underSettingsLock<T>(save: (tx: SettingsTx) => Promise<T>): Promise<T> {
    return db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(${SETTINGS_LOCK})`);
        return save(tx);
    });
}

// The settings table seen through its id alone: an insert names no other column, so it works
// whichever migrations have run (the others take their defaults)
const settingsRowIds = pgTable('global_search_settings', { id: uuid('id').primaryKey().defaultRandom() });

/** The id of the settings row, creating it with the column defaults when there is none. */
async function settingsRow(tx: SettingsTx): Promise<{ id: string; created: boolean }> {
    const existing = await tx.query.globalSearchSettings.findFirst({ columns: { id: true }, orderBy: OLDEST_FIRST });
    if (existing) return { id: existing.id, created: false };
    const [inserted] = await tx.insert(settingsRowIds).values({}).returning();
    return { id: inserted.id, created: true };
}

function createDefaultSettings(): GeneralSearchSettings {
    return {
        id: 'default',
        createdAt: new Date(),
        updatedAt: new Date(),
        searchTimeout: DEFAULT_GLOBAL_SETTINGS.searchTimeout,
        rrfRankConstant: DEFAULT_GLOBAL_SETTINGS.rrfRankConstant,
        rrfWindowSize: DEFAULT_GLOBAL_SETTINGS.rrfWindowSize,
        lexicalWeight: DEFAULT_GLOBAL_SETTINGS.lexicalWeight,
        semanticWeight: DEFAULT_GLOBAL_SETTINGS.semanticWeight,
    };
}
