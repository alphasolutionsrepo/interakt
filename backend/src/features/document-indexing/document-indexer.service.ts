// src/features/document-indexing/document-indexer.service.ts

/**
 * Document Indexer Service
 *
 * Orchestrates the document indexing workflow:
 * 1. Create indexing batch record
 * 2. Validate field mappings
 * 3. Transform documents
 * 4. Generate embeddings (for semantic/hybrid indexes)
 * 5. Index to Elasticsearch
 * 6. Update batch and index stats
 */

import 'server-only';

import { db } from '@/db/index';
import { indexingBatches, type IndexingBatch } from '@/db/schema/indexing-batches.schema';
import { searchIndex } from '@/db/schema/search-index.schema';
import { eq, desc } from 'drizzle-orm';
import { createLogger } from '@/shared/logger/logger';
import { elasticsearchConfig } from '../../../config';
import { getSearchEngineProvider, type SearchProviderType } from '@/features/search/providers';
import {
    transformDocuments,
    validateFieldMappings,
} from './document-transformer.service';
import * as fieldsService from '@/features/search-index/search-index-fields.service';
import * as fieldsRepository from '@/features/search-index/search-index-fields.repository';
import { generateEmbeddings } from '@/features/ai-service';
import type { SearchIndexField } from '@/db/schema/search-index-fields.schema';
import { getProviderSettings, getProviderFieldSettings } from '@/features/search-index/provider-settings.utils';

const logger = createLogger('document-indexer');

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Standard field name for storing document embeddings in Elasticsearch
 * Used across all semantic and hybrid search indexes for consistency
 */
export const EMBEDDING_FIELD_NAME = 'content_embedding';

/**
 * Search types that require embedding generation
 */
const EMBEDDING_SEARCH_TYPES = ['semantic', 'hybrid'] as const;

// ============================================================================
// TYPES
// ============================================================================

export interface IndexingRequest {
    searchIndexId: string;
    documents: Record<string, unknown>[];
    sourceFileName?: string;
    sourceSizeBytes?: number;
    createdBy?: string;
}

export interface IndexingProgress {
    batchId: string;
    status: IndexingBatch['status'];
    totalDocuments: number;
    processedDocuments: number;
    indexedDocuments: number;
    failedDocuments: number;
    errors: Array<{
        documentIndex: number;
        documentId?: string;
        error: string;
        field?: string;
    }>;
    startedAt: Date | null;
    completedAt: Date | null;
    durationMs: number | null;
}

export interface IndexingResult {
    success: boolean;
    batchId: string;
    totalDocuments: number;
    indexedDocuments: number;
    failedDocuments: number;
    /** Embedding generation stats (only for semantic/hybrid indexes) */
    embeddingStats?: {
        enabled: boolean;
        generated: number;
        failed: number;
        skipped: number;
    };
    errors: Array<{
        documentIndex: number;
        documentId?: string;
        error: string;
        field?: string;
    }>;
    durationMs: number;
    warnings: string[];
}

// ============================================================================
// BATCH MANAGEMENT
// ============================================================================

/**
 * Create a new indexing batch record
 */
async function createBatch(
    searchIndexId: string,
    totalDocuments: number,
    options?: {
        sourceFileName?: string;
        sourceSizeBytes?: number;
        createdBy?: string;
    }
): Promise<IndexingBatch> {
    const [batch] = await db.insert(indexingBatches).values({
        searchIndexId,
        totalDocuments,
        status: 'pending',
        sourceFileName: options?.sourceFileName,
        sourceSizeBytes: options?.sourceSizeBytes,
        createdBy: options?.createdBy,
    }).returning();

    return batch;
}

/**
 * Update batch status and progress
 */
async function updateBatch(
    batchId: string,
    updates: Partial<Pick<IndexingBatch,
        'status' | 'processedDocuments' | 'indexedDocuments' | 'failedDocuments' |
        'errors' | 'errorMessage' | 'startedAt' | 'completedAt' | 'durationMs'
    >>
): Promise<void> {
    await db.update(indexingBatches)
        .set({
            ...updates,
            updatedAt: new Date(),
        })
        .where(eq(indexingBatches.id, batchId));
}

/**
 * Get batch by ID
 */
