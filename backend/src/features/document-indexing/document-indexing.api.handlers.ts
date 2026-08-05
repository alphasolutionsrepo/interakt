// src/features/document-indexing/document-indexing.api.handlers.ts

/**
 * Document Indexing API Handlers
 *
 * Handles HTTP request/response for document upload and indexing operations.
 */

import { NextRequest, NextResponse } from 'next/server';
import { apiResponse } from '@/shared/api/response';
import { createLogger } from '@/shared/logger/logger';
// Session resolution now happens inside resolveDocumentActor, which handles both
// session and ingestion-key callers.
import { elasticsearchConfig } from '../../../config';

import {
    indexDocuments,
    getIndexingProgress,
    listBatches,
    cancelBatch,
} from './document-indexer.service';

import {
    getDocument,
    listDocuments,
    writeDocuments,
    deleteDocumentsByFilter,
    SearchIndexNotFoundError,
    IndexNotProvisionedError,
    type DocumentWriteAction,
    type DocumentWriteOperation,
    type DocumentWriteResult,
} from './document-writer.service';

import {
    indexDocumentsRequestSchema,
    batchIdParamSchema,
    documentIdParamSchema,
    writeDocumentRequestSchema,
    bulkWriteRequestSchema,
    deleteByFilterRequestSchema,
    listDocumentsQuerySchema,
    type IndexDocumentsResponse,
    type IndexingStatusResponse,
    type BatchListResponse,
    type GetDocumentResponse,
    type WriteDocumentsResponse,
    type DeleteByFilterResponse,
    type ListDocumentsResponse,
} from './document-indexing.types';

import { SearchError, type FilterClause } from '@/features/search/search.types';

