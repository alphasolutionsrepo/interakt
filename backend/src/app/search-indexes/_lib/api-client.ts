// app/search-indexes/_lib/api-client.ts

/**
 * Search Index API Client
 * 
 * Frontend API client for search index operations.
 * 
 * UPDATED: Added new mapping config endpoints
 */

import type {
    SearchIndex,
    SearchIndexComplete,
    SearchIndexSummary,
    SearchIndexListResponse,
    CreateSearchIndexDTO,
    UpdateSearchIndexDTO,
    ListSearchIndexesQuery,
    IndexStats,
    MappingSyncStatus,
    // Field types
    SearchIndexField,
    FieldMappingSummary,
    MappingValidationResult,
    UpdateSearchIndexFieldDTO,
    BulkUpdateFieldMappingsDTO,
    FieldMappingConfig,
} from '@/features/search-index';

// ============================================================================
// EXPORT/IMPORT TYPES
// ============================================================================

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

export interface SearchIndexImportPayload {
    importData: unknown;
    overrideName?: string;
    aiConfig?: {
        aiProviderId: string;
        aiModelId: number;
        embeddingDimensions: number;
    };
}

export interface SearchIndexImportResult {
    success: boolean;
    searchIndexId?: string;
    message: string;
    warnings?: string[];
}

// ============================================================================
// ERROR HANDLING
// ============================================================================

export class ApiError extends Error {
    status: number;
    details?: unknown;

    constructor(message: string, status: number, details?: unknown) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.details = details;
    }
}

async function handleResponse<T>(response: Response): Promise<T> {
    const data = await response.json();
    
    if (!response.ok) {
        throw new ApiError(
            data.error || data.message || 'An error occurred',
            response.status,
            data.details
        );
    }
    
    return data.data ?? data;
}

// ============================================================================
// Search Indexes API
// ============================================================================