export async function getBatch(batchId: string): Promise<IndexingBatch | null> {
    const [batch] = await db.select()
        .from(indexingBatches)
        .where(eq(indexingBatches.id, batchId))
        .limit(1);

    return batch || null;
}

/**
 * Get indexing progress for a batch
 */
export async function getIndexingProgress(batchId: string): Promise<IndexingProgress | null> {
    const batch = await getBatch(batchId);
    if (!batch) return null;

    return {
        batchId: batch.id,
        status: batch.status as IndexingBatch['status'],
        totalDocuments: batch.totalDocuments,
        processedDocuments: batch.processedDocuments,
        indexedDocuments: batch.indexedDocuments,
        failedDocuments: batch.failedDocuments,
        errors: batch.errors || [],
        startedAt: batch.startedAt,
        completedAt: batch.completedAt,
        durationMs: batch.durationMs,
    };
}

/**
 * List batches for a search index
 */
export async function listBatches(
    searchIndexId: string,
    options?: { limit?: number }
): Promise<IndexingBatch[]> {
    return await db.select()
        .from(indexingBatches)
        .where(eq(indexingBatches.searchIndexId, searchIndexId))
        .orderBy(desc(indexingBatches.createdAt))
        .limit(options?.limit ?? 20);
}

// ============================================================================
// INDEX STATS UPDATE
// ============================================================================

/**
 * Update search index stats after indexing
 */
async function updateIndexStats(
    searchIndexId: string,
    additionalDocuments: number
): Promise<void> {
    // Get current ES stats
    const [index] = await db.select()
        .from(searchIndex)
        .where(eq(searchIndex.id, searchIndexId))
        .limit(1);

    if (!index) return;

    const provider = getSearchEngineProvider(index.searchProvider as SearchProviderType);
    const esStats = await provider.getIndexStats(index.name);

    await db.update(searchIndex)
        .set({
            documentCount: esStats?.documentCount ?? (index.documentCount + additionalDocuments),
            indexSizeBytes: esStats?.sizeInBytes ?? index.indexSizeBytes,
            lastIndexedAt: new Date(),
            status: 'ready',
            updatedAt: new Date(),
        })
        .where(eq(searchIndex.id, searchIndexId));
}

// ============================================================================
// EMBEDDING CONFIGURATION
// ============================================================================

interface EmbeddingConfig {
    enabled: boolean;
    providerId?: string | null;
    modelId?: number | null;
    dimensions?: number | null;
    vectorSimilarity?: string | null;
}

/**
 * Extract embedding configuration from search index
 */
function getEmbeddingConfig(index: {
    searchType: string;
    aiProviderId?: string | null;
    aiModelId?: number | null;
    embeddingDimensions?: number | null;
    vectorSimilarity?: string | null;
}): EmbeddingConfig {
    const requiresEmbedding = EMBEDDING_SEARCH_TYPES.includes(index.searchType as typeof EMBEDDING_SEARCH_TYPES[number]);

    return {
        enabled: requiresEmbedding && !!index.aiProviderId && !!index.aiModelId,
        providerId: index.aiProviderId,
        modelId: index.aiModelId,
        dimensions: index.embeddingDimensions,
        vectorSimilarity: index.vectorSimilarity,
    };
}

/**
 * Get text content from vector source fields for embedding
 */
function getEmbeddingText(
    document: Record<string, unknown>,
    vectorSourceFields: SearchIndexField[]
): string {
    const textParts: string[] = [];

    for (const field of vectorSourceFields) {
        const value = document[field.fieldName];
        if (value !== undefined && value !== null) {
            if (typeof value === 'string') {
                textParts.push(value);
            } else if (Array.isArray(value)) {
                // Join array values
                textParts.push(value.filter(v => typeof v === 'string').join(' '));
            }
        }
    }

    return textParts.join('\n\n');
}

/**
 * Generate embeddings for documents
 */
