// src/features/search-index/search-index.service.ts

/**
 * Search Index Feature - Service Layer
 * Business logic, caching, type transformations, and ES integration hooks
 * 
 * UPDATED: Uses searchIndexFields instead of indexFieldMappings
 */

import { CacheManager } from '@/shared/cache/cache-manager';
import { cacheConfig } from '@/config/cache.config';
import { createLogger } from '@/shared/logger/logger';
import * as repository from './search-index.repository';
import type { SearchIndexReference } from './search-index.repository';
import * as fieldsService from './search-index-fields.service';
import { invalidateSearchExperienceCacheBySearchIndex } from '@/features/search-experience';
import type {
    // DTOs
    CreateSearchIndexDTO,
    UpdateSearchIndexDTO,
    // Query types
    ListSearchIndexesQuery,
    // Domain types
    SearchIndexComplete,
    SearchIndexSummary,
    SearchIndexListResponse,
    IndexStats,
    MappingSyncStatus,
    // Enum types
    IndexStatus,
} from './search-index.types';
import type {
    SearchIndexExportDTO,
    SearchIndexFieldExportDTO,
    SearchIndexImportDTO,
 ChangeAIConfigDTO } from './search-index.validation';
import type { SearchIndex, NewSearchIndex } from '@/db/schema/search-index.schema';
import type { SearchIndexField } from '@/db/schema/search-index-fields.schema';
import { requiresAIConfiguration, SYSTEM_FIELD_MAPPING_CONFIGS , SearchType } from '@/shared/constants/search-index.constants';
import * as fieldsRepository from './search-index-fields.repository';
import { getSearchEngineProvider, type SearchProviderType } from '@/features/search/providers';
import { getProviderSettings, getProviderFieldSettings } from './provider-settings.utils';

const logger = createLogger('search-index-service');

/**
 * Thrown when a search index can't be deleted because search experiences or
 * data sources still depend on it. Carries the referrers for a 409 response.
 */
export class SearchIndexInUseError extends Error {
    constructor(public readonly references: SearchIndexReference[]) {
        const summary = references.map((r) => `${r.type} "${r.name}"`).join(', ');
        super(`Search index is still used by ${references.length} config(s): ${summary}. Remove those references before deleting.`);
        this.name = 'SearchIndexInUseError';
    }
}

// Cache TTL - use config or default to 5 minutes
const SEARCH_INDEX_CACHE_TTL = cacheConfig.features?.searchIndexes ?? 300;

// Store cache on globalThis to survive Next.js module re-evaluation in dev mode.
// Without this, delete and list calls can hit different CacheManager instances.
const globalKey = '__searchIndexCache';
const cache: CacheManager = (globalThis as Record<string, unknown>)[globalKey] as CacheManager
    ?? ((globalThis as Record<string, unknown>)[globalKey] = new CacheManager('search-index', {
        defaultTTL: SEARCH_INDEX_CACHE_TTL,
    }));

// ============================================================================
// TYPE MAPPERS (Transform API DTOs to Repository types)
// ============================================================================

/**
 * Map CreateSearchIndexDTO to repository insert type
 */
function mapSearchIndexDtoToInsert(
    input: CreateSearchIndexDTO,
    userId?: string
): Omit<NewSearchIndex, 'id' | 'createdAt' | 'updatedAt'> {
    // Build providerSettings: use the new JSON blob if populated, otherwise fall back to legacy fields
    const providerSettings = input.providerSettings && Object.keys(input.providerSettings).length > 0
        ? input.providerSettings
        : {
            numberOfShards: input.numberOfShards ?? 1,
            numberOfReplicas: input.numberOfReplicas ?? 0,
            refreshInterval: input.refreshInterval ?? '1s',
        };

    return {
        name: input.name,
        displayName: input.displayName,
        description: input.description ?? null,
        dataTemplateId: undefined,
        searchType: input.searchType,
        indexingStrategy: input.indexingStrategy ?? 'on_upload',
        searchProvider: input.searchProvider ?? 'elasticsearch',

        // Provider-agnostic settings (JSON blob)
        providerSettings,

        // Legacy ES-specific columns (kept for backward compat)
        numberOfShards: input.numberOfShards ?? 1,
        numberOfReplicas: input.numberOfReplicas ?? 0,
        refreshInterval: input.refreshInterval ?? '1s',

        // Text analysis
        language: input.language ?? 'english',
        synonyms: input.synonyms ?? [],
        stopWords: input.stopWords ?? [],
        analyzerConfig: input.analyzerConfig ?? {},

        // AI configuration
        aiProviderId: input.aiProviderId ?? null,
        aiModelId: input.aiModelId ?? null,
        embeddingDimensions: input.embeddingDimensions ?? null,
        vectorSimilarity: input.vectorSimilarity ?? 'cosine',

        // Hybrid search RRF
        rrfRankConstant: input.rrfRankConstant ?? 60,
        rrfWindowSize: input.rrfWindowSize ?? 100,

        // Initial state
        status: 'creating',
        documentCount: 0,
        indexSizeBytes: 0,
        lastIndexedAt: null,
        mappingVersion: 1,
        lastMappingSyncedAt: null,
        requiresReindex: false,
        isActive: true,

        // Audit
        createdBy: userId ?? null,
        updatedBy: null,
    };
}

// ============================================================================
// DEFAULT SYSTEM FIELDS
// ============================================================================

/**
 * System field definitions created automatically for every new search index.
 * These provide the baseline fields needed for document indexing to work.
 */