export const searchIndexesApi = {
    // ========================================================================
    // CRUD
    // ========================================================================

    /**
     * Create a new search index
     */
    create: async (data: CreateSearchIndexDTO): Promise<SearchIndex> => {
        const response = await fetch('/api/search-indexes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        return handleResponse<SearchIndex>(response);
    },

    /**
     * Get search index by ID
     */
    getById: async (id: string): Promise<SearchIndexComplete> => {
        const response = await fetch(`/api/search-indexes/${id}`);
        return handleResponse<SearchIndexComplete>(response);
    },

    /**
     * Get search index by name
     */
    getByName: async (name: string): Promise<SearchIndexComplete> => {
        const response = await fetch(`/api/search-indexes/name/${encodeURIComponent(name)}`);
        return handleResponse<SearchIndexComplete>(response);
    },

    /**
     * List search indexes with pagination
     */
    list: async (query?: ListSearchIndexesQuery): Promise<SearchIndexListResponse> => {
        const params = new URLSearchParams();
        if (query) {
            Object.entries(query).forEach(([key, value]) => {
                if (value !== undefined && value !== null) {
                    params.set(key, String(value));
                }
            });
        }
        const url = `/api/search-indexes${params.toString() ? `?${params}` : ''}`;
        const response = await fetch(url);
        return handleResponse<SearchIndexListResponse>(response);
    },

    /**
     * Get all active search indexes (for dropdowns)
     */
    getAllActive: async (): Promise<SearchIndexSummary[]> => {
        const response = await fetch('/api/search-indexes?isActive=true&pageSize=100');
        const result = await handleResponse<SearchIndexListResponse>(response);
        return result.items;
    },

    /**
     * Update a search index
     */
    update: async (id: string, data: UpdateSearchIndexDTO): Promise<SearchIndex> => {
        const response = await fetch(`/api/search-indexes/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        return handleResponse<SearchIndex>(response);
    },

    /**
     * Delete a search index
     */
    delete: async (id: string): Promise<{ message: string }> => {
        const response = await fetch(`/api/search-indexes/${id}`, {
            method: 'DELETE',
        });
        return handleResponse<{ message: string }>(response);
    },

    // ========================================================================
    // STATUS
    // ========================================================================

    /**
     * Activate a search index
     */
    activate: async (id: string): Promise<SearchIndex> => {
        const response = await fetch(`/api/search-indexes/${id}/activate`, {
            method: 'PATCH',
        });
        return handleResponse<SearchIndex>(response);
    },

    /**
     * Deactivate a search index
     */
    deactivate: async (id: string): Promise<SearchIndex> => {
        const response = await fetch(`/api/search-indexes/${id}/deactivate`, {
            method: 'PATCH',
        });
        return handleResponse<SearchIndex>(response);
    },

    /**
     * Get index statistics
     */
    getStats: async (id: string): Promise<IndexStats> => {
        const response = await fetch(`/api/search-indexes/${id}/stats`);
        return handleResponse<IndexStats>(response);
    },

    /**
     * Get sync status
     */
    getSyncStatus: async (id: string): Promise<MappingSyncStatus> => {
        const response = await fetch(`/api/search-indexes/${id}/sync-status`);
        return handleResponse<MappingSyncStatus>(response);
    },

    // ========================================================================
    // NAME CHECK
    // ========================================================================

    /**
     * Check if a name is available
     */
    checkName: async (
        name: string, 
        excludeId?: string
    ): Promise<{ available: boolean; message?: string }> => {
        const params = new URLSearchParams({ name });
        if (excludeId) {
            params.set('excludeId', excludeId);
        }
        const response = await fetch(`/api/search-indexes/check-name?${params}`);
        return handleResponse<{ available: boolean; message?: string }>(response);
    },

    // ========================================================================
    // INDEXING
    // ========================================================================

    /**
     * Trigger reindex - performs full reindex of all documents
     * Returns the result with document count and duration
     */
    triggerReindex: async (id: string): Promise<{ message: string; documentCount: number; durationMs: number }> => {
        const response = await fetch(`/api/search-indexes/${id}/reindex`, {
            method: 'POST',
        });
        return handleResponse<{ message: string; documentCount: number; durationMs: number }>(response);
    },

    /**
     * Recreate the search provider index (empty) from DB field definitions.
     * Use when the provider index is missing after a failed reindex.
     */
    recreateEmptyIndex: async (id: string): Promise<{ message: string }> => {
        const response = await fetch(`/api/search-indexes/${id}/recreate-index`, {
            method: 'POST',
        });
        return handleResponse<{ message: string }>(response);
    },

    // ========================================================================
    // AI CONFIGURATION
    // ========================================================================

    /**
     * Change AI configuration (provider, model, dimensions)
     *
     * WARNING: This is a destructive operation that:
     * - Deletes the Elasticsearch index and all indexed documents
     * - Updates the AI provider, model, and embedding dimensions
     * - Requires re-indexing all documents afterward
     *
     * @param id - Search index ID
     * @param config - New AI configuration
     * @returns Result with updated search index and documents deleted count
     */
    changeAIConfig: async (
        id: string,
        config: {
            aiProviderId: string;
            aiModelId: number;
            embeddingDimensions: number;
            vectorSimilarity?: 'cosine' | 'euclidean' | 'dot_product';
            confirmText: 'CONFIRM';
        }
    ): Promise<{
        message: string;
        searchIndex: SearchIndexComplete;
        documentsDeleted: number;
    }> => {
        const response = await fetch(`/api/search-indexes/${id}/change-ai-config`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config),
        });
        return handleResponse<{
            message: string;
            searchIndex: SearchIndexComplete;
            documentsDeleted: number;
        }>(response);
    },

    // ========================================================================
    // CACHE
    // ========================================================================

    /**
     * Clear cache
     */
    clearCache: async (): Promise<{ message: string }> => {
        const response = await fetch('/api/search-indexes/cache/clear', {
            method: 'POST',
        });
        return handleResponse<{ message: string }>(response);
    },

    /**
     * Get cache stats
     */
    getCacheStats: async (): Promise<{
        size: number;
        hits: number;
        misses: number;
        hitRate: string;
    }> => {
        const response = await fetch('/api/search-indexes/cache/stats');
        return handleResponse(response);
    },

    // ========================================================================
    // EXPORT/IMPORT
    // ========================================================================

    /**
     * Export search index as JSON blob
     */
    export: async (id: string): Promise<Blob> => {
        const response = await fetch(`/api/search-indexes/${id}/export`);
        if (!response.ok) {
            const data = await response.json();
            throw new ApiError(
                data.error || data.message || 'Export failed',
                response.status,
                data.details
            );
        }
        return response.blob();
    },

    /**
     * Preview search index import
     */
    previewImport: async (importData: unknown): Promise<SearchIndexImportPreview> => {
        const response = await fetch('/api/search-indexes/import/preview', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(importData),
        });
        return handleResponse<SearchIndexImportPreview>(response);
    },

    /**
     * Import search index from JSON
     */
    import: async (payload: SearchIndexImportPayload): Promise<SearchIndexImportResult> => {
        const response = await fetch('/api/search-indexes/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        return handleResponse<SearchIndexImportResult>(response);
    },
};

// ============================================================================
// Search Index Fields API
// ============================================================================

export const searchIndexFieldsApi = {
    /**
     * Create a new custom field on a search index
     */
    createField: async (
        searchIndexId: string,
        data: {
            fieldName: string;
            fieldType: string;
            displayName?: string | null;
            isSearchable?: boolean;
            isFacetable?: boolean;
            includeInResponse?: boolean;
            boostValue?: number;
            isVectorSource?: boolean;
            isAutocomplete?: boolean;
            isRequired?: boolean;
            sourceFieldPath?: string | null;
            /** Per-provider override JSON. Round-tripped to ES/Azure mappers verbatim. */
            providerFieldSettings?: Record<string, unknown> | null;
            mappingConfig?: {
                mode: string;
                transform?: string;
                staticValue?: unknown;
                generator?: string;
                computed?: {
                    sourceArrayPath: string;
                    extractField: string;
                    aggregation: string;
                };
                collectFields?: string[];
                sourceFromField?: string;
            };
        }
    ): Promise<SearchIndexField> => {
        const response = await fetch(`/api/search-indexes/${searchIndexId}/fields`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        return handleResponse<SearchIndexField>(response);
    },

    /**
     * Create fields from a sample JSON document.
     * Infers types and creates fields that don't already exist.
     */
    createFieldsFromJson: async (
        searchIndexId: string,
        sampleJson: unknown,
        maxDepth?: number
    ): Promise<{
        created: SearchIndexField[];
        skipped: string[];
        createdCount: number;
        skippedCount: number;
    }> => {
        const response = await fetch(`/api/search-indexes/${searchIndexId}/fields/from-json`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sampleJson, maxDepth }),
        });
        return handleResponse<{
            created: SearchIndexField[];
            skipped: string[];
            createdCount: number;
            skippedCount: number;
        }>(response);
    },

    /**
     * Create fields in bulk from exported field-mapping JSON entries.
     * Each entry's full mapping config + attributes are applied on create.
     * Used by the "Import Field Mappings" dialog when JSON has fields the
     * index doesn't yet contain.
     */
    createFieldsFromMapping: async (
        searchIndexId: string,
        entries: Array<{
            fieldName: string;
            fieldType: string;
            displayName?: string | null;
            isRequired?: boolean;
            mapping: {
                mode: string;
                sourceField: string | null;
                transform?: string;
                staticValue?: unknown;
                generator?: string;
                computed?: unknown;
                collectFields?: string[];
                sourceFromField?: string;
            };
            attributes: {
                isSearchable: boolean;
                isFacetable: boolean;
                includeInResponse: boolean;
                boostValue: number;
                isVectorSource: boolean;
            };
        }>,
    ): Promise<{
        created: SearchIndexField[];
        errors: Array<{ fieldName: string; error: string }>;
        createdCount: number;
        errorCount: number;
    }> => {
        const response = await fetch(`/api/search-indexes/${searchIndexId}/fields/from-mapping`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ entries }),
        });
        return handleResponse<{
            created: SearchIndexField[];
            errors: Array<{ fieldName: string; error: string }>;
            createdCount: number;
            errorCount: number;
        }>(response);
    },

    /**
     * Create fields from user-reviewed definitions (confirmed types/names).
     * Called after the review dialog.
     */
    createFieldsFromReview: async (
        searchIndexId: string,
        fields: Array<{ fieldName: string; fieldType: string; displayName: string }>
    ): Promise<{ created: SearchIndexField[]; createdCount: number }> => {
        const response = await fetch(`/api/search-indexes/${searchIndexId}/fields/from-review`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fields }),
        });
        return handleResponse<{ created: SearchIndexField[]; createdCount: number }>(response);
    },

    /**
     * Delete a custom field from a search index.
     * System fields cannot be deleted.
     */
    deleteField: async (
        searchIndexId: string,
        fieldId: number
    ): Promise<{ message: string }> => {
        const response = await fetch(`/api/search-indexes/${searchIndexId}/fields/${fieldId}`, {
            method: 'DELETE',
        });
        return handleResponse<{ message: string }>(response);
    },

    /**
     * Get all fields for a search index
     */
    list: async (searchIndexId: string): Promise<SearchIndexField[]> => {
        const response = await fetch(`/api/search-indexes/${searchIndexId}/fields`);
        return handleResponse<SearchIndexField[]>(response);
    },

    /**
     * Get field mapping summary
     */
    getSummary: async (searchIndexId: string): Promise<FieldMappingSummary> => {
        const response = await fetch(`/api/search-indexes/${searchIndexId}/fields/summary`);
        return handleResponse<FieldMappingSummary>(response);
    },

    /**
     * Validate field mappings
     */
    validate: async (searchIndexId: string): Promise<MappingValidationResult> => {
        const response = await fetch(`/api/search-indexes/${searchIndexId}/fields/validate`);
        return handleResponse<MappingValidationResult>(response);
    },

    /**
     * Update a single field configuration
     */
    updateField: async (
        searchIndexId: string,
        fieldId: number,
        data: UpdateSearchIndexFieldDTO
    ): Promise<SearchIndexField> => {
        const response = await fetch(`/api/search-indexes/${searchIndexId}/fields/${fieldId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        return handleResponse<SearchIndexField>(response);
    },

    /**
     * Update a field's mapping configuration only
     * Used for setting mode, static value, generator, etc.
     * 
     * NEW ENDPOINT
     */
    updateFieldMappingConfig: async (
        searchIndexId: string,
        fieldId: number,
        config: FieldMappingConfig
    ): Promise<SearchIndexField> => {
        const response = await fetch(`/api/search-indexes/${searchIndexId}/fields/${fieldId}/config`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config),
        });
        return handleResponse<SearchIndexField>(response);
    },

    /**
     * Get distinct indexed values for a facetable field.
     * Used for auto-generating filter canonical value mappings.
     */
    getFieldDistinctValues: async (
        searchIndexId: string,
        fieldId: number
    ): Promise<{ fieldName: string; values: Array<{ value: string; count: number }>; totalDistinct: number }> => {
        const response = await fetch(`/api/search-indexes/${searchIndexId}/fields/${fieldId}/distinct-values`);
        return handleResponse<{ fieldName: string; values: Array<{ value: string; count: number }>; totalDistinct: number }>(response);
    },

    /**
     * Bulk update field mappings
     */
    bulkUpdateMappings: async (
        searchIndexId: string,
        data: BulkUpdateFieldMappingsDTO
    ): Promise<SearchIndexField[]> => {
        const response = await fetch(`/api/search-indexes/${searchIndexId}/fields/mappings`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        return handleResponse<SearchIndexField[]>(response);
    },

    /**
     * Clear all field mappings
     */
    clearMappings: async (searchIndexId: string): Promise<{ message: string; clearedCount: number }> => {
        const response = await fetch(`/api/search-indexes/${searchIndexId}/fields/mappings`, {
            method: 'DELETE',
        });
        return handleResponse<{ message: string; clearedCount: number }>(response);
    },

    /**
     * Update additionalData field's collect configuration
     * Used to select which unmapped source fields to collect
     * 
     * NEW ENDPOINT
     */
    updateAdditionalDataConfig: async (
        searchIndexId: string,
        collectFields: string[]
    ): Promise<SearchIndexField> => {
        const response = await fetch(`/api/search-indexes/${searchIndexId}/fields/additional-data`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ collectFields }),
        });
        return handleResponse<SearchIndexField>(response);
    },
};