async function generateDocumentEmbeddings(
    documents: Array<{ _id?: string; [key: string]: unknown }>,
    vectorSourceFields: SearchIndexField[],
    embeddingConfig: EmbeddingConfig,
    batchId: string
): Promise<{
    embeddings: Array<number[] | null>;
    errors: Array<{ documentIndex: number; error: string }>;
    stats: { generated: number; failed: number; skipped: number };
}> {
    const errors: Array<{ documentIndex: number; error: string }> = [];

    // Extract text from each document
    const texts: string[] = documents.map(doc => getEmbeddingText(doc, vectorSourceFields));

    // Filter out empty texts and track indices
    const nonEmptyIndices: number[] = [];
    const nonEmptyTexts: string[] = [];

    texts.forEach((text, index) => {
        if (text.trim().length > 0) {
            nonEmptyIndices.push(index);
            nonEmptyTexts.push(text);
        }
    });

    if (nonEmptyTexts.length === 0) {
        logger.warn('No text content found for embedding generation', { batchId });
        return {
            embeddings: documents.map(() => null),
            errors: [],
            stats: { generated: 0, failed: 0, skipped: documents.length },
        };
    }

    logger.info('Generating embeddings', {
        batchId,
        totalDocs: documents.length,
        docsWithContent: nonEmptyTexts.length,
        providerId: embeddingConfig.providerId,
        modelId: embeddingConfig.modelId,
    });

    try {
        const result = await generateEmbeddings(nonEmptyTexts, {
            providerId: embeddingConfig.providerId || undefined,
            modelId: embeddingConfig.modelId || undefined,
            dimensions: embeddingConfig.dimensions || undefined,
            feature: 'document_indexing',
        });

        // Map embeddings back to original indices
        const allEmbeddings: Array<number[] | null> = documents.map(() => null);

        result.embeddings.forEach((embedding, resultIndex) => {
            const originalIndex = nonEmptyIndices[resultIndex];
            allEmbeddings[originalIndex] = embedding.vector;
        });

        const skipped = documents.length - nonEmptyTexts.length;
        logger.info('Embeddings generated successfully', {
            batchId,
            generated: result.embeddings.length,
            skipped,
            dimensions: result.metadata?.dimensions,
        });

        return {
            embeddings: allEmbeddings,
            errors,
            stats: { generated: result.embeddings.length, failed: 0, skipped },
        };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Embedding generation failed';
        logger.error('Embedding generation failed', { batchId, error: errorMessage });

        // Mark all documents as having embedding errors
        nonEmptyIndices.forEach(index => {
            errors.push({
                documentIndex: index,
                error: `Embedding failed: ${errorMessage}`,
            });
        });

        const skipped = documents.length - nonEmptyTexts.length;
        return {
            embeddings: documents.map(() => null),
            errors,
            stats: { generated: 0, failed: nonEmptyTexts.length, skipped },
        };
    }
}

// ============================================================================
// SEARCH INDEX SETUP
// ============================================================================

/**
 * Ensure the search index exists with proper mappings
 *
 * If the index exists and embeddings are enabled, validates that the existing
 * mapping has the correct embedding dimensions. If dimensions don't match,
 * deletes and recreates the index to avoid dimension mismatch errors.
 *
 * Uses provider.buildIndexSettings() to let the provider build its own
 * native index configuration (field mappings, analyzers, vector fields, etc.).
 */
