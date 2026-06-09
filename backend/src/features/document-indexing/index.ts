// src/features/document-indexing/index.ts

/**
 * Document Indexing Feature - Public API
 *
 * Server-only module for document transformation and indexing
 */

// ============================================================================
// TYPES
// ============================================================================

export type {
    // Transformer types
    TransformResult,
    TransformOptions,

    // Indexer types
    IndexingRequest,
    IndexingProgress,
    IndexingResult,

    // API types
    IndexDocumentsRequest,
    BatchIdParam,
    IndexingStatusResponse,
    IndexDocumentsResponse,
    BatchListResponse,
} from './document-indexing.types';

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

export {
    documentSchema,
    indexDocumentsRequestSchema,
    batchIdParamSchema,
} from './document-indexing.types';

// ============================================================================
// TRANSFORMER SERVICE
// ============================================================================

export {
    transformDocument,
    transformDocuments,
    validateFieldMappings,
} from './document-transformer.service';

// ============================================================================
// INDEXER SERVICE
// ============================================================================

export {
    indexDocuments,
    getBatch,
    getIndexingProgress,
    listBatches,
    cancelBatch,
} from './document-indexer.service';

// ============================================================================
// API HANDLERS
// ============================================================================

export {
    handleIndexDocuments,
    handleIngestDocuments,
    handleListBatches,
    handleGetBatchStatus,
    handleCancelBatch,
} from './document-indexing.api.handlers';
