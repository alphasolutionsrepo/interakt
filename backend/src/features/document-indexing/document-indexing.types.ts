// src/features/document-indexing/document-indexing.types.ts

/**
 * Document Indexing Types
 * Types for the document indexing feature
 */

import { z } from 'zod';

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
// RE-EXPORTS FROM SERVICES
// ============================================================================

export type {
    TransformResult,
    TransformOptions,
} from './document-transformer.service';

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
