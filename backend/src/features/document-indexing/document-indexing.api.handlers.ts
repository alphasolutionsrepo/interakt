// src/features/document-indexing/document-indexing.api.handlers.ts

/**
 * Document Indexing API Handlers
 *
 * Handles HTTP request/response for document upload and indexing operations.
 */

import { NextRequest, NextResponse } from 'next/server';
import { apiResponse } from '@/shared/api/response';
import { createLogger } from '@/shared/logger/logger';
import { getCurrentUserId } from '@/shared/utils/auth-utils';
import { getSearchIndexByIngestToken } from '@/features/search-index/search-index.repository';
import { elasticsearchConfig } from '../../../config';

import {
    indexDocuments,
    getIndexingProgress,
    listBatches,
    cancelBatch,
} from './document-indexer.service';

import {
    indexDocumentsRequestSchema,
    batchIdParamSchema,
    type IndexDocumentsResponse,
    type IndexingStatusResponse,
    type BatchListResponse,
} from './document-indexing.types';

import { z } from 'zod';

const logger = createLogger('document-indexing-handlers');

// ============================================================================
// PARAM VALIDATION
// ============================================================================

const searchIndexIdSchema = z.object({
    id: z.string().uuid(),
});

// ============================================================================
// SHARED INDEXING CORE
// ============================================================================

/**
 * Parse, validate and index a documents-upload request body against a
 * resolved search index. Auth (session or API key) is handled by the caller;
 * this only owns body size/shape validation and the indexing call.
 *
 * @param searchIndexId  The index to write to (already authorized).
 * @param createdBy      User id for audit, or null for API-key uploads.
 */
async function runDocumentIndexing(
    request: NextRequest,
    searchIndexId: string,
    createdBy: string | null
): Promise<NextResponse> {
    // Check content length (for Vercel limits)
    const contentLength = request.headers.get('content-length');
    if (contentLength) {
        const size = parseInt(contentLength, 10);
        if (size > elasticsearchConfig.indexing.maxFileSizeBytes) {
            return apiResponse.badRequest(
                `File too large. Maximum size: ${Math.round(elasticsearchConfig.indexing.maxFileSizeBytes / 1024 / 1024)}MB`
            );
        }
    }

    // Parse request body
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return apiResponse.badRequest('Invalid JSON body');
    }

    // Validate request
    const validation = indexDocumentsRequestSchema.safeParse(body);
    if (!validation.success) {
        return apiResponse.validationError(validation.error);
    }

    const { documents, sourceFileName } = validation.data;

    logger.info('Starting document indexing', {
        searchIndexId,
        documentCount: documents.length,
        sourceFileName,
        createdBy,
    });

    // Index documents
    const result = await indexDocuments({
        searchIndexId,
        documents,
        sourceFileName,
        sourceSizeBytes: contentLength ? parseInt(contentLength, 10) : undefined,
        createdBy: createdBy ?? undefined,
    });

    // Build response message
    let message = result.success
        ? `Successfully indexed ${result.indexedDocuments} documents`
        : `Indexing completed with ${result.failedDocuments} failures`;

    // Add embedding info to message if applicable
    if (result.embeddingStats?.enabled && result.embeddingStats.generated > 0) {
        message += ` (${result.embeddingStats.generated} embeddings generated)`;
    }

    // Build response
    const response: IndexDocumentsResponse = {
        success: result.success,
        batchId: result.batchId,
        message,
        summary: {
            total: result.totalDocuments,
            indexed: result.indexedDocuments,
            failed: result.failedDocuments,
        },
        durationMs: result.durationMs,
    };

    // Include embedding stats if present
    if (result.embeddingStats) {
        response.embeddingStats = result.embeddingStats;
    }

    // Include errors if any
    if (result.errors.length > 0) {
        response.errors = result.errors.slice(0, 100); // Limit to first 100 errors
    }

    // Include warnings if any
    if (result.warnings.length > 0) {
        response.warnings = result.warnings.slice(0, 50);
    }

    logger.info('Document indexing completed', {
        searchIndexId,
        batchId: result.batchId,
        indexed: result.indexedDocuments,
        failed: result.failedDocuments,
        embeddingsGenerated: result.embeddingStats?.generated ?? 0,
        durationMs: result.durationMs,
    });

    return apiResponse.success(response, result.success ? 200 : 207); // 207 = Multi-Status
}

// ============================================================================
// HANDLERS
// ============================================================================

/**
 * POST /api/search-indexes/:id/documents
 * Upload and index documents (session-authenticated, admin UI)
 */
export async function handleIndexDocuments(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const userId = await getCurrentUserId();
        const params = await context.params;

        // Validate search index ID
        const paramValidation = searchIndexIdSchema.safeParse(params);
        if (!paramValidation.success) {
            return apiResponse.validationError(paramValidation.error);
        }

        return await runDocumentIndexing(request, paramValidation.data.id, userId);
    } catch (error) {
        const err = error as Error;
        logger.error('Document indexing failed', err);

        if (err.message.includes('not found')) {
            return apiResponse.notFound(err.message);
        }

        return apiResponse.error(err);
    }
}

/**
 * POST /api/v1/search-indexes/:id/documents
 * Upload and index documents authenticated by a per-index ingestion API key
 * (X-Api-Key or Authorization: Bearer). For external, server-to-server use.
 */
