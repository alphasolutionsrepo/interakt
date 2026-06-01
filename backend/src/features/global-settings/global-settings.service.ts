// src/features/global-settings/global-settings.service.ts

/**
 * Global Settings Service
 *
 * Provides access to system-wide search configuration settings.
 * Uses a singleton pattern with caching for performance.
 */

import 'server-only';

import { db } from '@/db/index';
import { eq } from 'drizzle-orm';
import {
    globalSearchSettings,
    DEFAULT_GLOBAL_SETTINGS,
    weightToDecimal,
    decimalToWeight,
    validateGlobalSettings,
    type GlobalSearchSettings
} from '@/db/schema/global-search-settings.schema';
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

    // Check if settings exist
    const existing = await db.query.globalSearchSettings.findFirst() as GlobalSearchSettings | undefined;

    let result: GlobalSearchSettings;

    if (existing) {
        // Update existing
        const [updated] = await db
            .update(globalSearchSettings)
            .set({
                ...updateData,
                updatedAt: new Date(),
            })
            .where(eq(globalSearchSettings.id, existing.id))
            .returning();

        result = updated;
        logger.info('Updated global search settings', { id: existing.id });
    } else {
        // Create new with defaults + overrides
        const [created] = await db
            .insert(globalSearchSettings)
            .values({
                searchTimeout: updateData.searchTimeout ?? DEFAULT_GLOBAL_SETTINGS.searchTimeout,
                rrfRankConstant: updateData.rrfRankConstant ?? DEFAULT_GLOBAL_SETTINGS.rrfRankConstant,
                rrfWindowSize: updateData.rrfWindowSize ?? DEFAULT_GLOBAL_SETTINGS.rrfWindowSize,
                lexicalWeight: updateData.lexicalWeight ?? DEFAULT_GLOBAL_SETTINGS.lexicalWeight,
                semanticWeight: updateData.semanticWeight ?? DEFAULT_GLOBAL_SETTINGS.semanticWeight,
            })
            .returning();

        result = created;
        logger.info('Created global search settings', { id: created.id });
    }

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
// HELPERS
// ============================================================================

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
    };
}
