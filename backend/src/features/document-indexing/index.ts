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

    // Writer types (incremental add/update/delete)
    DocumentWriteAction,
    DocumentWriteOperation,
    DocumentWriteResult,
    DocumentReadResult,
    DeleteByFilterOutcome,
    ListDocumentsOutcome,
    DocumentColumn,

    // API types
    IndexDocumentsRequest,
    BatchIdParam,
    DocumentIdParam,
    WriteDocumentRequest,
    BulkWriteOperationInput,
    BulkWriteRequest,
    DeleteByFilterRequest,
    ListDocumentsQuery,
    IndexingStatusResponse,
    IndexDocumentsResponse,
    BatchListResponse,
    GetDocumentResponse,
    WriteDocumentsResponse,
    DeleteByFilterResponse,
    ListDocumentsResponse,
    DocumentSummary,
    DocumentColumnDescriptor,
} from './document-indexing.types';

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

export {
    documentSchema,
    indexDocumentsRequestSchema,
    batchIdParamSchema,
    documentIdParamSchema,
    writeDocumentRequestSchema,
    bulkWriteOperationSchema,
    bulkWriteRequestSchema,
    deleteByFilterRequestSchema,
    listDocumentsQuerySchema,
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
    updateIndexStats,
} from './document-indexer.service';

// ============================================================================
// WRITER SERVICE (incremental add / update / delete)
// ============================================================================

export {
    getDocument,
    listDocuments,
    writeDocuments,
    deleteDocumentsByFilter,
    SearchIndexNotFoundError,
    IndexNotProvisionedError,
} from './document-writer.service';

// ============================================================================
// API HANDLERS
// ============================================================================

export {
    handleIndexDocuments,
    handleListBatches,
    handleGetBatchStatus,
    handleCancelBatch,
    handleListDocuments,
    handleGetDocument,
    handleReplaceDocument,
    handleMergeDocument,
    handleDeleteDocument,
    handleBulkWriteDocuments,
    handleDeleteDocumentsByFilter,
} from './document-indexing.api.handlers';
