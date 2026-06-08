// src/features/search-index/search-index.repository.ts

/**
 * Search Index Feature - Repository Layer
 * Raw database queries using Drizzle ORM
 * 
 * UPDATED: Uses searchIndexFields instead of indexFieldMappings
 */

import { eq, desc, asc, ilike, or, sql, and, count, SQL } from 'drizzle-orm';
import { db } from '@/db/index';
import {
    searchIndex,
    searchIndexFields,
    aiProviders,
    aiProviderModels,
    searchExperiences,
    searchExperienceIndexes,
    dataSources,
} from '@/db/schema';
import type { SearchIndex, NewSearchIndex } from '@/db/schema/search-index.schema';
import type {
    SearchIndexComplete,
    SearchIndexSummary,
    ListSearchIndexesQuery,
} from './search-index.types';
import { createLogger } from '@/shared/logger/logger';

const logger = createLogger('search-index-repository');

// ============================================================================
// SEARCH INDEX: CREATE OPERATIONS
// ============================================================================

/**
 * Create a new search index (without fields)
 * Fields are snapshotted separately via search-index-fields.repository
 */
export async function createSearchIndexOnly(
    indexData: Omit<NewSearchIndex, 'id' | 'createdAt' | 'updatedAt'>
): Promise<SearchIndex> {
    try {
        const [createdIndex] = await db
            .insert(searchIndex)
            .values(indexData)
            .returning();

        logger.info('Created search index', {
            indexId: createdIndex.id,
            name: createdIndex.name,
        });

        return createdIndex;
    } catch (error) {
        logger.error('Failed to create search index', error as Error);
        throw error;
    }
}

// ============================================================================
// SEARCH INDEX: READ OPERATIONS
// ============================================================================

/**
 * Minimal auth record used to validate an ingestion API key.
 */
export interface SearchIndexIngestAuth {
    id: string;
    isActive: boolean;
    status: string;
    createdBy: string | null;
}

/**
 * Resolve an ingestion token to its search index (minimal fields).
 * Returns null if no index has the given token.
 */
export async function getSearchIndexByIngestToken(
    token: string
): Promise<SearchIndexIngestAuth | null> {
    const [row] = await db
        .select({
            id: searchIndex.id,
            isActive: searchIndex.isActive,
            status: searchIndex.status,
            createdBy: searchIndex.createdBy,
        })
        .from(searchIndex)
        .where(eq(searchIndex.ingestToken, token))
        .limit(1);

    return row ?? null;
}

/**
 * Get the current ingestion token for an index.
 * Returns null if the index does not exist.
 */
export async function getIngestToken(id: string): Promise<string | null> {
    const [row] = await db
        .select({ ingestToken: searchIndex.ingestToken })
        .from(searchIndex)
        .where(eq(searchIndex.id, id))
        .limit(1);

    return row?.ingestToken ?? null;
}

/**
 * Regenerate (rotate) the ingestion token for an index, revoking the old one.
 * Returns the new token, or null if the index does not exist.
 */
export async function regenerateIngestToken(id: string): Promise<string | null> {
    const [updated] = await db
        .update(searchIndex)
        .set({ ingestToken: sql`gen_random_uuid()`, updatedAt: new Date() })
        .where(eq(searchIndex.id, id))
        .returning({ ingestToken: searchIndex.ingestToken });

    if (!updated) {
        return null;
    }

    logger.info('Regenerated ingest token', { indexId: id });
    return updated.ingestToken;
}

/**
 * Get search index by ID with all relations
 * NOW: Uses searchIndexFields instead of indexFieldMappings
 */