import {
    resolveDocumentActor,
    actorCan,
    actorLogContext,
    actorAuditColumns,
} from './document-actor';

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
        const params = await context.params;

        // Validate search index ID
        const paramValidation = searchIndexIdSchema.safeParse(params);
        if (!paramValidation.success) {
            return apiResponse.validationError(paramValidation.error);
        }

        // Authenticate. This handler previously read the user id without checking
        // it, which let anyone index documents anonymously — and, because indexing
        // generates embeddings, run up AI spend.
        const authResult = await resolveDocumentActor(request, {
            searchIndexId: paramValidation.data.id,
            operation: 'write',
        });
        if (authResult.response) {
            return authResult.response;
        }
        const actor = authResult.actor;

        return await runDocumentIndexing(
            request,
            paramValidation.data.id,
            actor.type === 'user' ? actor.userId : null
        );
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

        logger.info('Starting document indexing', {
            searchIndexId,
            documentCount: documents.length,
            sourceFileName,
            ...actorLogContext(actor),
        });

        // Index documents
        const result = await indexDocuments({
            searchIndexId,
            documents,
            sourceFileName,
            sourceSizeBytes: contentLength ? parseInt(contentLength, 10) : undefined,
            ...actorAuditColumns(actor),
        });

        // Build response message
        let message = result.success
            ? `Successfully indexed ${result.indexedDocuments} documents`
            : `Indexing completed with ${result.failedDocuments} failures`;

        // Add embedding info to message if applicable
        if (result.embeddingStats?.enabled && result.embeddingStats.generated > 0) {
            message += ` (${result.embeddingStats.generated} embeddings generated)`;
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

        // Previously unauthenticated — batch listings expose source file names
        // and document counts.
        const authResult = await resolveDocumentActor(request, {
            searchIndexId: paramValidation.data.id,
        });
        if (authResult.response) {
            return authResult.response;
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

        // Previously unauthenticated
        const authResult = await resolveDocumentActor(request, {
            searchIndexId: idValidation.data.id,
        });
        if (authResult.response) {
            return authResult.response;
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
        const idValidation = searchIndexIdSchema.safeParse({ id: params.id });
        if (!idValidation.success) {
            return apiResponse.validationError(idValidation.error);
        }

        const batchValidation = batchIdParamSchema.safeParse({ batchId: params.batchId });
        if (!batchValidation.success) {
            return apiResponse.validationError(batchValidation.error);
        }

        // Previously unauthenticated — anyone could cancel an in-flight upload.
        // Requires 'write' because aborting a write is a write-side action.
        const authResult = await resolveDocumentActor(request, {
            searchIndexId: idValidation.data.id,
            operation: 'write',
        });
        if (authResult.response) {
            return authResult.response;
        }

        const cancelled = await cancelBatch(params.batchId);

        if (!cancelled) {
            return apiResponse.badRequest('Batch cannot be cancelled (not in progress or not found)');
        }

        logger.info('Indexing batch cancelled', {
            batchId: params.batchId,
            ...actorLogContext(authResult.actor),
        });

        return apiResponse.success({ cancelled: true, batchId: params.batchId });
    } catch (error) {
        const err = error as Error;
        logger.error('Failed to cancel batch', err);
        return apiResponse.error(err);
    }
}

// ============================================================================
// INCREMENTAL UPDATE HANDLERS
// ============================================================================

/**
 * Map errors from the writer service onto HTTP responses.
 *
 * The writer throws typed errors for the two conditions that are not the
 * caller's fault in the usual sense: a search index that doesn't exist (404) and
 * an index that exists in the database but was never provisioned in the search
 * provider (409 — fixable by running a full upload).
 */
function mapWriteError(error: unknown, context: string) {
    if (error instanceof SearchIndexNotFoundError) {
        return apiResponse.notFound(error.message);
    }
    if (error instanceof IndexNotProvisionedError) {
        return apiResponse.conflict(error.message);
    }
    // Thrown by buildFilterExpression for an unknown or unfilterable field
    if (error instanceof SearchError) {
        return apiResponse.badRequest(error.message);
    }

    const err = error as Error;
    logger.error(context, err);
    return apiResponse.error(err);
}

/**
 * Build the shared response body for the write endpoints.
 */
function buildWriteResponse(
    result: DocumentWriteResult,
    message: string
): WriteDocumentsResponse {
    const response: WriteDocumentsResponse = {
        success: result.success,
        message,
        summary: {
            total: result.total,
            succeeded: result.succeeded,
            failed: result.failed,
            counts: result.counts,
        },
        durationMs: result.durationMs,
    };

    if (result.embeddingStats) {
        response.embeddingStats = result.embeddingStats;
    }
    if (result.errors.length > 0) {
        response.errors = result.errors.slice(0, 100);
    }
    if (result.warnings.length > 0) {
        response.warnings = result.warnings.slice(0, 50);
    }

    return response;
}

/**
 * Validate the search index id and document id path params together.
 */
type DocumentParamsResult =
    | { response: ReturnType<typeof apiResponse.validationError>; searchIndexId?: undefined; documentId?: undefined }
    | { response?: undefined; searchIndexId: string; documentId: string };

function validateDocumentParams(params: { id: string; documentId: string }): DocumentParamsResult {
    const idValidation = searchIndexIdSchema.safeParse({ id: params.id });
    if (!idValidation.success) {
        return { response: apiResponse.validationError(idValidation.error) };
    }

    const documentValidation = documentIdParamSchema.safeParse({ documentId: params.documentId });
    if (!documentValidation.success) {
        return { response: apiResponse.validationError(documentValidation.error) };
    }

    return {
        searchIndexId: idValidation.data.id,
        documentId: documentValidation.data.documentId,
    };
}

/**
 * Run a single-document write (PUT or PATCH).
 *
 * PATCH requires the document to already exist — a merge against a missing
 * document would silently create a partial one, which is never what a caller
 * patching a known id wants. PUT is an upsert by design.
 */
async function handleSingleDocumentWrite(
    request: NextRequest,
    context: { params: Promise<{ id: string; documentId: string }> },
    action: Extract<DocumentWriteAction, 'upload' | 'merge'>
) {
    try {
        const params = await context.params;
        const validated = validateDocumentParams(params);
        if (validated.response) {
            return validated.response;
        }
        const { searchIndexId, documentId } = validated;

        const authResult = await resolveDocumentActor(request, {
            searchIndexId,
            operation: 'write',
        });
        if (authResult.response) {
            return authResult.response;
        }
        const actor = authResult.actor;

        let body: unknown;
        try {
            body = await request.json();
        } catch {
            return apiResponse.badRequest('Invalid JSON body');
        }

        const validation = writeDocumentRequestSchema.safeParse(body);
        if (!validation.success) {
            return apiResponse.validationError(validation.error);
        }

        if (action === 'merge') {
            const existing = await getDocument(searchIndexId, documentId);
            if (!existing.found) {
                return apiResponse.notFound(`Document "${documentId}" not found`);
            }
        }

        const result = await writeDocuments(searchIndexId, [{
            action,
            documentId,
            document: validation.data.document,
        }]);

        const verb = action === 'upload' ? 'replaced' : 'updated';
        const message = result.success
            ? `Document ${verb}`
            : result.errors[0]?.error || `Failed to ${action} document`;

        logger.info('Single document write completed', {
            searchIndexId,
            documentId,
            action,
            success: result.success,
            ...actorLogContext(actor),
        });

        return apiResponse.success(
            buildWriteResponse(result, message),
            result.success ? 200 : 207
        );
    } catch (error) {
        return mapWriteError(error, `Failed to ${action} document`);
    }
}

/**
 * Deepest reachable document offset.
 *
 * Elasticsearch refuses `from + size` beyond index.max_result_window (10 000 by
 * default) and Azure caps `$skip` at 100 000. Enforcing the tighter limit here
 * turns an opaque provider error into a clear message.
 */
const MAX_BROWSE_OFFSET = 10_000;

/**
 * GET /api/search-indexes/:id/documents
 * Page through the documents in an index
 */
export async function handleListDocuments(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const params = await context.params;
        const paramValidation = searchIndexIdSchema.safeParse(params);
        if (!paramValidation.success) {
            return apiResponse.validationError(paramValidation.error);
        }

        // Read-only: being scoped to the index is enough, no operation required
        const authResult = await resolveDocumentActor(request, {
            searchIndexId: paramValidation.data.id,
        });
        if (authResult.response) {
            return authResult.response;
        }

        const { searchParams } = new URL(request.url);
        const queryValidation = listDocumentsQuerySchema.safeParse({
            page: searchParams.get('page') ?? undefined,
            pageSize: searchParams.get('pageSize') ?? undefined,
        });
        if (!queryValidation.success) {
            return apiResponse.validationError(queryValidation.error);
        }

        const { page, pageSize } = queryValidation.data;

        if ((page - 1) * pageSize >= MAX_BROWSE_OFFSET) {
            return apiResponse.badRequest(
                `Cannot page beyond ${MAX_BROWSE_OFFSET.toLocaleString()} documents. Narrow the set or use export for full extraction.`
            );
        }

        const result = await listDocuments(paramValidation.data.id, { page, pageSize });

        const response: ListDocumentsResponse = {
            documents: result.documents,
            columns: result.columns,
            pagination: {
                page: result.page,
                pageSize: result.pageSize,
                totalPages: Math.max(1, Math.ceil(result.total / result.pageSize)),
                totalItems: result.total,
            },
        };

        return apiResponse.success(response);
    } catch (error) {
        return mapWriteError(error, 'Failed to list documents');
    }
}

