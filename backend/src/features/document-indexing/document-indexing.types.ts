// src/features/document-indexing/document-indexing.types.ts

/**
 * Document Indexing Types
 * Types for the document indexing feature
 */

import { z } from 'zod';
import { filterClauseSchema } from '@/features/search/search.validation';
import type { FieldType } from '@/shared/constants/field-types';
import type { EmbeddingPreview } from './embedding-text';

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

/**
 * Schema for single document in upload
 */
export const documentSchema = z.record(z.unknown());

/**
 * Schema for document upload request
 */
export const indexDocumentsRequestSchema = z.object({
    documents: z.array(documentSchema).min(1).max(10000),
    sourceFileName: z.string().max(255).optional(),
});

export type IndexDocumentsRequest = z.infer<typeof indexDocumentsRequestSchema>;

/**
 * Schema for batch ID param
 */
export const batchIdParamSchema = z.object({
    batchId: z.string().uuid(),
});

export type BatchIdParam = z.infer<typeof batchIdParamSchema>;

// ============================================================================
// INCREMENTAL UPDATE SCHEMAS
// ============================================================================

/**
 * Schema for a document ID path param.
 *
 * Not a UUID: the document key is whatever the index's mapped uniqueId field
 * produces, commonly a source-system id such as a SKU.
 */
export const documentIdParamSchema = z.object({
    documentId: z.string().min(1).max(1024),
});

export type DocumentIdParam = z.infer<typeof documentIdParamSchema>;

/**
 * Schema for a single-document write body (PUT / PATCH).
 *
 * The id comes from the URL, so the body carries only the source document.
 */
export const writeDocumentRequestSchema = z.object({
    document: documentSchema,
});

export type WriteDocumentRequest = z.infer<typeof writeDocumentRequestSchema>;

/**
 * Schema for one operation in a bulk write.
 *
 * - `upload` — full replace; documentId optional (falls back to mapped uniqueId)
 * - `merge`  — partial update; documentId optional (falls back to mapped uniqueId)
 * - `delete` — documentId required, no document body
 */
export const bulkWriteOperationSchema = z.discriminatedUnion('action', [
    z.object({
        action: z.literal('upload'),
        document: documentSchema,
        documentId: z.string().min(1).max(1024).optional(),
    }),
    z.object({
        action: z.literal('merge'),
        document: documentSchema,
        documentId: z.string().min(1).max(1024).optional(),
    }),
    z.object({
        action: z.literal('delete'),
        documentId: z.string().min(1).max(1024),
    }),
]);

export type BulkWriteOperationInput = z.infer<typeof bulkWriteOperationSchema>;

/**
 * Schema for the bulk write request.
 *
 * The cap matches elasticsearchConfig.indexing.maxDocumentsPerUpload.
 */
export const bulkWriteRequestSchema = z.object({
    operations: z.array(bulkWriteOperationSchema).min(1).max(10000),
});

export type BulkWriteRequest = z.infer<typeof bulkWriteRequestSchema>;

/**
 * Schema for the delete-by-filter request.
 *
 * Reuses the search API's filter clause schema so filter syntax is identical —
 * a filter can be tried in search first to preview what it selects. At least one
 * clause is required: an empty filter would match the entire index.
 */
export const deleteByFilterRequestSchema = z.object({
    filters: z.array(filterClauseSchema).min(1),
    dryRun: z.boolean().optional().default(false),
    /**
     * How many matching documents to return alongside the count on a dry run, so
     * the caller can see *what* the filter caught. Ignored when dryRun is false.
     * Set 0 to skip the sample fetch entirely.
     */
    sampleSize: z.number().int().min(0).max(50).optional().default(25),
});

export type DeleteByFilterRequest = z.infer<typeof deleteByFilterRequestSchema>;

/**
 * Schema for the browse/list query string.
 *
 * Coerced because these arrive as strings from the URL.
 */
export const listDocumentsQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export type ListDocumentsQuery = z.infer<typeof listDocumentsQuerySchema>;

// ============================================================================
// RE-EXPORTS FROM SERVICES
// ============================================================================

export type {
    TransformResult,
    TransformOptions,
} from './document-transformer.service';

export type {
    DocumentWriteAction,
    DocumentWriteOperation,
    DocumentWriteResult,
    DocumentReadResult,
    DeleteByFilterOutcome,
    ListDocumentsOutcome,
} from './document-writer.service';

export type { DocumentColumn } from './document-columns';

export type {
    EmbeddingPreview,
    EmbeddingTextPart,
    EmbeddingPartExclusion,
} from './embedding-text';

