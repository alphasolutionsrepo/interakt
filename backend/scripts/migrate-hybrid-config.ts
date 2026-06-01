// scripts/migrate-hybrid-config.ts

/**
 * Migration Script: Populate hybridConfig for Existing Search Experiences
 *
 * This script updates all existing search experiences that don't have
 * hybridConfig populated with values from global settings.
 *
 * Run with: npx tsx scripts/migrate-hybrid-config.ts
 */

import { db } from '../src/db/drizzle';
import { searchExperiences } from '../db/schema/search-experiences.schema';
import {
    globalSearchSettings,
    weightToDecimal,
    DEFAULT_GLOBAL_SETTINGS,
} from '../db/schema/global-search-settings.schema';
import { sql } from 'drizzle-orm';

interface SearchConfig {
    defaultPageSize?: number;
    maxPageSize?: number;
    enableHighlighting?: boolean;
    enableFacets?: boolean;
    multiIndexStrategy?: string;
    resultMergeStrategy?: string;
    maxIndexesPerQuery?: number;
    autocomplete?: {
        enabled?: boolean;
        minLength?: number;
        maxSuggestions?: number;
        debounceMs?: number;
    };
    hybridConfig?: {
        lexicalWeight?: number;
        semanticWeight?: number;
        rrfRankConstant?: number;
        rrfWindowSize?: number;
    };
}

async function getGlobalHybridDefaults() {
    // Try to get from database
    const settings = await db.query.globalSearchSettings.findFirst();

    if (settings) {
        return {
            lexicalWeight: weightToDecimal(settings.lexicalWeight),
            semanticWeight: weightToDecimal(settings.semanticWeight),
            rrfRankConstant: settings.rrfRankConstant,
            rrfWindowSize: settings.rrfWindowSize,
        };
    }

    // Fall back to code defaults
    return {
        lexicalWeight: weightToDecimal(DEFAULT_GLOBAL_SETTINGS.lexicalWeight),
        semanticWeight: weightToDecimal(DEFAULT_GLOBAL_SETTINGS.semanticWeight),
        rrfRankConstant: DEFAULT_GLOBAL_SETTINGS.rrfRankConstant,
        rrfWindowSize: DEFAULT_GLOBAL_SETTINGS.rrfWindowSize,
    };
}

async function migrateHybridConfig() {
    console.log('Starting hybridConfig migration...\n');

    // Get global defaults
    const globalDefaults = await getGlobalHybridDefaults();
    console.log('Global hybrid search defaults:', globalDefaults);
    console.log('');

    // Get all search experiences
    const experiences = await db.select().from(searchExperiences);
    console.log(`Found ${experiences.length} search experiences to check\n`);

    let updatedCount = 0;
    let skippedCount = 0;

    for (const experience of experiences) {
        const searchConfig = experience.searchConfig as SearchConfig | null;

        // Check if hybridConfig is missing or incomplete
        const existingHybridConfig = searchConfig?.hybridConfig;
        const needsUpdate =
            !existingHybridConfig ||
            existingHybridConfig.lexicalWeight === undefined ||
            existingHybridConfig.semanticWeight === undefined ||
            existingHybridConfig.rrfRankConstant === undefined ||
            existingHybridConfig.rrfWindowSize === undefined;

        if (needsUpdate) {
            // Merge existing values with defaults
            const updatedHybridConfig = {
                lexicalWeight: existingHybridConfig?.lexicalWeight ?? globalDefaults.lexicalWeight,
                semanticWeight: existingHybridConfig?.semanticWeight ?? globalDefaults.semanticWeight,
                rrfRankConstant: existingHybridConfig?.rrfRankConstant ?? globalDefaults.rrfRankConstant,
                rrfWindowSize: existingHybridConfig?.rrfWindowSize ?? globalDefaults.rrfWindowSize,
            };

            const updatedSearchConfig: SearchConfig = {
                ...searchConfig,
                hybridConfig: updatedHybridConfig,
            };

            // Update in database
            await db
                .update(searchExperiences)
                .set({
                    searchConfig: updatedSearchConfig,
                    updatedAt: new Date(),
                })
                .where(sql`${searchExperiences.id} = ${experience.id}`);

            console.log(`✓ Updated: ${experience.name} (${experience.id})`);
            console.log(`  hybridConfig: ${JSON.stringify(updatedHybridConfig)}`);
            updatedCount++;
        } else {
            console.log(`- Skipped: ${experience.name} (already has complete hybridConfig)`);
            skippedCount++;
        }
    }

    console.log('\n========================================');
    console.log('Migration complete!');
    console.log(`  Updated: ${updatedCount}`);
    console.log(`  Skipped: ${skippedCount}`);
    console.log(`  Total:   ${experiences.length}`);
    console.log('========================================\n');
}

// Run migration
migrateHybridConfig()
    .then(() => {
        console.log('Migration finished successfully.');
        process.exit(0);
    })
    .catch((error) => {
        console.error('Migration failed:', error);
        process.exit(1);
    });