const DEFAULT_SYSTEM_FIELDS: Array<{
    fieldName: string;
    fieldType: string;
    displayName: string;
    isRequired: boolean;
    isSearchable: boolean;
    isFacetable: boolean;
    includeInResponse: boolean;
    isIndexed: boolean;
}> = [
    {
        fieldName: 'uniqueId',
        fieldType: 'keyword',
        displayName: 'Unique ID',
        isRequired: true,
        isSearchable: false,
        isFacetable: false,
        includeInResponse: true,
        isIndexed: true,
    },
    {
        fieldName: 'additionalData',
        fieldType: 'json',
        displayName: 'Additional Data',
        isRequired: false,
        isSearchable: false,
        isFacetable: false,
        includeInResponse: true,
        isIndexed: false,
    },
    {
        fieldName: 'customFields',
        fieldType: 'json',
        displayName: 'Custom Fields',
        isRequired: false,
        isSearchable: false,
        isFacetable: false,
        includeInResponse: true,
        isIndexed: false,
    },
];

/**
 * Create default system fields for a newly created search index.
 * Called automatically during index creation.
 */
async function createDefaultSystemFields(searchIndexId: string): Promise<void> {
    const fieldsToCreate = DEFAULT_SYSTEM_FIELDS.map((def) => {
        const mappingConfig = SYSTEM_FIELD_MAPPING_CONFIGS[def.fieldName] ?? { mode: 'source' as const, transform: 'none' as const };
        // System fields are "mapped" if they don't require user input to produce a value
        const isMapped = ['collect', 'generated', 'static'].includes(mappingConfig.mode)
            || (mappingConfig.mode === 'default' && (mappingConfig.staticValue !== undefined || mappingConfig.generator !== undefined));

        return {
            searchIndexId,
            fieldName: def.fieldName,
            fieldType: def.fieldType,
            displayName: def.displayName,
            originalTemplateFieldId: null,
            isSystemField: true,
            isRequired: def.isRequired,
            isSearchable: def.isSearchable,
            isFacetable: def.isFacetable,
            includeInResponse: def.includeInResponse,
            boostValue: 1.0,
            sourceFieldName: null,
            sourceFieldPath: null,
            isMapped,
            isIndexed: def.isIndexed,
            isVectorSource: false,
            isAutocomplete: false,
            customAnalyzer: null,
            transformConfig: mappingConfig as unknown as import('@/db/schema/search-index-fields.schema').NewSearchIndexField['transformConfig'],
        };
    });

    await fieldsRepository.createFields(fieldsToCreate);

    logger.info('Created default system fields', {
        searchIndexId,
        fieldCount: fieldsToCreate.length,
        fieldNames: fieldsToCreate.map(f => f.fieldName),
    });
}

// ============================================================================
// CREATE OPERATIONS
// ============================================================================

/**
 * Create a new search index with default system fields.
 */
export async function createSearchIndex(
    input: CreateSearchIndexDTO,
    userId: string
): Promise<SearchIndexComplete> {
    try {
        // Validate index name is unique
        const nameExists = await repository.nameExists(input.name);
        if (nameExists) {
            throw new Error(`Search index with name "${input.name}" already exists`);
        }

        // Validate AI configuration for semantic/hybrid search
        if (requiresAIConfiguration(input.searchType)) {
            if (!input.aiProviderId || !input.aiModelId || !input.embeddingDimensions) {
                throw new Error('AI provider, model, and embedding dimensions are required for semantic/hybrid search');
            }
        }

        // Map DTO to repository type
        const indexData = mapSearchIndexDtoToInsert(input, userId);

        // Create search index in database
        const createdIndex = await repository.createSearchIndexOnly(indexData);

        logger.info('Created search index', {
            indexId: createdIndex.id,
            name: createdIndex.name,
        });

        // Create default system fields for the new index
        await createDefaultSystemFields(createdIndex.id);

        // The physical provider index (Elasticsearch / Azure AI Search) is created
        // lazily — on first document indexing (see document-indexer.service) or via
        // the explicit provision/reindex paths — not at record-creation time.

        // Update status to ready
        await repository.updateSearchIndexStatus(createdIndex.id, 'ready');

        // Clear list cache
        await clearListCache();

        logger.info('Search index creation complete', {
            indexId: createdIndex.id,
            name: createdIndex.name,
            searchType: createdIndex.searchType,
            createdBy: userId,
        });

        // Return fresh data with updated status
        const result = await repository.getSearchIndexById(createdIndex.id);
        if (!result) {
            throw new Error('Failed to retrieve created search index');
        }

        return result;
    } catch (error) {
        logger.error('Failed to create search index', error as Error, {
            name: input.name,
            searchType: input.searchType,
        });
        throw error;
    }
}

// ============================================================================
// READ OPERATIONS
// ============================================================================

/**
 * Get search index by ID with all relations
 */
export async function getSearchIndexById(
    id: string
): Promise<SearchIndexComplete | null> {
    return cache.getOrSet(
        `index:${id}`,
        async () => {
            const searchIndex = await repository.getSearchIndexById(id);
            if (!searchIndex) {
                logger.warn('Search index not found', { id });
            }
            return searchIndex;
        },
        SEARCH_INDEX_CACHE_TTL
    );
}

/**
 * Get search index by name
 */
export async function getSearchIndexByName(
    name: string
): Promise<SearchIndexComplete | null> {
    return cache.getOrSet(
        `index:name:${name}`,
        async () => {
            const searchIndex = await repository.getSearchIndexByName(name);
            if (!searchIndex) {
                logger.warn('Search index not found by name', { name });
            }
            return searchIndex;
        },
        SEARCH_INDEX_CACHE_TTL
    );
}