async function ensureIndex(
    indexName: string,
    fields: SearchIndexField[],
    embeddingConfig?: EmbeddingConfig,
    searchProviderType?: SearchProviderType,
    indexRecord?: { providerSettings?: Record<string, unknown> | null; numberOfShards?: number; numberOfReplicas?: number; refreshInterval?: string }
): Promise<{ success: boolean; error?: string; warning?: string }> {
    const provider = getSearchEngineProvider(searchProviderType);
    const exists = await provider.indexExists(indexName);

    if (exists) {
        // If embeddings are enabled, check if existing mapping has correct dimensions
        if (embeddingConfig?.enabled && embeddingConfig.dimensions) {
            const mappingResult = await provider.getIndexMapping(indexName);

            if (mappingResult.success) {
                const existingDims = mappingResult.embeddingDimensions;
                const requiredDims = embeddingConfig.dimensions;

                if (existingDims !== undefined && existingDims !== requiredDims) {
                    // Dimension mismatch - need to recreate index
                    logger.warn('Embedding dimension mismatch detected - recreating index', {
                        indexName,
                        existingDimensions: existingDims,
                        requiredDimensions: requiredDims,
                    });

                    const deleteResult = await provider.deleteIndex(indexName);
                    if (!deleteResult.success) {
                        return {
                            success: false,
                            error: `Failed to delete index with mismatched dimensions: ${deleteResult.error}`,
                        };
                    }

                    logger.info('Deleted index with mismatched dimensions, will recreate', {
                        indexName,
                        oldDimensions: existingDims,
                        newDimensions: requiredDims,
                    });
                } else if (existingDims === undefined) {
                    // Index exists but has no embedding field - need to recreate
                    logger.warn('Index exists but missing embedding field - recreating index', {
                        indexName,
                        requiredDimensions: requiredDims,
                    });

                    const deleteResult = await provider.deleteIndex(indexName);
                    if (!deleteResult.success) {
                        return {
                            success: false,
                            error: `Failed to delete index missing embedding field: ${deleteResult.error}`,
                        };
                    }
                } else {
                    // Dimensions match, index is good
                    logger.info('Index exists with correct embedding dimensions', {
                        indexName,
                        dimensions: existingDims,
                    });
                    return { success: true };
                }
            } else {
                // Couldn't get mapping - log warning but continue
                logger.warn('Could not verify index mapping', {
                    indexName,
                    error: mappingResult.error,
                });
                return {
                    success: true,
                    warning: `Could not verify embedding dimensions for existing index "${indexName}". If indexing fails, you may need to delete and recreate the index.`,
                };
            }
        } else {
            // No embeddings needed, existing index is fine
            return { success: true };
        }
    }

    // Build provider-specific embedding config for buildIndexSettings
    let embeddingBuildConfig: { fieldName: string; dimensions: number; similarity: string } | undefined;
    if (embeddingConfig?.enabled && embeddingConfig.dimensions) {
        embeddingBuildConfig = {
            fieldName: EMBEDDING_FIELD_NAME,
            dimensions: embeddingConfig.dimensions,
            similarity: embeddingConfig.vectorSimilarity || 'cosine',
        };

        logger.info('Including embedding field in index creation', {
            indexName,
            fieldName: EMBEDDING_FIELD_NAME,
            dimensions: embeddingConfig.dimensions,
            similarity: embeddingConfig.vectorSimilarity || 'cosine',
        });
    }

    // Resolve provider settings from the index record (backward-compat aware)
    const providerSettings = indexRecord
        ? getProviderSettings(indexRecord as Parameters<typeof getProviderSettings>[0])
        : {};

    // Let the provider build its own native index settings
    const indexConfig = provider.buildIndexSettings({
        fields: fields.map(f => ({
            fieldName: f.fieldName,
            fieldType: f.fieldType,
            isSearchable: f.isSearchable,
            isFacetable: f.isFacetable,
            providerFieldSettings: getProviderFieldSettings(f),
        })),
        providerSettings,
        embeddingConfig: embeddingBuildConfig,
    });

    return await provider.createIndex(indexName, indexConfig);
}

// ============================================================================
// MAIN INDEXING FUNCTION
// ============================================================================

/**
 * Index documents to a search index
 *
 * This is the main entry point for document indexing.
 * It handles the complete workflow:
 * 1. Validates the request
 * 2. Creates a batch record
 * 3. Validates field mappings
 * 4. Ensures ES index exists
 * 5. Transforms documents in batches
 * 6. Indexes to Elasticsearch
 * 7. Updates stats and completes batch
 */