export async function getSearchIndexById(id: string): Promise<SearchIndexComplete | null> {
    try {
        // Get base index with data template
        const result = await db
            .select({
                // All search index columns
                id: searchIndex.id,
                name: searchIndex.name,
                displayName: searchIndex.displayName,
                description: searchIndex.description,
                dataTemplateId: searchIndex.dataTemplateId,
                searchType: searchIndex.searchType,
                indexingStrategy: searchIndex.indexingStrategy,
                searchProvider: searchIndex.searchProvider,
                providerSettings: searchIndex.providerSettings,
                numberOfShards: searchIndex.numberOfShards,
                numberOfReplicas: searchIndex.numberOfReplicas,
                refreshInterval: searchIndex.refreshInterval,
                language: searchIndex.language,
                synonyms: searchIndex.synonyms,
                stopWords: searchIndex.stopWords,
                analyzerConfig: searchIndex.analyzerConfig,
                aiProviderId: searchIndex.aiProviderId,
                aiModelId: searchIndex.aiModelId,
                embeddingDimensions: searchIndex.embeddingDimensions,
                vectorSimilarity: searchIndex.vectorSimilarity,
                rrfRankConstant: searchIndex.rrfRankConstant,
                rrfWindowSize: searchIndex.rrfWindowSize,
                status: searchIndex.status,
                documentCount: searchIndex.documentCount,
                indexSizeBytes: searchIndex.indexSizeBytes,
                lastIndexedAt: searchIndex.lastIndexedAt,
                mappingVersion: searchIndex.mappingVersion,
                lastMappingSyncedAt: searchIndex.lastMappingSyncedAt,
                requiresReindex: searchIndex.requiresReindex,
                isActive: searchIndex.isActive,
                createdBy: searchIndex.createdBy,
                createdAt: searchIndex.createdAt,
                updatedAt: searchIndex.updatedAt,
                updatedBy: searchIndex.updatedBy,
            })
            .from(searchIndex)
            .where(eq(searchIndex.id, id))
            .limit(1);

        if (result.length === 0) {
            return null;
        }

        const indexData = result[0];

        // Get fields (from searchIndexFields)
        const fields = await db
            .select()
            .from(searchIndexFields)
            .where(eq(searchIndexFields.searchIndexId, id))
            .orderBy(
                desc(searchIndexFields.isSystemField),
                asc(searchIndexFields.fieldName)
            );

        // Get AI provider info if set
        let aiProviderInfo = undefined;
        if (indexData.aiProviderId) {
            const [provider] = await db
                .select({
                    id: aiProviders.id,
                    displayName: aiProviders.displayName,
                    providerKey: aiProviders.providerKey,
                })
                .from(aiProviders)
                .where(eq(aiProviders.id, indexData.aiProviderId))
                .limit(1);

            if (provider) {
                aiProviderInfo = provider;
            }
        }

        // Get AI model info if set
        let aiModelInfo = undefined;
        if (indexData.aiModelId) {
            const [model] = await db
                .select({
                    id: aiProviderModels.id,
                    displayName: aiProviderModels.displayName,
                    modelKey: aiProviderModels.modelKey,
                    dimensions: aiProviderModels.dimensions,
                })
                .from(aiProviderModels)
                .where(eq(aiProviderModels.id, indexData.aiModelId))
                .limit(1);

            if (model) {
                aiModelInfo = model;
            }
        }

        return {
            ...indexData,
            dataTemplate: null,
            analyzerConfig: indexData.analyzerConfig as Record<string, unknown>,
            fields,  // Changed from fieldMappings
            aiProvider: aiProviderInfo,
            aiModel: aiModelInfo,
        } as SearchIndexComplete;
    } catch (error) {
        logger.error('Failed to get search index by ID', error as Error, { id });
        throw error;
    }
}

/**
 * Get search index by name
 */
export async function getSearchIndexByName(name: string): Promise<SearchIndexComplete | null> {
    try {
        // First get the ID
        const [result] = await db
            .select({ id: searchIndex.id })
            .from(searchIndex)
            .where(eq(searchIndex.name, name))
            .limit(1);

        if (!result) {
            return null;
        }

        // Then get full index with relations
        return getSearchIndexById(result.id);
    } catch (error) {
        logger.error('Failed to get search index by name', error as Error, { name });
        throw error;
    }
}

/**
 * List search indexes with pagination and filtering
 */