// ============================================================================
// DEPRECATED: Field Mappings API (for backward compatibility)
// ============================================================================

// ============================================================================
// Document Indexing API
// ============================================================================

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

export interface BatchListItem {
    id: string;
    status: string;
    totalDocuments: number;
    indexedDocuments: number;
    failedDocuments: number;
    sourceFileName: string | null;
    createdAt: string;
    completedAt: string | null;
    durationMs: number | null;
}

export const documentIndexingApi = {
    /**
     * Upload and index documents
     */
    indexDocuments: async (
        searchIndexId: string,
        documents: Record<string, unknown>[],
        sourceFileName?: string
    ): Promise<IndexDocumentsResponse> => {
        const response = await fetch(`/api/search-indexes/${searchIndexId}/documents`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ documents, sourceFileName }),
        });
        return handleResponse<IndexDocumentsResponse>(response);
    },

    /**
     * List indexing batches for a search index
     */
    listBatches: async (
        searchIndexId: string,
        limit?: number
    ): Promise<{ batches: BatchListItem[] }> => {
        const params = limit ? `?limit=${limit}` : '';
        const response = await fetch(`/api/search-indexes/${searchIndexId}/documents/batches${params}`);
        return handleResponse<{ batches: BatchListItem[] }>(response);
    },

    /**
     * Get indexing batch status
     */
    getBatchStatus: async (
        searchIndexId: string,
        batchId: string
    ): Promise<IndexingStatusResponse> => {
        const response = await fetch(`/api/search-indexes/${searchIndexId}/documents/batches/${batchId}`);
        return handleResponse<IndexingStatusResponse>(response);
    },

    /**
     * Cancel an in-progress indexing batch
     */
    cancelBatch: async (
        searchIndexId: string,
        batchId: string
    ): Promise<{ cancelled: boolean; batchId: string }> => {
        const response = await fetch(`/api/search-indexes/${searchIndexId}/documents/batches/${batchId}`, {
            method: 'DELETE',
        });
        return handleResponse<{ cancelled: boolean; batchId: string }>(response);
    },
};

// ============================================================================
// DEPRECATED: Field Mappings API (for backward compatibility)
// ============================================================================

/**
 * @deprecated Use searchIndexFieldsApi instead
 */
export const fieldMappingsApi = {
    /**
     * @deprecated Use searchIndexFieldsApi.list instead
     */
    list: async (searchIndexId: string): Promise<SearchIndexField[]> => {
        return searchIndexFieldsApi.list(searchIndexId);
    },

    /**
     * @deprecated Use searchIndexFieldsApi.bulkUpdateMappings instead
     */
    replaceAll: async (
        searchIndexId: string,
        mappings: Array<{ fieldId: number; sourceFieldName: string | null; sourceFieldPath?: string | null }>
    ): Promise<SearchIndexField[]> => {
        return searchIndexFieldsApi.bulkUpdateMappings(searchIndexId, { mappings });
    },
};