/**
 * List search indexes with pagination and filtering
 */
export async function listSearchIndexes(
    query: ListSearchIndexesQuery
): Promise<SearchIndexListResponse> {
    // Generate cache key from query params
    const cacheKey = `list:${JSON.stringify(query)}`;

    return cache.getOrSet(
        cacheKey,
        async () => {
            const { items, total } = await repository.listSearchIndexes(query);

            const totalPages = Math.ceil(total / (query.pageSize ?? 25));
            const page = query.page ?? 1;

            return {
                items,
                pagination: {
                    page,
                    pageSize: query.pageSize ?? 25,
                    totalPages,
                    totalItems: total,
                    hasNextPage: page < totalPages,
                    hasPreviousPage: page > 1,
                },
            };
        },
        SEARCH_INDEX_CACHE_TTL
    );
}

/**
 * Get all active search indexes (for dropdowns)
 */
export async function getAllActiveSearchIndexes(): Promise<SearchIndexSummary[]> {
    return cache.getOrSet(
        'list:active',
        async () => {
            return await repository.getAllActiveSearchIndexes();
        },
        SEARCH_INDEX_CACHE_TTL
    );
}

// ============================================================================
// UPDATE OPERATIONS
// ============================================================================

/**
 * Update search index metadata and settings
 */