export async function listSearchIndexes(
    query: ListSearchIndexesQuery
): Promise<{ items: SearchIndexSummary[]; total: number }> {
    try {
        const {
            page = 1,
            pageSize = 25,
            search,
            searchType,
            status,
            isActive,
            sortBy = 'createdAt',
            sortOrder = 'desc',
        } = query;

        // Build where conditions
        const conditions: SQL[] = [];

        if (search) {
            conditions.push(
                or(
                    ilike(searchIndex.name, `%${search}%`),
                    ilike(searchIndex.displayName, `%${search}%`),
                    ilike(searchIndex.description, `%${search}%`)
                ) as SQL
            );
        }

        if (searchType) {
            conditions.push(eq(searchIndex.searchType, searchType));
        }

        if (status) {
            conditions.push(eq(searchIndex.status, status));
        }

        if (isActive !== undefined) {
            conditions.push(eq(searchIndex.isActive, isActive));
        }

        const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

        // Get order by clause based on sort field
        const getOrderBy = () => {
            const direction = sortOrder === 'asc' ? asc : desc;
            switch (sortBy) {
                case 'name':
                    return direction(searchIndex.name);
                case 'displayName':
                    return direction(searchIndex.displayName);
                case 'updatedAt':
                    return direction(searchIndex.updatedAt);
                case 'documentCount':
                    return direction(searchIndex.documentCount);
                case 'createdAt':
                default:
                    return direction(searchIndex.createdAt);
            }
        };

        const orderBy = getOrderBy();

        // Get total count
        const [countResult] = await db
            .select({ count: count() })
            .from(searchIndex)
            .where(whereClause);

        const total = Number(countResult.count);

        // Get paginated items
        const offset = (page - 1) * pageSize;

        const items = await db
            .select({
                id: searchIndex.id,
                name: searchIndex.name,
                displayName: searchIndex.displayName,
                description: searchIndex.description,
                searchType: searchIndex.searchType,
                searchProvider: searchIndex.searchProvider,
                status: searchIndex.status,
                dataTemplateId: searchIndex.dataTemplateId,
                documentCount: searchIndex.documentCount,
                isActive: searchIndex.isActive,
                createdAt: searchIndex.createdAt,
                updatedAt: searchIndex.updatedAt,
            })
            .from(searchIndex)
            .where(whereClause)
            .orderBy(orderBy)
            .limit(pageSize)
            .offset(offset);

        // Map items to SearchIndexSummary (additional fields will be added by service layer)
        const summaryItems = items.map(item => ({
            ...item,
            templateName: null,
            templateSlug: '', // Will be populated by service if needed
            totalFields: 0,   // Will be populated by service if needed
            mappedFields: 0,  // Will be populated by service if needed
            hasAiConfig: false, // Will be populated by service if needed
        })) as SearchIndexSummary[];

        return { items: summaryItems, total };
    } catch (error) {
        logger.error('Failed to list search indexes', error as Error);
        throw error;
    }
}

/**
 * Get all active search indexes (for dropdowns)
 */
export async function getAllActiveSearchIndexes(): Promise<SearchIndexSummary[]> {
    try {
        const items = await db
            .select({
                id: searchIndex.id,
                name: searchIndex.name,
                displayName: searchIndex.displayName,
                description: searchIndex.description,
                searchType: searchIndex.searchType,
                searchProvider: searchIndex.searchProvider,
                status: searchIndex.status,
                dataTemplateId: searchIndex.dataTemplateId,
                documentCount: searchIndex.documentCount,
                isActive: searchIndex.isActive,
                createdAt: searchIndex.createdAt,
                updatedAt: searchIndex.updatedAt,
            })
            .from(searchIndex)
            .where(eq(searchIndex.isActive, true))
            .orderBy(asc(searchIndex.displayName));

        // Map items to SearchIndexSummary (additional fields will be added by service layer)
        const summaryItems = items.map(item => ({
            ...item,
            templateName: null,
            templateSlug: '', // Will be populated by service if needed
            totalFields: 0,   // Will be populated by service if needed
            mappedFields: 0,  // Will be populated by service if needed
            hasAiConfig: false, // Will be populated by service if needed
        })) as SearchIndexSummary[];

        return summaryItems;
    } catch (error) {
        logger.error('Failed to get active search indexes', error as Error);
        throw error;
    }
}

// ============================================================================
// SEARCH INDEX: UPDATE OPERATIONS
// ============================================================================

/**
 * Update search index
 */
export async function updateSearchIndex(
    id: string,
    data: Partial<NewSearchIndex>
): Promise<SearchIndex> {
    try {
        const [updated] = await db
            .update(searchIndex)
            .set({
                ...data,
                updatedAt: new Date(),
            })
            .where(eq(searchIndex.id, id))
            .returning();

        if (!updated) {
            throw new Error(`Search index with ID ${id} not found`);
        }

        logger.info('Updated search index', {
            indexId: id,
            updatedFields: Object.keys(data),
        });

        return updated;
    } catch (error) {
        logger.error('Failed to update search index', error as Error, { id });
        throw error;
    }
}

/**
 * Update search index status
 */