/**
 * GET /api/search-indexes/:id/documents/:documentId
 * Fetch a single indexed document
 */
export async function handleGetDocument(
    request: NextRequest,
    context: { params: Promise<{ id: string; documentId: string }> }
) {
    try {
        const params = await context.params;
        const validated = validateDocumentParams(params);
        if (validated.response) {
            return validated.response;
        }

        // Read-only: being scoped to the index is enough
        const authResult = await resolveDocumentActor(request, {
            searchIndexId: validated.searchIndexId,
        });
        if (authResult.response) {
            return authResult.response;
        }

        const result = await getDocument(validated.searchIndexId, validated.documentId);

        if (!result.found || !result.document) {
            return apiResponse.notFound(`Document "${validated.documentId}" not found`);
        }

        const response: GetDocumentResponse = {
            documentId: result.documentId,
            document: result.document,
        };

        return apiResponse.success(response);
    } catch (error) {
        return mapWriteError(error, 'Failed to get document');
    }
}

/**
 * PUT /api/search-indexes/:id/documents/:documentId
 * Replace a document in full (creates it if absent)
 */
export async function handleReplaceDocument(
    request: NextRequest,
    context: { params: Promise<{ id: string; documentId: string }> }
) {
    return handleSingleDocumentWrite(request, context, 'upload');
}