export async function handleIngestDocuments(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const params = await context.params;

        // Validate search index ID
        const paramValidation = searchIndexIdSchema.safeParse(params);
        if (!paramValidation.success) {
            return apiResponse.validationError(paramValidation.error);
        }
        const searchIndexId = paramValidation.data.id;

        // Extract API key from X-Api-Key or Authorization: Bearer
        const apiKey =
            request.headers.get('x-api-key') ||
            request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
            null;

        if (!apiKey) {
            return apiResponse.unauthorized('API key is required');
        }

        // Resolve key -> index and verify it matches the requested index
        const indexAuth = await getSearchIndexByIngestToken(apiKey);
        if (!indexAuth || indexAuth.id !== searchIndexId) {
            return apiResponse.unauthorized('Invalid API key');
        }

        if (!indexAuth.isActive) {
            return apiResponse.forbidden('Search index is not active');
        }

        return await runDocumentIndexing(request, searchIndexId, indexAuth.createdBy);
    } catch (error) {
        const err = error as Error;
        logger.error('Document ingestion failed', err);

        if (err.message.includes('not found')) {
            return apiResponse.notFound(err.message);
        }

        return apiResponse.error(err);
    }
}

/**
 * GET /api/search-indexes/:id/documents/batches
 * List indexing batches for a search index
 */
export async function handleListBatches(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const params = await context.params;

        // Validate search index ID
        const paramValidation = searchIndexIdSchema.safeParse(params);
        if (!paramValidation.success) {
            return apiResponse.validationError(paramValidation.error);
        }

        const { searchParams } = new URL(request.url);
        const limit = parseInt(searchParams.get('limit') || '20', 10);

        const batches = await listBatches(paramValidation.data.id, { limit });

        const response: BatchListResponse = {
            batches: batches.map(b => ({
                id: b.id,
                status: b.status,
                totalDocuments: b.totalDocuments,
                indexedDocuments: b.indexedDocuments,
                failedDocuments: b.failedDocuments,
                sourceFileName: b.sourceFileName,
                createdAt: b.createdAt.toISOString(),
                completedAt: b.completedAt?.toISOString() || null,
                durationMs: b.durationMs,
            })),
        };

        return apiResponse.success(response);
    } catch (error) {
        const err = error as Error;
        logger.error('Failed to list batches', err);
        return apiResponse.error(err);
    }
}

/**
 * GET /api/search-indexes/:id/documents/batches/:batchId
 * Get indexing batch status/progress
 */
export async function handleGetBatchStatus(
    request: NextRequest,
    context: { params: Promise<{ id: string; batchId: string }> }
) {
    try {
        const params = await context.params;

        // Validate params
        const idValidation = searchIndexIdSchema.safeParse({ id: params.id });
        if (!idValidation.success) {
            return apiResponse.validationError(idValidation.error);
        }

        const batchValidation = batchIdParamSchema.safeParse({ batchId: params.batchId });
        if (!batchValidation.success) {
            return apiResponse.validationError(batchValidation.error);
        }

        const progress = await getIndexingProgress(params.batchId);

        if (!progress) {
            return apiResponse.notFound('Indexing batch not found');
        }

        // Calculate percentage
        const percentage = progress.totalDocuments > 0
            ? Math.round((progress.processedDocuments / progress.totalDocuments) * 100)
            : 0;

        // Estimate remaining time if in progress
        let estimatedRemainingMs: number | undefined;
        if (progress.status === 'processing' && progress.startedAt && progress.processedDocuments > 0) {
            const elapsed = Date.now() - new Date(progress.startedAt).getTime();
            const avgPerDoc = elapsed / progress.processedDocuments;
            const remaining = progress.totalDocuments - progress.processedDocuments;
            estimatedRemainingMs = Math.round(avgPerDoc * remaining);
        }

        const response: IndexingStatusResponse = {
            batchId: progress.batchId,
            status: progress.status as IndexingStatusResponse['status'],
            progress: {
                total: progress.totalDocuments,
                processed: progress.processedDocuments,
                indexed: progress.indexedDocuments,
                failed: progress.failedDocuments,
                percentage,
            },
            timing: {
                startedAt: progress.startedAt?.toISOString() || null,
                completedAt: progress.completedAt?.toISOString() || null,
                durationMs: progress.durationMs,
                estimatedRemainingMs,
            },
            errors: progress.errors.slice(0, 100), // Limit errors in response
        };

        return apiResponse.success(response);
    } catch (error) {
        const err = error as Error;
        logger.error('Failed to get batch status', err);
        return apiResponse.error(err);
    }
}

/**
 * DELETE /api/search-indexes/:id/documents/batches/:batchId
 * Cancel an in-progress indexing batch
 */
export async function handleCancelBatch(
    request: NextRequest,
    context: { params: Promise<{ id: string; batchId: string }> }
) {
    try {
        const params = await context.params;

        // Validate params
        const batchValidation = batchIdParamSchema.safeParse({ batchId: params.batchId });
        if (!batchValidation.success) {
            return apiResponse.validationError(batchValidation.error);
        }

        const cancelled = await cancelBatch(params.batchId);

        if (!cancelled) {
            return apiResponse.badRequest('Batch cannot be cancelled (not in progress or not found)');
        }

        logger.info('Indexing batch cancelled', { batchId: params.batchId });

        return apiResponse.success({ cancelled: true, batchId: params.batchId });
    } catch (error) {
        const err = error as Error;
        logger.error('Failed to cancel batch', err);
        return apiResponse.error(err);
    }
}