export async function updateSearchIndexStatus(
    id: string,
    status: string,
    additionalData?: {
        documentCount?: number;
        indexSizeBytes?: number;
        lastIndexedAt?: Date;
    }
): Promise<SearchIndex> {
    try {
        const updateData: Partial<NewSearchIndex> = {
            status: status as SearchIndex['status'],
            ...additionalData,
        };

        const [updated] = await db
            .update(searchIndex)
            .set({
                ...updateData,
                updatedAt: new Date(),
            })
            .where(eq(searchIndex.id, id))
            .returning();

        if (!updated) {
            throw new Error(`Search index with ID ${id} not found`);
        }

        logger.info('Updated search index status', {
            indexId: id,
            status,
        });

        return updated;
    } catch (error) {
        logger.error('Failed to update search index status', error as Error, { id, status });
        throw error;
    }
}

/**
 * Increment mapping version and set requiresReindex flag
 */
export async function incrementMappingVersion(
    id: string,
    requiresReindex: boolean = true
): Promise<SearchIndex> {
    try {
        const [updated] = await db
            .update(searchIndex)
            .set({
                mappingVersion: sql`${searchIndex.mappingVersion} + 1`,
                requiresReindex,
                updatedAt: new Date(),
            })
            .where(eq(searchIndex.id, id))
            .returning();

        if (!updated) {
            throw new Error(`Search index with ID ${id} not found`);
        }

        logger.info('Incremented mapping version', {
            indexId: id,
            newVersion: updated.mappingVersion,
            requiresReindex,
        });

        return updated;
    } catch (error) {
        logger.error('Failed to increment mapping version', error as Error, { id });
        throw error;
    }
}

/**
 * Mark mapping as synced (after ES update)
 */
export async function markMappingSynced(id: string): Promise<SearchIndex> {
    try {
        const [updated] = await db
            .update(searchIndex)
            .set({
                requiresReindex: false,
                lastMappingSyncedAt: new Date(),
                updatedAt: new Date(),
            })
            .where(eq(searchIndex.id, id))
            .returning();

        if (!updated) {
            throw new Error(`Search index with ID ${id} not found`);
        }

        logger.info('Marked mapping as synced', { indexId: id });

        return updated;
    } catch (error) {
        logger.error('Failed to mark mapping synced', error as Error, { id });
        throw error;
    }
}

// ============================================================================
// SEARCH INDEX: DELETE OPERATIONS
// ============================================================================

/**
 * Delete a search index (cascades to search_index_fields)
 */
export async function deleteSearchIndex(id: string): Promise<void> {
    try {
        await db
            .delete(searchIndex)
            .where(eq(searchIndex.id, id));

        logger.info('Deleted search index', { indexId: id });
    } catch (error) {
        logger.error('Failed to delete search index', error as Error, { id });
        throw error;
    }
}

// ============================================================================
// SEARCH INDEX: UTILITY OPERATIONS
// ============================================================================

/**
 * Check if index name exists
 */
export async function nameExists(name: string, excludeId?: string): Promise<boolean> {
    try {
        const conditions = excludeId
            ? and(eq(searchIndex.name, name), sql`${searchIndex.id} != ${excludeId}`)
            : eq(searchIndex.name, name);

        const [result] = await db
            .select({ count: count() })
            .from(searchIndex)
            .where(conditions);

        return Number(result.count) > 0;
    } catch (error) {
        logger.error('Failed to check index name existence', error as Error);
        throw error;
    }
}

export interface SearchIndexReference {
    type: 'search_experience' | 'data_source';
    id: string;
    name: string;
}

/**
 * Find configs that depend on a search index: search experiences (via the
 * junction table) and data sources (which link the index with an
 * `ON DELETE SET NULL` FK — so deleting the index would silently break them).
 */
export async function findSearchIndexReferences(searchIndexId: string): Promise<SearchIndexReference[]> {
    try {
        const [experienceRows, dataSourceRows] = await Promise.all([
            db.selectDistinct({ id: searchExperiences.id, name: searchExperiences.name })
                .from(searchExperienceIndexes)
                .innerJoin(searchExperiences, eq(searchExperienceIndexes.searchExperienceId, searchExperiences.id))
                .where(eq(searchExperienceIndexes.searchIndexId, searchIndexId)),
            db.select({ id: dataSources.id, name: dataSources.name })
                .from(dataSources)
                .where(eq(dataSources.searchIndexId, searchIndexId)),
        ]);

        return [
            ...experienceRows.map((r) => ({ type: 'search_experience' as const, id: r.id, name: r.name })),
            ...dataSourceRows.map((r) => ({ type: 'data_source' as const, id: r.id, name: r.name })),
        ];
    } catch (error) {
        logger.error('Failed to find search index references', error as Error, { searchIndexId });
        throw error;
    }
}

