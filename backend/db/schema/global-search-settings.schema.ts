// db/schema/global-search-settings.schema.ts

/**
 * Global Search Settings Schema
 *
 * System-wide default settings for search functionality.
 * This is a singleton table (typically one row) that provides
 * baseline configuration for all search operations.
 *
 * Settings can be overridden at the Search Experience level.
 */

import {
    pgTable,
    uuid,
    integer,
    timestamp
} from 'drizzle-orm/pg-core';

// ============================================================================
// GLOBAL SEARCH SETTINGS TABLE
// ============================================================================

/**
 * Global search settings provide system-wide defaults for search behavior.
 *
 * Configuration priority:
 * 1. Search Experience config (if set)
 * 2. Global Search Settings (this table)
 * 3. Hardcoded defaults
 */
export const globalSearchSettings = pgTable('global_search_settings', {
    // ============================================================================
    // PRIMARY KEY & TIMESTAMPS
    // ============================================================================
    id: uuid('id').primaryKey().notNull().defaultRandom(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),

    // ============================================================================
    // SEARCH TIMEOUT
    // ============================================================================
    /**
     * Default timeout for search operations in milliseconds.
     * Prevents long-running queries from blocking resources.
     * Default: 30000ms (30 seconds)
     */
    searchTimeout: integer('search_timeout').default(30000).notNull(),

    // ============================================================================
    // HYBRID SEARCH DEFAULTS
    // ============================================================================
    /**
     * RRF (Reciprocal Rank Fusion) rank constant (k).
     * Higher values reduce the impact of top-ranked documents.
     * Formula: score = 1 / (k + rank)
     * Default: 60
     */
    rrfRankConstant: integer('rrf_rank_constant').default(60).notNull(),

    /**
     * RRF window size - number of results to consider from each search type
     * (lexical and semantic) before fusion.
     * Default: 100
     */
    rrfWindowSize: integer('rrf_window_size').default(100).notNull(),

    /**
     * Lexical (keyword) search weight for hybrid search.
     * Higher values favor exact keyword matches.
     * Range: 0.1-3.0, Default: 1.0
     * Stored as integer (multiplied by 10) for precision: 10 = 1.0
     */
    lexicalWeight: integer('lexical_weight').default(10).notNull(),

    /**
     * Semantic (vector) search weight for hybrid search.
     * Higher values favor conceptual/meaning similarity.
     * Range: 0.1-3.0, Default: 1.0
     * Stored as integer (multiplied by 10) for precision: 10 = 1.0
     */
    semanticWeight: integer('semantic_weight').default(10).notNull(),
});

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type GlobalSearchSettings = typeof globalSearchSettings.$inferSelect;
export type NewGlobalSearchSettings = typeof globalSearchSettings.$inferInsert;

// ============================================================================
// CONSTANTS - DEFAULT VALUES
// ============================================================================

export const DEFAULT_GLOBAL_SETTINGS = {
    searchTimeout: 30000,
    // Hybrid search defaults
    rrfRankConstant: 60,
    rrfWindowSize: 100,
    lexicalWeight: 10, // Stored as int * 10, so 10 = 1.0
    semanticWeight: 10, // Stored as int * 10, so 10 = 1.0
} as const;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Convert stored integer weight to decimal (e.g., 10 -> 1.0)
 */
export function weightToDecimal(weight: number): number {
    return weight / 10;
}

/**
 * Convert decimal weight to stored integer (e.g., 1.0 -> 10)
 */
export function decimalToWeight(decimal: number): number {
    return Math.round(decimal * 10);
}

/**
 * Validate global settings values
 */
export function validateGlobalSettings(settings: Partial<GlobalSearchSettings>): {
    valid: boolean;
    errors: string[];
} {
    const errors: string[] = [];

    if (settings.searchTimeout !== undefined) {
        if (settings.searchTimeout < 1000 || settings.searchTimeout > 120000) {
            errors.push('searchTimeout must be between 1000 and 120000 milliseconds');
        }
    }

    if (settings.rrfRankConstant !== undefined) {
        if (settings.rrfRankConstant < 1 || settings.rrfRankConstant > 1000) {
            errors.push('rrfRankConstant must be between 1 and 1000');
        }
    }

    if (settings.rrfWindowSize !== undefined) {
        if (settings.rrfWindowSize < 10 || settings.rrfWindowSize > 500) {
            errors.push('rrfWindowSize must be between 10 and 500');
        }
    }

    if (settings.lexicalWeight !== undefined) {
        if (settings.lexicalWeight < 1 || settings.lexicalWeight > 30) {
            errors.push('lexicalWeight must be between 1 and 30 (representing 0.1 to 3.0)');
        }
    }

    if (settings.semanticWeight !== undefined) {
        if (settings.semanticWeight < 1 || settings.semanticWeight > 30) {
            errors.push('semanticWeight must be between 1 and 30 (representing 0.1 to 3.0)');
        }
    }

    return {
        valid: errors.length === 0,
        errors,
    };
}