export async function indexDocuments(
    request: IndexingRequest
): Promise<IndexingResult> {
    const { searchIndexId, documents, sourceFileName, sourceSizeBytes, createdBy } = request;
    const startTime = Date.now();
    const warnings: string[] = [];
    const allErrors: IndexingResult['errors'] = [];

    // Validate document count
    const maxDocs = elasticsearchConfig.indexing.maxDocumentsPerUpload;
    if (documents.length > maxDocs) {
        return {
            success: false,
            batchId: '',
            totalDocuments: documents.length,
            indexedDocuments: 0,
            failedDocuments: documents.length,
            errors: [{
                documentIndex: -1,
                error: `Too many documents. Maximum allowed: ${maxDocs}`,
            }],
            durationMs: Date.now() - startTime,
            warnings: [],
        };
    }

    // Get the search index
    const [index] = await db.select()
        .from(searchIndex)
        .where(eq(searchIndex.id, searchIndexId))
        .limit(1);

    if (!index) {
        return {
            success: false,
            batchId: '',
            totalDocuments: documents.length,
            indexedDocuments: 0,
            failedDocuments: documents.length,
            errors: [{
                documentIndex: -1,
                error: 'Search index not found',
            }],
            durationMs: Date.now() - startTime,
            warnings: [],
        };
    }

    // Create batch record
    const batch = await createBatch(searchIndexId, documents.length, {
        sourceFileName,
        sourceSizeBytes,
        createdBy,
    });

    try {
        // Mark as processing
        await updateBatch(batch.id, {
            status: 'processing',
            startedAt: new Date(),
        });

        // Get field mappings
        const fields = await fieldsService.getFieldsBySearchIndexId(searchIndexId);

        // Get embedding configuration
        const embeddingConfig = getEmbeddingConfig(index);

        // Get vector source fields if embeddings are needed
        let vectorSourceFields: SearchIndexField[] = [];
        if (embeddingConfig.enabled) {
            vectorSourceFields = await fieldsRepository.getVectorSourceFields(searchIndexId);

            if (vectorSourceFields.length === 0) {
                warnings.push('No vector source fields configured for embedding generation. Mark fields as "vector source" in field mappings.');
            } else {
                logger.info('Vector source fields found', {
                    batchId: batch.id,
                    fields: vectorSourceFields.map(f => f.fieldName),
                });
            }
        }

        // Validate mappings
        const mappingValidation = validateFieldMappings(fields);
        if (!mappingValidation.valid) {
            await updateBatch(batch.id, {
                status: 'failed',
                errorMessage: `Invalid field mappings: ${mappingValidation.errors.join(', ')}`,
                completedAt: new Date(),
                durationMs: Date.now() - startTime,
            });

            return {
                success: false,
                batchId: batch.id,
                totalDocuments: documents.length,
                indexedDocuments: 0,
                failedDocuments: documents.length,
                errors: mappingValidation.errors.map(err => ({
                    documentIndex: -1,
                    error: err,
                })),
                durationMs: Date.now() - startTime,
                warnings: [],
            };
        }

        // Ensure search index exists (with embedding field if needed)
        const indexSetup = await ensureIndex(index.name, fields, embeddingConfig, index.searchProvider as SearchProviderType, index);
        if (indexSetup.warning) {
            warnings.push(indexSetup.warning);
        }
        if (!indexSetup.success) {
            await updateBatch(batch.id, {
                status: 'failed',
                errorMessage: `Failed to create search index: ${indexSetup.error}`,
                completedAt: new Date(),
                durationMs: Date.now() - startTime,
            });

            return {
                success: false,
                batchId: batch.id,
                totalDocuments: documents.length,
                indexedDocuments: 0,
                failedDocuments: documents.length,
                errors: [{
                    documentIndex: -1,
                    error: indexSetup.error || 'Failed to create index',
                }],
                durationMs: Date.now() - startTime,
                warnings: [],
            };
        }

        // Transform documents
        logger.info('Transforming documents', {
            batchId: batch.id,
            count: documents.length,
        });

        const transformResults = transformDocuments(documents, fields, {
            provider: index.searchProvider as SearchProviderType,
        });

        // Collect successful transforms and track failures
        const successfulDocs: Array<{ _id?: string; [key: string]: unknown }> = [];
        let transformFailed = 0;

        transformResults.forEach((result, index) => {
            if (result.success && Object.keys(result.document).length > 0) {
                // Use uniqueId field as _id if present
                const docId = result.document.uniqueId as string | undefined;
                successfulDocs.push({
                    ...result.document,
                    _id: docId,
                });
            } else {
                transformFailed++;
                result.errors.forEach(err => {
                    allErrors.push({
                        documentIndex: index,
                        error: err.error,
                        field: err.field,
                    });
                });
            }

            // Collect warnings
            result.warnings.forEach(warn => {
                warnings.push(`Doc ${index}: ${warn.field} - ${warn.warning}`);
            });
        });

        // Update progress after transform
        await updateBatch(batch.id, {
            processedDocuments: documents.length,
            failedDocuments: transformFailed,
            errors: allErrors,
        });

        // Generate embeddings for semantic/hybrid indexes
        let embeddingStats: IndexingResult['embeddingStats'] | undefined;

        if (embeddingConfig.enabled && vectorSourceFields.length > 0 && successfulDocs.length > 0) {
            const embeddingResult = await generateDocumentEmbeddings(
                successfulDocs,
                vectorSourceFields,
                embeddingConfig,
                batch.id
            );

            // Track embedding stats
            embeddingStats = {
                enabled: true,
                generated: embeddingResult.stats.generated,
                failed: embeddingResult.stats.failed,
                skipped: embeddingResult.stats.skipped,
            };

            // Add embeddings to documents
            embeddingResult.embeddings.forEach((embedding, docIndex) => {
                if (embedding) {
                    successfulDocs[docIndex][EMBEDDING_FIELD_NAME] = embedding;
                }
            });

            // Add embedding errors
            embeddingResult.errors.forEach(err => {
                allErrors.push({
                    documentIndex: err.documentIndex,
                    error: err.error,
                    field: EMBEDDING_FIELD_NAME,
                });
            });

            // Log embedding summary
            logger.info('Embedding generation summary', {
                batchId: batch.id,
                generated: embeddingStats.generated,
                failed: embeddingStats.failed,
                skipped: embeddingStats.skipped,
            });

            // Count docs without embeddings as warnings (not failures)
            const docsWithoutEmbedding = embeddingResult.embeddings.filter(e => e === null).length;
            if (docsWithoutEmbedding > 0) {
                warnings.push(`${docsWithoutEmbedding} documents indexed without embeddings (no vector source content)`);
            }
        } else if (embeddingConfig.enabled && vectorSourceFields.length === 0) {
            // Embedding enabled but no vector source fields configured
            embeddingStats = {
                enabled: true,
                generated: 0,
                failed: 0,
                skipped: successfulDocs.length,
            };
        }

        // Index to Elasticsearch
        let indexed = 0;
        let indexFailed = 0;

        if (successfulDocs.length > 0) {
            logger.info('Indexing documents to search provider', {
                batchId: batch.id,
                count: successfulDocs.length,
                hasEmbeddings: embeddingConfig.enabled,
            });

            const provider = getSearchEngineProvider(index.searchProvider as SearchProviderType);
            const bulkResult = await provider.bulkIndex(index.name, successfulDocs, {
                refresh: elasticsearchConfig.indexing.refreshOnComplete ? 'wait_for' : false,
            });

            indexed = bulkResult.indexed;
            indexFailed = bulkResult.failed;

            // Add ES errors
            bulkResult.errors.forEach(err => {
                allErrors.push({
                    documentIndex: err.index,
                    documentId: err.id,
                    error: err.error,
                });
            });
        }

        const totalFailed = transformFailed + indexFailed;
        const durationMs = Date.now() - startTime;

        // Update batch with final results
        await updateBatch(batch.id, {
            status: totalFailed === documents.length ? 'failed' : 'completed',
            indexedDocuments: indexed,
            failedDocuments: totalFailed,
            errors: allErrors,
            completedAt: new Date(),
            durationMs,
        });

        // Update search index stats
        if (indexed > 0) {
            await updateIndexStats(searchIndexId, indexed);
        }

        logger.info('Indexing completed', {
            batchId: batch.id,
            total: documents.length,
            indexed,
            failed: totalFailed,
            embeddingsGenerated: embeddingStats?.generated ?? 0,
            durationMs,
        });

        return {
            success: totalFailed === 0,
            batchId: batch.id,
            totalDocuments: documents.length,
            indexedDocuments: indexed,
            failedDocuments: totalFailed,
            embeddingStats,
            errors: allErrors,
            durationMs,
            warnings,
        };

    } catch (error) {
        const durationMs = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        logger.error('Indexing failed', {
            batchId: batch.id,
            error: errorMessage,
        });

        await updateBatch(batch.id, {
            status: 'failed',
            errorMessage,
            completedAt: new Date(),
            durationMs,
        });

        return {
            success: false,
            batchId: batch.id,
            totalDocuments: documents.length,
            indexedDocuments: 0,
            failedDocuments: documents.length,
            errors: [{
                documentIndex: -1,
                error: errorMessage,
            }],
            durationMs,
            warnings: [],
        };
    }
}

/**
 * Cancel an in-progress indexing batch
 */
export async function cancelBatch(batchId: string): Promise<boolean> {
    const batch = await getBatch(batchId);
    if (!batch || batch.status !== 'processing') {
        return false;
    }

    await updateBatch(batchId, {
        status: 'cancelled',
        completedAt: new Date(),
    });

    return true;
}