export async function updateSearchIndex(
    id: string,
    input: UpdateSearchIndexDTO,
    userId: string
): Promise<SearchIndexComplete> {
    try {
        // Check if index exists
        const existing = await repository.getSearchIndexById(id);
        if (!existing) {
            throw new Error(`Search index with ID ${id} not found`);
        }

        // Build update data
        const updateData: Partial<NewSearchIndex> = {
            updatedBy: userId,
        };

        if (input.displayName !== undefined) updateData.displayName = input.displayName;
        if (input.description !== undefined) updateData.description = input.description;
        if (input.numberOfReplicas !== undefined) updateData.numberOfReplicas = input.numberOfReplicas;
        if (input.refreshInterval !== undefined) updateData.refreshInterval = input.refreshInterval;
        if (input.language !== undefined) updateData.language = input.language;
        if (input.synonyms !== undefined) updateData.synonyms = input.synonyms;
        if (input.stopWords !== undefined) updateData.stopWords = input.stopWords;
        if (input.analyzerConfig !== undefined) updateData.analyzerConfig = input.analyzerConfig ?? {};
        if (input.rrfRankConstant !== undefined) updateData.rrfRankConstant = input.rrfRankConstant;
        if (input.rrfWindowSize !== undefined) updateData.rrfWindowSize = input.rrfWindowSize;

        // Update in database
        await repository.updateSearchIndex(id, updateData);

        // Analyzer-affecting settings (synonyms, stop words, analyzer config) can't be
        // changed in place on the provider index — they take effect on the next reindex.
        // The stored config is the source of truth; reindexing rebuilds the index from it.

        // Clear caches
        await clearIndexCache(id, existing.name);

        // Invalidate search experience cache for any experiences using this index
        await invalidateSearchExperienceCacheBySearchIndex(id);

        logger.info('Updated search index', {
            indexId: id,
            updatedBy: userId,
            updatedFields: Object.keys(input),
        });

        // Return updated index
        const updated = await repository.getSearchIndexById(id);
        if (!updated) {
            throw new Error('Failed to retrieve updated search index');
        }

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
    status: IndexStatus,
    additionalData?: {
        documentCount?: number;
        indexSizeBytes?: number;
        lastIndexedAt?: Date;
    }
): Promise<SearchIndex> {
    try {
        const updated = await repository.updateSearchIndexStatus(id, status, additionalData);

        // Clear cache
        await cache.delete(`index:${id}`);

        // Invalidate search experience cache for any experiences using this index
        await invalidateSearchExperienceCacheBySearchIndex(id);

        logger.info('Updated search index status', {
            indexId: id,
            status,
            ...additionalData,
        });

        return updated;
    } catch (error) {
        logger.error('Failed to update search index status', error as Error, { id, status });
        throw error;
    }
}

/**
 * Activate or deactivate a search index
 */
export async function setSearchIndexActive(
    id: string,
    isActive: boolean,
    userId: string
): Promise<SearchIndexComplete> {
    try {
        const existing = await repository.getSearchIndexById(id);
        if (!existing) {
            throw new Error(`Search index with ID ${id} not found`);
        }

        await repository.updateSearchIndex(id, {
            isActive,
            updatedBy: userId
        });

        // Clear caches
        await clearIndexCache(id, existing.name);

        // Invalidate search experience cache for any experiences using this index
        await invalidateSearchExperienceCacheBySearchIndex(id);

        logger.info('Updated search index active status', {
            indexId: id,
            isActive,
            updatedBy: userId,
        });

        const updated = await repository.getSearchIndexById(id);
        if (!updated) {
            throw new Error('Failed to retrieve updated search index');
        }

        return updated;
    } catch (error) {
        logger.error('Failed to set search index active status', error as Error, { id, isActive });
        throw error;
    }
}

/**
 * Change AI configuration for a search index
 *
 * This is a DESTRUCTIVE operation that:
 * 1. Deletes the Elasticsearch index (and all its documents)
 * 2. Updates the AI provider, model, and embedding dimensions in the database
 * 3. Resets the index status to 'ready' (requires re-indexing)
 *
 * Use case: User wants to switch to a different embedding model
 */
export async function changeAIConfiguration(
    id: string,
    input: ChangeAIConfigDTO,
    userId: string
): Promise<{ success: boolean; searchIndex: SearchIndexComplete; documentsDeleted: number }> {
    try {
        // 1. Get existing search index
        const existing = await repository.getSearchIndexById(id);
        if (!existing) {
            throw new Error(`Search index with ID ${id} not found`);
        }

        // 2. Verify this is a semantic or hybrid index
        if (!requiresAIConfiguration(existing.searchType as SearchType)) {
            throw new Error('Cannot change AI configuration for lexical search indexes');
        }

        // 3. Get current document count before deletion
        const provider = getSearchEngineProvider(existing.searchProvider as SearchProviderType);
        let documentsDeleted = 0;
        const providerIndexExists = await provider.indexExists(existing.name);
        if (providerIndexExists) {
            const stats = await provider.getIndexStats(existing.name);
            documentsDeleted = stats?.documentCount ?? 0;
        }

        // 4. Delete the search provider index if it exists
        if (providerIndexExists) {
            const deleteResult = await provider.deleteIndex(existing.name);
            if (!deleteResult.success) {
                throw new Error(`Failed to delete search index: ${deleteResult.error}`);
            }
            logger.info('Deleted search index for AI config change', {
                indexId: id,
                indexName: existing.name,
                documentsDeleted,
            });
        }

        // 5. Update the database with new AI configuration
        const updateData: Partial<NewSearchIndex> = {
            aiProviderId: input.aiProviderId,
            aiModelId: input.aiModelId,
            embeddingDimensions: input.embeddingDimensions,
            vectorSimilarity: input.vectorSimilarity || existing.vectorSimilarity,
            // Reset document counts since ES index is deleted
            documentCount: 0,
            indexSizeBytes: null,
            lastIndexedAt: null,
            updatedBy: userId,
        };

        await repository.updateSearchIndex(id, updateData);

        // 6. Update status to 'ready' (not 'active' since there are no documents)
        await repository.updateSearchIndexStatus(id, 'ready');

        // 7. Clear caches
        await clearIndexCache(id, existing.name);

        // 8. Invalidate search experience cache
        await invalidateSearchExperienceCacheBySearchIndex(id);

        logger.info('Changed AI configuration for search index', {
            indexId: id,
            indexName: existing.name,
            oldProviderId: existing.aiProviderId,
            newProviderId: input.aiProviderId,
            oldModelId: existing.aiModelId,
            newModelId: input.aiModelId,
            oldDimensions: existing.embeddingDimensions,
            newDimensions: input.embeddingDimensions,
            documentsDeleted,
            changedBy: userId,
        });

        // 9. Return updated search index
        const updated = await repository.getSearchIndexById(id);
        if (!updated) {
            throw new Error('Failed to retrieve updated search index');
        }

        return {
            success: true,
            searchIndex: updated,
            documentsDeleted,
        };
    } catch (error) {
        logger.error('Failed to change AI configuration', error as Error, { id });
        throw error;
    }
}

// ============================================================================
// DELETE OPERATIONS
// ============================================================================

/**
 * Delete a search index
 */
export async function deleteSearchIndex(
    id: string,
    userId: string
): Promise<void> {
    try {
        const existing = await repository.getSearchIndexById(id);
        if (!existing) {
            throw new Error(`Search index with ID ${id} not found`);
        }

        // Refuse to delete an index that experiences or data sources still depend on.
        // (The data_sources FK is ON DELETE SET NULL, so a delete would silently
        // break those configs rather than fail loudly.)
        const references = await repository.findSearchIndexReferences(id);
        if (references.length > 0) {
            throw new SearchIndexInUseError(references);
        }

        // Delete the physical provider index (Elasticsearch / Azure AI Search) if present.
        const provider = getSearchEngineProvider(existing.searchProvider as SearchProviderType);
        if (await provider.indexExists(existing.name)) {
            const deleteResult = await provider.deleteIndex(existing.name);
            if (!deleteResult.success) {
                throw new Error(`Failed to delete provider index "${existing.name}": ${deleteResult.error}`);
            }
        }

        // Invalidate search experience cache BEFORE deleting
        // (so we can still look up which experiences use this index)
        await invalidateSearchExperienceCacheBySearchIndex(id);

        // Delete from database (cascades to search_index_fields)
        await repository.deleteSearchIndex(id);

        // Clear ALL caches — ensures list totals, stats, etc. are fresh
        await cache.clear();

        logger.info('Deleted search index', {
            indexId: id,
            name: existing.name,
            deletedBy: userId,
        });
    } catch (error) {
        logger.error('Failed to delete search index', error as Error, { id });
        throw error;
    }
}

// ============================================================================
// FIELD OPERATIONS (Re-export from fields service)
// ============================================================================

/**
 * Get fields for a search index
 */
export async function getFields(searchIndexId: string): Promise<SearchIndexField[]> {
    return fieldsService.getFields(searchIndexId);
}

/**
 * Get field mapping summary
 */
export async function getFieldMappingSummary(searchIndexId: string) {
    return fieldsService.getFieldMappingSummary(searchIndexId);
}

/**
 * Check if index is ready for indexing
 */
export async function isReadyForIndexing(searchIndexId: string): Promise<boolean> {
    return fieldsService.isReadyForIndexing(searchIndexId);
}

/**
 * Validate mappings before indexing
 */
export async function validateMappingsForIndexing(searchIndexId: string) {
    return fieldsService.validateMappings(searchIndexId);
}

// ============================================================================
// VALIDATION & UTILITY
// ============================================================================

/**
 * Check if index name is available
 */
export async function isNameAvailable(
    name: string,
    excludeId?: string
): Promise<boolean> {
    const exists = await repository.nameExists(name, excludeId);
    return !exists;
}

/**
 * Get mapping sync status for an index
 */
export async function getMappingSyncStatus(
    searchIndexId: string
): Promise<MappingSyncStatus> {
    const searchIndex = await repository.getSearchIndexById(searchIndexId);
    if (!searchIndex) {
        throw new Error(`Search index with ID ${searchIndexId} not found`);
    }

    // Sync status is derived from the tracked `requiresReindex` flag (set when a
    // mapping-affecting change is made), not from a live provider mapping diff.

    return {
        isSynced: !searchIndex.requiresReindex,
        requiresReindex: searchIndex.requiresReindex,
        lastSyncedAt: searchIndex.lastMappingSyncedAt,
        pendingChanges: searchIndex.requiresReindex ? ['Mapping changes pending'] : [],
    };
}

/**
 * Mark mapping as synced (after ES update)
 */
export async function markMappingSynced(
    searchIndexId: string
): Promise<void> {
    await repository.markMappingSynced(searchIndexId);
    await cache.delete(`index:${searchIndexId}`);

    logger.info('Marked mapping as synced', { searchIndexId });
}

// ============================================================================
// INDEXING OPERATIONS (Placeholders for ES integration)
// ============================================================================

/**
 * Get index statistics — fetches live stats from the search provider
 * and syncs them back to the DB if they differ.
 */
export async function getIndexStats(
    searchIndexId: string
): Promise<IndexStats> {
    const searchIndex = await repository.getSearchIndexById(searchIndexId);
    if (!searchIndex) {
        throw new Error(`Search index with ID ${searchIndexId} not found`);
    }

    // Try to fetch live stats from the search provider
    try {
        const provider = getSearchEngineProvider(searchIndex.searchProvider as SearchProviderType);
        const providerStats = await provider.getIndexStats(searchIndex.name);

        if (providerStats) {
            // Sync DB if provider stats differ
            const dbDocCount = searchIndex.documentCount ?? 0;
            const dbSizeBytes = searchIndex.indexSizeBytes ?? 0;
            const providerDocCount = providerStats.documentCount ?? 0;
            const providerSizeBytes = providerStats.sizeInBytes ?? 0;

            if (dbDocCount !== providerDocCount || dbSizeBytes !== providerSizeBytes) {
                const updateData: Record<string, unknown> = {
                    documentCount: providerDocCount,
                    indexSizeBytes: providerSizeBytes,
                };

                // If DB says error but the index exists with docs, fix the status
                if (searchIndex.status === 'error' && providerDocCount > 0) {
                    updateData.status = 'ready';
                }

                await repository.updateSearchIndex(searchIndexId, updateData as Partial<typeof searchIndex>).catch(err => {
                    logger.warn('Failed to sync provider stats to DB', { searchIndexId, error: (err as Error).message });
                });
            }

            return {
                documentCount: providerDocCount,
                indexSizeBytes: providerSizeBytes,
                lastIndexedAt: searchIndex.lastIndexedAt,
                health: providerStats.health === 'unknown' ? 'green' : (providerStats.health ?? 'green'),
            };
        }
    } catch (error) {
        logger.warn('Failed to fetch live stats from provider, falling back to DB', {
            searchIndexId,
            error: (error as Error).message,
        });
    }

    // Fallback to DB values
    return {
        documentCount: searchIndex.documentCount,
        indexSizeBytes: searchIndex.indexSizeBytes ?? 0,
        lastIndexedAt: searchIndex.lastIndexedAt,
        health: searchIndex.status === 'error' ? 'red' : 'green',
    };
}

/**
 * Trigger reindex for an index
 *
 * This performs a full reindex:
 * 1. Fetch all documents from ES
 * 2. Delete the ES index
 * 3. Recreate with updated mappings (including autocomplete analyzers)
 * 4. Re-index all documents
 */
export async function triggerReindex(
    searchIndexId: string,
    userId: string
): Promise<ReindexResult> {
    const searchIndex = await repository.getSearchIndexById(searchIndexId);
    if (!searchIndex) {
        throw new Error(`Search index with ID ${searchIndexId} not found`);
    }

    const provider = getSearchEngineProvider(searchIndex.searchProvider as SearchProviderType);

    const indexName = searchIndex.name;
    const startTime = Date.now();

    logger.info('Starting reindex', {
        searchIndexId,
        indexName,
        triggeredBy: userId,
    });

    // Update status to indexing
    await repository.updateSearchIndexStatus(searchIndexId, 'indexing');

    try {
        // Step 1: Fetch all existing documents (gracefully handle missing index)
        let documents: Array<{ _id: string; _source: Record<string, unknown> }> = [];

        const indexExistsNow = await provider.indexExists(indexName);
        if (indexExistsNow) {
            logger.info('Fetching existing documents', { indexName });
            const fetchResult = await provider.fetchAllDocuments(indexName);

            if (fetchResult.success) {
                documents = fetchResult.documents;
                logger.info('Fetched documents for reindex', {
                    indexName,
                    documentCount: documents.length,
                });
            } else {
                logger.warn('Failed to fetch documents, proceeding with empty index', {
                    indexName,
                    error: fetchResult.error,
                });
            }

            // Step 2: Delete the existing index
            logger.info('Deleting existing index', { indexName });
            const deleteResult = await provider.deleteIndex(indexName);

            if (!deleteResult.success) {
                throw new Error(`Failed to delete index: ${deleteResult.error}`);
            }
        } else {
            logger.info('Index does not exist, will create fresh', { indexName });
        }

        // Step 3: Get field configurations and build provider-native index settings
        const fields = await fieldsService.getFieldsBySearchIndexId(searchIndexId);

        // Get embedding config from the DB record (not from documents, since vector
        // fields may not be retrievable — e.g. Azure sets retrievable:false on vectors)
        let embeddingConfig: { fieldName: string; dimensions: number; similarity: string } | undefined;
        if (searchIndex.aiProviderId && searchIndex.aiModelId && searchIndex.embeddingDimensions) {
            embeddingConfig = {
                fieldName: 'content_embedding',
                dimensions: searchIndex.embeddingDimensions,
                similarity: searchIndex.vectorSimilarity || 'cosine',
            };
        }

        // Let the provider build its own native index settings
        const indexConfig = provider.buildIndexSettings({
            fields: fields.map(f => ({
                fieldName: f.fieldName,
                fieldType: f.fieldType,
                isSearchable: f.isSearchable,
                isFacetable: f.isFacetable,
                isAutocomplete: f.isAutocomplete,
                providerFieldSettings: getProviderFieldSettings(f),
            })),
            providerSettings: getProviderSettings(searchIndex),
            embeddingConfig,
            synonyms: Array.isArray(searchIndex.synonyms) ? (searchIndex.synonyms as string[]) : [],
        });

        logger.info('Built index settings via provider', {
            indexName,
            fieldCount: fields.length,
            hasEmbedding: !!embeddingConfig,
            provider: searchIndex.searchProvider,
        });

        // Step 4: Create the new index with provider-built settings
        logger.info('Creating index with new mappings', { indexName });
        const createResult = await provider.createIndex(indexName, indexConfig);

        if (!createResult.success) {
            throw new Error(`Failed to create index: ${createResult.error}`);
        }

        // Step 5: Re-index all documents
        if (documents.length > 0) {
            logger.info('Re-indexing documents', {
                indexName,
                documentCount: documents.length,
            });

            // Convert scroll documents to bulk format, preserving IDs
            const bulkDocs = documents.map(doc => ({
                _id: doc._id,
                ...doc._source,
            }));

            const bulkResult = await provider.bulkIndex(indexName, bulkDocs, { refresh: true });

            if (bulkResult.failed > 0) {
                logger.warn('Some documents failed to reindex', {
                    indexName,
                    indexed: bulkResult.indexed,
                    failed: bulkResult.failed,
                    errors: bulkResult.errors.slice(0, 5),
                });
            }

            // Update index stats via updateSearchIndex
            await repository.updateSearchIndex(searchIndexId, {
                documentCount: bulkResult.indexed,
                lastIndexedAt: new Date(),
            });
        }

        // Refresh index to make all docs searchable
        await provider.refreshIndex(indexName);

        // Update status back to active
        await repository.updateSearchIndexStatus(searchIndexId, 'active');

        // Clear caches so UI gets fresh data
        await clearIndexCache(searchIndexId, indexName);

        const durationMs = Date.now() - startTime;

        logger.info('Reindex completed', {
            searchIndexId,
            indexName,
            documentCount: documents.length,
            durationMs,
            triggeredBy: userId,
        });

        return {
            success: true,
            documentCount: documents.length,
            durationMs,
        };

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        logger.error('Reindex failed', {
            searchIndexId,
            indexName,
            error: errorMessage,
            triggeredBy: userId,
        });

        // Update status to failed
        await repository.updateSearchIndexStatus(searchIndexId, 'error');
        await clearIndexCache(searchIndexId, indexName);

        throw new Error(`Reindex failed: ${errorMessage}`);
    }
}

export interface ReindexResult {
    success: boolean;
    documentCount: number;
    durationMs: number;
}

// ============================================================================
// RECREATE EMPTY INDEX
// ============================================================================

/**
 * Recreate the search provider index from DB field definitions.
 *
 * Use this when the provider index is missing (e.g. after a failed reindex
 * deleted it) and you need to restore the index structure without documents.
 * After calling this, documents can be re-uploaded through the normal indexing flow.
 */
export async function recreateEmptyIndex(
    searchIndexId: string,
    userId: string
): Promise<{ success: boolean; error?: string }> {
    const searchIndex = await repository.getSearchIndexById(searchIndexId);
    if (!searchIndex) {
        throw new Error(`Search index with ID ${searchIndexId} not found`);
    }

    const provider = getSearchEngineProvider(searchIndex.searchProvider as SearchProviderType);
    const indexName = searchIndex.name;

    logger.info('Recreating empty index', {
        searchIndexId,
        indexName,
        triggeredBy: userId,
    });

    try {
        // Delete if it somehow exists (stale/partial state)
        const exists = await provider.indexExists(indexName);
        if (exists) {
            const deleteResult = await provider.deleteIndex(indexName);
            if (!deleteResult.success) {
                throw new Error(`Failed to delete existing index: ${deleteResult.error}`);
            }
        }

        // Get field definitions from DB
        const fields = await fieldsService.getFieldsBySearchIndexId(searchIndexId);

        // Detect embedding config from the index record
        let embeddingConfig: { fieldName: string; dimensions: number; similarity: string } | undefined;
        if (searchIndex.aiProviderId && searchIndex.aiModelId && searchIndex.embeddingDimensions) {
            embeddingConfig = {
                fieldName: 'content_embedding',
                dimensions: searchIndex.embeddingDimensions,
                similarity: searchIndex.vectorSimilarity || 'cosine',
            };
        }

        // Build provider-native index settings from DB definitions
        const indexConfig = provider.buildIndexSettings({
            fields: fields.map(f => ({
                fieldName: f.fieldName,
                fieldType: f.fieldType,
                isSearchable: f.isSearchable,
                isFacetable: f.isFacetable,
                isAutocomplete: f.isAutocomplete,
                providerFieldSettings: getProviderFieldSettings(f),
            })),
            providerSettings: getProviderSettings(searchIndex),
            embeddingConfig,
            synonyms: Array.isArray(searchIndex.synonyms) ? (searchIndex.synonyms as string[]) : [],
        });

        // Create the index
        const createResult = await provider.createIndex(indexName, indexConfig);
        if (!createResult.success) {
            throw new Error(`Failed to create index: ${createResult.error}`);
        }

        // Update status to ready (empty, but structurally valid)
        await repository.updateSearchIndex(searchIndexId, {
            documentCount: 0,
        });
        await repository.updateSearchIndexStatus(searchIndexId, 'ready');

        // Clear caches so UI gets fresh data
        await clearIndexCache(searchIndexId, indexName);

        logger.info('Empty index recreated successfully', { indexName, fieldCount: fields.length });

        return { success: true };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error('Failed to recreate empty index', {
            searchIndexId,
            indexName,
            error: errorMessage,
        });
        await repository.updateSearchIndexStatus(searchIndexId, 'error');
        await clearIndexCache(searchIndexId, indexName);
        return { success: false, error: errorMessage };
    }
}

// ============================================================================
// CACHE MANAGEMENT
// ============================================================================

/**
 * Clear cache for a specific index
 */
async function clearIndexCache(id: string, name: string): Promise<void> {
    await Promise.all([
        cache.delete(`index:${id}`),
        cache.delete(`index:name:${name}`),
    ]);
}

/**
 * Clear all list caches
 */
async function clearListCache(): Promise<void> {
    // Clear all cache since list keys are dynamic
    await cache.clear();
    logger.debug('Cleared search index list caches');
}

/**
 * Clear all caches for this feature
 */
export async function clearAllCache(): Promise<void> {
    await cache.clear();
    logger.info('Cleared all search index caches');
}

/**
 * Get cache statistics
 */
export function getCacheStats() {
    return cache.getStats();
}

// ============================================================================
// EXPORT/IMPORT OPERATIONS
// ============================================================================

/**
 * Export search index preview response type
 */
export interface SearchIndexImportPreview {
    searchIndex: {
        name: string;
        displayName: string;
        searchType: string;
        nameConflict: boolean;
        suggestedName?: string;
    };
    template: {
        slug: string;
        found: boolean;
        matchedTemplateId?: number;
        matchedTemplateName?: string;
    };
    fieldCount: number;
    requiresAIConfig: boolean;
    warnings: string[];
}

/**
 * Export search index result type
 */
export interface SearchIndexImportResult {
    success: boolean;
    searchIndexId?: string;
    message: string;
    warnings?: string[];
}

/**
 * Export a search index with all its fields
 */
export async function exportSearchIndex(
    id: string,
    userId?: string
): Promise<SearchIndexExportDTO> {
    const searchIndexData = await repository.getSearchIndexById(id);
    if (!searchIndexData) {
        throw new Error(`Search index with ID ${id} not found`);
    }

    // Get all fields
    const fields = await fieldsService.getFields(id);

    // Map fields to export format
    const exportFields: SearchIndexFieldExportDTO[] = fields.map(field => ({
        fieldName: field.fieldName,
        fieldType: field.fieldType,
        displayName: field.displayName,
        isSystemField: field.isSystemField,
        isRequired: field.isRequired,
        isSearchable: field.isSearchable,
        isFacetable: field.isFacetable,
        includeInResponse: field.includeInResponse,
        boostValue: field.boostValue,
        sourceFieldName: field.sourceFieldName,
        sourceFieldPath: field.sourceFieldPath,
        isMapped: field.isMapped,
        isIndexed: field.isIndexed,
        isVectorSource: field.isVectorSource,
        isAutocomplete: field.isAutocomplete,
        customAnalyzer: field.customAnalyzer,
        transformConfig: field.transformConfig as unknown as Record<string, unknown> | undefined,
    }));

    const exportData: SearchIndexExportDTO = {
        version: '1.0',
        exportedAt: new Date().toISOString(),
        exportedBy: userId,
        searchIndex: {
            name: searchIndexData.name,
            displayName: searchIndexData.displayName,
            description: searchIndexData.description,
            templateSlug: '',
            searchType: searchIndexData.searchType as 'lexical' | 'semantic' | 'hybrid',
            indexingStrategy: searchIndexData.indexingStrategy as 'on_upload' | 'scheduled' | 'manual',
            numberOfShards: searchIndexData.numberOfShards,
            numberOfReplicas: searchIndexData.numberOfReplicas,
            refreshInterval: searchIndexData.refreshInterval,
            language: searchIndexData.language,
            synonyms: searchIndexData.synonyms || [],
            stopWords: searchIndexData.stopWords || [],
            analyzerConfig: searchIndexData.analyzerConfig as Record<string, unknown> | undefined,
            embeddingDimensions: searchIndexData.embeddingDimensions,
            vectorSimilarity: searchIndexData.vectorSimilarity as 'cosine' | 'euclidean' | 'dot_product' | null,
            rrfRankConstant: searchIndexData.rrfRankConstant,
            rrfWindowSize: searchIndexData.rrfWindowSize,
        },
        fields: exportFields,
    };

    logger.info('Exported search index', {
        indexId: id,
        name: searchIndexData.name,
        fieldCount: exportFields.length,
        exportedBy: userId,
    });

    return exportData;
}

/**
 * Preview import of a search index
 * Checks for name conflicts and template matching
 */
export async function previewSearchIndexImport(
    importData: SearchIndexExportDTO
): Promise<SearchIndexImportPreview> {
    const warnings: string[] = [];

    // Check for name conflict
    const nameExists = await repository.nameExists(importData.searchIndex.name);
    let suggestedName: string | undefined;

    if (nameExists) {
        // Generate a suggested unique name
        const baseName = importData.searchIndex.name;
        let counter = 1;
        let candidateName = `${baseName}-${counter}`;
        while (await repository.nameExists(candidateName)) {
            counter++;
            candidateName = `${baseName}-${counter}`;
        }
        suggestedName = candidateName;
        warnings.push(`An index named "${importData.searchIndex.name}" already exists.`);
    }

    // Data templates feature has been removed; skip template matching
    const matchedTemplateId: number | undefined = undefined;
    const matchedTemplateName: string | undefined = undefined;
    const templateFound = false;

    // Check if AI config is required
    const requiresAI = requiresAIConfiguration(importData.searchIndex.searchType);
    if (requiresAI) {
        warnings.push('This is a semantic/hybrid search index. You will need to configure AI provider and model.');
    }

    return {
        searchIndex: {
            name: importData.searchIndex.name,
            displayName: importData.searchIndex.displayName,
            searchType: importData.searchIndex.searchType,
            nameConflict: nameExists,
            suggestedName,
        },
        template: {
            slug: importData.searchIndex.templateSlug,
            found: templateFound,
            matchedTemplateId,
            matchedTemplateName,
        },
        fieldCount: importData.fields.length,
        requiresAIConfig: requiresAI,
        warnings,
    };
}

/**
 * Import a search index from exported data
 */
export async function importSearchIndex(
    input: SearchIndexImportDTO,
    userId: string
): Promise<SearchIndexImportResult> {
    const { importData, overrideName, aiConfig } = input;
    const warnings: string[] = [];

    try {
        // Determine final name
        const finalName = overrideName || importData.searchIndex.name;

        // Validate name is unique
        const nameExists = await repository.nameExists(finalName);
        if (nameExists) {
            throw new Error(`Search index with name "${finalName}" already exists`);
        }

        // Validate AI configuration for semantic/hybrid search
        const requiresAI = requiresAIConfiguration(importData.searchIndex.searchType);
        if (requiresAI && !aiConfig) {
            throw new Error('AI configuration is required for semantic/hybrid search');
        }

        // Build create input
        const createInput: CreateSearchIndexDTO = {
            name: finalName,
            displayName: importData.searchIndex.displayName,
            description: importData.searchIndex.description ?? undefined,
            searchType: importData.searchIndex.searchType,
            indexingStrategy: importData.searchIndex.indexingStrategy,
            numberOfShards: importData.searchIndex.numberOfShards,
            numberOfReplicas: importData.searchIndex.numberOfReplicas,
            refreshInterval: importData.searchIndex.refreshInterval,
            language: importData.searchIndex.language,
            synonyms: importData.searchIndex.synonyms,
            stopWords: importData.searchIndex.stopWords,
            analyzerConfig: importData.searchIndex.analyzerConfig as { tokenizer?: string; filters?: string[]; charFilters?: string[] } | undefined,
            embeddingDimensions: aiConfig?.embeddingDimensions ?? importData.searchIndex.embeddingDimensions ?? undefined,
            vectorSimilarity: importData.searchIndex.vectorSimilarity ?? 'cosine',
            rrfRankConstant: importData.searchIndex.rrfRankConstant,
            rrfWindowSize: importData.searchIndex.rrfWindowSize,
            aiProviderId: aiConfig?.aiProviderId,
            aiModelId: aiConfig?.aiModelId,
        };

        // Map DTO to repository type
        const indexData = mapSearchIndexDtoToInsert(createInput, userId);

        // Create search index in database
        const createdIndex = await repository.createSearchIndexOnly(indexData);

        logger.info('Created search index from import', {
            indexId: createdIndex.id,
            name: createdIndex.name,
        });

        // Instead of snapshotting from template, import the exported fields directly
        // Type assertion needed because Zod schema has optional fields but we've already validated
        const fieldCount = await fieldsService.importFields(
            createdIndex.id,
            importData.fields as Parameters<typeof fieldsService.importFields>[1]
        );

        logger.info('Imported fields to search index', {
            indexId: createdIndex.id,
            fieldCount,
        });

        // If field count differs from exported fields, add warning
        if (fieldCount !== importData.fields.length) {
            warnings.push(`Imported ${fieldCount} fields, expected ${importData.fields.length}`);
        }

        // Update status to ready
        await repository.updateSearchIndexStatus(createdIndex.id, 'ready');

        // Clear list cache
        await clearListCache();

        logger.info('Search index import complete', {
            indexId: createdIndex.id,
            name: createdIndex.name,
            searchType: createdIndex.searchType,
            fieldCount,
            importedBy: userId,
        });

        return {
            success: true,
            searchIndexId: createdIndex.id,
            message: `Successfully imported search index "${createdIndex.displayName}" with ${fieldCount} fields`,
            warnings: warnings.length > 0 ? warnings : undefined,
        };
    } catch (error) {
        logger.error('Failed to import search index', error as Error, {
            name: importData.searchIndex.name,
        });
        throw error;
    }
}