/**
 * PATCH /api/search-indexes/:id/documents/:documentId
 * Partially update a document; omitted fields keep their stored values
 */
export async function handleMergeDocument(
    request: NextRequest,
    context: { params: Promise<{ id: string; documentId: string }> }
) {
    return handleSingleDocumentWrite(request, context, 'merge');
}

/**
 * DELETE /api/search-indexes/:id/documents/:documentId
 * Delete a single document
 */
export async function handleDeleteDocument(
    request: NextRequest,
    context: { params: Promise<{ id: string; documentId: string }> }
) {
    try {
        const params = await context.params;
        const validated = validateDocumentParams(params);
        if (validated.response) {
            return validated.response;
        }
        const { searchIndexId, documentId } = validated;

        const authResult = await resolveDocumentActor(request, {
            searchIndexId,
            operation: 'delete',
        });
        if (authResult.response) {
            return authResult.response;
        }

        // Providers treat deleting an absent document as success (deletes are
        // idempotent, which matters for retryable bulk sync). On this route the
        // caller named a specific document, so report the truth instead.
        const existing = await getDocument(searchIndexId, documentId);
        if (!existing.found) {
            return apiResponse.notFound(`Document "${documentId}" not found`);
        }

        const result = await writeDocuments(searchIndexId, [{
            action: 'delete',
            documentId,
        }]);

        if (!result.success) {
            return apiResponse.success(
                buildWriteResponse(result, result.errors[0]?.error || 'Failed to delete document'),
                207
            );
        }

        logger.info('Document deleted', {
            searchIndexId,
            documentId,
            ...actorLogContext(authResult.actor),
        });

        return apiResponse.success(buildWriteResponse(result, 'Document deleted'));
    } catch (error) {
        return mapWriteError(error, 'Failed to delete document');
    }
}

/**
 * POST /api/search-indexes/:id/documents/bulk
 * Apply a batch of mixed add/update/delete operations
 */