export type {
    IndexingRequest,
    IndexingProgress,
    IndexingResult,
} from './document-indexer.service';

// ============================================================================
// API RESPONSE TYPES
// ============================================================================

/**
 * Response type for indexing status endpoint
 */
export interface IndexingStatusResponse {
    batchId: string;
    status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
    progress: {
        total: number;
        processed: number;
        indexed: number;
        failed: number;
        percentage: number;
    };
    timing: {
        startedAt: string | null;
        completedAt: string | null;
        durationMs: number | null;
        estimatedRemainingMs?: number;
    };
    errors: Array<{
        documentIndex: number;
        documentId?: string;
        error: string;
        field?: string;
    }>;
}

/**
 * Response type for index documents endpoint
 */
export interface IndexDocumentsResponse {
    success: boolean;
    batchId: string;
    message: string;
    summary: {
        total: number;
        indexed: number;
        failed: number;
    };
    /** Embedding generation stats (only for semantic/hybrid indexes) */
    embeddingStats?: {
        enabled: boolean;
        generated: number;
        failed: number;
        skipped: number;
    };
    errors?: Array<{
        documentIndex: number;
        documentId?: string;
        error: string;
        field?: string;
    }>;
    warnings?: string[];
    durationMs: number;
}

/**
 * Response type for a single-document read
 */
export interface GetDocumentResponse {
    documentId: string;
    document: Record<string, unknown>;
    /**
     * Exactly the text this document's vector was built from, with a per-field
     * breakdown of what contributed and what did not. Absent when the index does
     * not embed. The stored vector is stripped from every read and a bad one
     * looks like a good one, so this is the only way to see why a document does
     * or does not match semantically.
     */
    embeddingPreview?: EmbeddingPreview;
}

/**
 * Response type for the incremental write endpoints
 * (PUT / PATCH / DELETE on a single document, and POST /documents/bulk)
 */
export interface WriteDocumentsResponse {
    success: boolean;
    message: string;
    summary: {
        total: number;
        succeeded: number;
        failed: number;
        /** Successful operation counts by action */
        counts: {
            upload: number;
            merge: number;
            delete: number;
        };
    };
    /** Embedding generation stats (only for semantic/hybrid indexes) */
    embeddingStats?: {
        enabled: boolean;
        generated: number;
        failed: number;
        skipped: number;
    };
    errors?: Array<{
        operationIndex: number;
        documentId?: string;
        error: string;
        field?: string;
    }>;
    warnings?: string[];
    durationMs: number;
}

/**
 * A document summarised for a table, plus the columns to render it with.
 */
export interface DocumentSummary {
    id: string;
    fields: Record<string, unknown>;
}

export interface DocumentColumnDescriptor {
    field: string;
    label: string;
    /**
     * The field's declared type, so the cell can be rendered as what it is — a
     * thumbnail, a link, a formatted date — instead of a stringified value.
     *
     * `'id'` marks the document key column, which has no field definition of its
     * own on an index that does not define uniqueId.
     */
    type: FieldType | 'id';
}

/**
 * Response type for the delete-by-filter endpoint
 */
export interface DeleteByFilterResponse {
    /** Documents matching the filter */
    matched: number;
    /** Documents actually deleted (0 for a dry run) */
    deleted: number;
    /**
     * Sample of matching documents — dry run only. Always a subset: the delete
     * applies to all `matched` documents, not just these.
     */
    sample: DocumentSummary[];
    /** Columns to render the sample with */
    columns: DocumentColumnDescriptor[];
    dryRun: boolean;
    message: string;
    durationMs: number;
}

/**
 * Response type for the paged document listing endpoint.
 *
 * Pagination is nested in the payload rather than using the envelope's
 * `pagination` field, matching this feature's own list endpoint
 * (SearchIndexListResponse) so the shared client `handleResponse<T>` helper —
 * which returns `data.data` and would otherwise drop the envelope pagination —
 * works unchanged.
 */
export interface ListDocumentsResponse {
    documents: DocumentSummary[];
    columns: DocumentColumnDescriptor[];
    pagination: {
        page: number;
        pageSize: number;
        totalPages: number;
        totalItems: number;
    };
}

/**
 * Response for batch list
 */
export interface BatchListResponse {
    batches: Array<{
        id: string;
        status: string;
        totalDocuments: number;
        indexedDocuments: number;
        failedDocuments: number;
        sourceFileName: string | null;
        createdAt: string;
        completedAt: string | null;
        durationMs: number | null;
    }>;
}
