// src/features/search-index/field-dependents.repository.ts

/**
 * Field Dependents Repository
 *
 * Gathers everything the field-dependency matchers need, from the four places
 * that can reference an index field by name.
 *
 * Kept separate from the matching (field-dependents.ts) so the matching stays
 * pure and testable. This file is only joins.
 */

import 'server-only';

import { db } from '@/db/index';
import { eq, inArray } from 'drizzle-orm';
import { createLogger } from '@/shared/logger/logger';
import {
    searchExperiences,
    searchExperienceIndexes,
} from '@/db/schema/search-experience.schema';
import { tools } from '@/db/schema/tools.schema';
import { aiExperiences, aiExperienceTools } from '@/db/schema/ai-experience.schema';
import { dataSources } from '@/db/schema/data-sources.schema';
import type {
    DependentExperience,
    DependentTool,
} from './field-dependents';

const logger = createLogger('field-dependents-repository');

/**
 * Load every search experience wired to an index, with the bits that can name a
 * field: its display config and whether autocomplete is on.
 */
export async function getExperiencesForIndex(
    searchIndexId: string
): Promise<DependentExperience[]> {
    const rows = await db
        .select({
            name: searchExperiences.name,
            displayConfig: searchExperiences.displayConfig,
            searchConfig: searchExperiences.searchConfig,
        })
        .from(searchExperiences)
        .innerJoin(
            searchExperienceIndexes,
            eq(searchExperienceIndexes.searchExperienceId, searchExperiences.id)
        )
        .where(eq(searchExperienceIndexes.searchIndexId, searchIndexId));

    return rows.map(row => ({
        name: row.name,
        displayFields: (row.displayConfig?.displayFields ?? []).map(displayField => ({
            fieldName: displayField.fieldName,
            role: displayField.role,
        })),
        autocompleteEnabled: row.searchConfig?.autocomplete?.enabled ?? false,
    }));
}

/**
 * Load every tool that reaches an index, with its display config, executor
 * config, and any per-AI-experience overrides of that executor config.
 *
 * Tools reach an index over two hops — tools.dataSourceId → data_sources
 * .searchIndexId — so a tool referencing a deleted field is easy to miss.
 */
export async function getToolsForIndex(searchIndexId: string): Promise<DependentTool[]> {
    const toolRows = await db
        .select({
            id: tools.id,
            name: tools.name,
            displayConfig: tools.displayConfig,
            executorConfig: tools.executorConfig,
        })
        .from(tools)
        .innerJoin(dataSources, eq(tools.dataSourceId, dataSources.id))
        .where(eq(dataSources.searchIndexId, searchIndexId));

    if (toolRows.length === 0) {
        return [];
    }

    // Overrides for all of these tools in one query
    const overrideRows = await db
        .select({
            toolId: aiExperienceTools.toolId,
            overrideConfig: aiExperienceTools.overrideConfig,
            experienceName: aiExperiences.name,
        })
        .from(aiExperienceTools)
        .innerJoin(aiExperiences, eq(aiExperienceTools.aiExperienceId, aiExperiences.id))
        .where(inArray(aiExperienceTools.toolId, toolRows.map(tool => tool.id)));

    const overridesByToolId = new Map<string, DependentTool['overrides']>();
    for (const override of overrideRows) {
        const existing = overridesByToolId.get(override.toolId) ?? [];
        existing.push({
            experienceName: override.experienceName,
            config: override.overrideConfig ?? null,
        });
        overridesByToolId.set(override.toolId, existing);
    }

    return toolRows.map(tool => ({
        name: tool.name,
        displayFields: (tool.displayConfig?.fields ?? []).map(displayField => ({
            source: displayField.source,
            role: displayField.role,
        })),
        // Scanned by key rather than by type — see field-dependents.ts
        executorConfig: (tool.executorConfig ?? null) as Record<string, unknown> | null,
        overrides: overridesByToolId.get(tool.id) ?? [],
    }));
}

/**
 * Gather both sides in parallel.
 */
export async function getDependencySources(searchIndexId: string): Promise<{
    experiences: DependentExperience[];
    tools: DependentTool[];
}> {
    try {
        const [experiences, toolList] = await Promise.all([
            getExperiencesForIndex(searchIndexId),
            getToolsForIndex(searchIndexId),
        ]);

        return { experiences, tools: toolList };
    } catch (error) {
        logger.error('Failed to gather field dependency sources', error as Error, {
            searchIndexId,
        });
        throw error;
    }
}