export async function handleBulkWriteDocuments(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const params = await context.params;
        const paramValidation = searchIndexIdSchema.safeParse(params);
        if (!paramValidation.success) {
            return apiResponse.validationError(paramValidation.error);
        }

        // Identity and index scope first; the operations this request needs depend
        // on the body, so they are checked once it has been parsed.
        const authResult = await resolveDocumentActor(request, {
            searchIndexId: paramValidation.data.id,
        });
        if (authResult.response) {
            return authResult.response;
        }
        const actor = authResult.actor;

        // Same payload ceiling as a full upload
        const contentLength = request.headers.get('content-length');
        if (contentLength) {
            const size = parseInt(contentLength, 10);
            if (size > elasticsearchConfig.indexing.maxFileSizeBytes) {
                return apiResponse.badRequest(
                    `Payload too large. Maximum size: ${Math.round(elasticsearchConfig.indexing.maxFileSizeBytes / 1024 / 1024)}MB`
                );
            }
        }

        let body: unknown;
        try {
            body = await request.json();
        } catch {
            return apiResponse.badRequest('Invalid JSON body');
        }

        const validation = bulkWriteRequestSchema.safeParse(body);
        if (!validation.success) {
            return apiResponse.validationError(validation.error);
        }

        const searchIndexId = paramValidation.data.id;
        const operations = validation.data.operations as DocumentWriteOperation[];

        // A bulk batch may contain deletes, uploads, or both, so check each
        // capability the body actually asks for. A write-only key must not be able
        // to smuggle a delete through this endpoint.
        const needsDelete = operations.some(operation => operation.action === 'delete');
        const needsWrite = operations.some(operation => operation.action !== 'delete');

        if (needsWrite && !actorCan(actor, 'write')) {
            return apiResponse.forbidden(
                'This ingestion key is not permitted to perform that operation'
            );
        }
        if (needsDelete && !actorCan(actor, 'delete')) {
            return apiResponse.forbidden(
                'This ingestion key is not permitted to perform that operation'
            );
        }

        logger.info('Starting bulk document write', {
            searchIndexId,
            operationCount: operations.length,
            ...actorLogContext(actor),
        });

        const result = await writeDocuments(searchIndexId, operations);

        const { upload, merge, delete: removed } = result.counts;
        const message = result.success
            ? `Applied ${result.succeeded} operations (${upload} replaced, ${merge} merged, ${removed} deleted)`
            : `Completed with ${result.failed} failures (${upload} replaced, ${merge} merged, ${removed} deleted)`;

        logger.info('Bulk document write completed', {
            searchIndexId,
            succeeded: result.succeeded,
            failed: result.failed,
            counts: result.counts,
            durationMs: result.durationMs,
            ...actorLogContext(actor),
        });

        return apiResponse.success(
            buildWriteResponse(result, message),
            result.success ? 200 : 207 // 207 = Multi-Status
        );
    } catch (error) {
        return mapWriteError(error, 'Bulk document write failed');
    }
}

/**
 * POST /api/search-indexes/:id/documents/delete-by-filter
 * Delete every document matching a filter. Pass dryRun to preview the count.
 *
 * POST rather than DELETE-with-body: request bodies on DELETE are unreliable
 * through proxies and some fetch implementations.
 */
export async function handleDeleteDocumentsByFilter(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const params = await context.params;
        const paramValidation = searchIndexIdSchema.safeParse(params);
        if (!paramValidation.success) {
            return apiResponse.validationError(paramValidation.error);
        }

        const authResult = await resolveDocumentActor(request, {
            searchIndexId: paramValidation.data.id,
            operation: 'delete',
        });
        if (authResult.response) {
            return authResult.response;
        }
        const actor = authResult.actor;

        let body: unknown;
        try {
            body = await request.json();
        } catch {
            return apiResponse.badRequest('Invalid JSON body');
        }

        const validation = deleteByFilterRequestSchema.safeParse(body);
        if (!validation.success) {
            return apiResponse.validationError(validation.error);
        }

        const searchIndexId = paramValidation.data.id;
        const { filters, dryRun, sampleSize } = validation.data;

        // The recursive filter schema's inferred type widens `field` to optional;
        // the schema itself requires it at runtime. Same cast the search handlers
        // use for searchRequestSchema.
        const result = await deleteDocumentsByFilter(
            searchIndexId,
            filters as FilterClause[],
            { dryRun, sampleSize }
        );

        const response: DeleteByFilterResponse = {
            matched: result.matched,
            deleted: result.deleted,
            sample: result.sample,
            columns: result.columns,
            dryRun: result.dryRun,
            message: result.dryRun
                ? `${result.matched} documents match this filter`
                : `Deleted ${result.deleted} documents`,
            durationMs: result.durationMs,
        };

        logger.info('Delete by filter completed', {
            searchIndexId,
            matched: result.matched,
            deleted: result.deleted,
            sampled: result.sample.length,
            dryRun: result.dryRun,
            ...actorLogContext(actor),
        });

        return apiResponse.success(response);
    } catch (error) {
        return mapWriteError(error, 'Delete by filter failed');
    }
}
