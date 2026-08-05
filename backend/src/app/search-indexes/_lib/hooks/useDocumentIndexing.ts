// app/search-indexes/_lib/hooks/useDocumentIndexing.ts

/**
 * Document Indexing Hooks
 * React Query hooks for document upload and indexing operations
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    documentIndexingApi,
    type IndexingStatusResponse,
    type DocumentFilterClause,
    type DocumentWriteOperation,
} from '../api-client';
import { searchIndexKeys } from './useSearchIndexes';

// ============================================================================
// QUERY KEYS
// ============================================================================

export const documentIndexingKeys = {
    all: ['document-indexing'] as const,
    batches: (searchIndexId: string) =>
        [...documentIndexingKeys.all, 'batches', searchIndexId] as const,
    batch: (searchIndexId: string, batchId: string) =>
        [...documentIndexingKeys.batches(searchIndexId), batchId] as const,
    document: (searchIndexId: string, documentId: string) =>
        [...documentIndexingKeys.all, 'document', searchIndexId, documentId] as const,
    browse: (searchIndexId: string, page: number, pageSize: number) =>
        [...documentIndexingKeys.all, 'browse', searchIndexId, page, pageSize] as const,
};

// ============================================================================
// MUTATIONS
// ============================================================================

/**
 * Hook to upload and index documents
 */
export function useIndexDocuments(searchIndexId: string) {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({
            documents,
            sourceFileName,
        }: {
            documents: Record<string, unknown>[];
            sourceFileName?: string;
        }) => {
            return documentIndexingApi.indexDocuments(searchIndexId, documents, sourceFileName);
        },
        onSuccess: async () => {
            // Cancel any in-flight queries to prevent race conditions
            await queryClient.cancelQueries({
                queryKey: documentIndexingKeys.batches(searchIndexId),
            });

            // Force refetch batches list immediately
            await queryClient.refetchQueries({
                queryKey: documentIndexingKeys.batches(searchIndexId),
            });

            // Invalidate index stats and detail
            queryClient.invalidateQueries({
                queryKey: searchIndexKeys.stats(searchIndexId),
            });
            queryClient.invalidateQueries({
                queryKey: searchIndexKeys.detail(searchIndexId),
            });
        },
    });
}

/**
 * Hook to cancel an indexing batch
 */
export function useCancelBatch(searchIndexId: string) {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (batchId: string) => {
            return documentIndexingApi.cancelBatch(searchIndexId, batchId);
        },
        onSuccess: (_, batchId) => {
            // Invalidate the specific batch
            queryClient.invalidateQueries({
                queryKey: documentIndexingKeys.batch(searchIndexId, batchId),
            });
            // And the batches list
            queryClient.invalidateQueries({
                queryKey: documentIndexingKeys.batches(searchIndexId),
            });
        },
    });
}

// ============================================================================
// INCREMENTAL UPDATE MUTATIONS
// ============================================================================

/**
 * Invalidate everything whose value depends on the contents of an index.
 */
function useInvalidateIndexContents(searchIndexId: string) {
    const queryClient = useQueryClient();

    return () => {
        queryClient.invalidateQueries({
            queryKey: searchIndexKeys.stats(searchIndexId),
        });
        queryClient.invalidateQueries({
            queryKey: searchIndexKeys.detail(searchIndexId),
        });
        // Any browse page may now be stale — a delete shifts every later page up
        queryClient.invalidateQueries({
            queryKey: [...documentIndexingKeys.all, 'browse', searchIndexId],
        });
    };
}

/**
 * Hook to delete a single document from an index
 */
export function useDeleteDocument(searchIndexId: string) {
    const queryClient = useQueryClient();
    const invalidateContents = useInvalidateIndexContents(searchIndexId);

    return useMutation({
        mutationFn: async (documentId: string) => {
            return documentIndexingApi.deleteDocument(searchIndexId, documentId);
        },
        onSuccess: (_, documentId) => {
            // The document is gone — drop its cache entry rather than refetching
            queryClient.removeQueries({
                queryKey: documentIndexingKeys.document(searchIndexId, documentId),
            });
            invalidateContents();
        },
    });
}

/**
 * Hook to apply a batch of mixed add/update/delete operations
 */
export function useBulkWriteDocuments(searchIndexId: string) {
    const invalidateContents = useInvalidateIndexContents(searchIndexId);

    return useMutation({
        mutationFn: async (operations: DocumentWriteOperation[]) => {
            return documentIndexingApi.bulkWriteDocuments(searchIndexId, operations);
        },
        onSuccess: invalidateContents,
    });
}

/**
 * Hook to delete documents by filter.
 *
 * With dryRun the call is a preview — nothing is deleted and nothing is
 * invalidated.
 */
export function useDeleteDocumentsByFilter(searchIndexId: string) {
    const invalidateContents = useInvalidateIndexContents(searchIndexId);

    return useMutation({
        mutationFn: async ({
            filters,
            dryRun,
            sampleSize,
        }: {
            filters: DocumentFilterClause[];
            dryRun?: boolean;
            sampleSize?: number;
        }) => {
            return documentIndexingApi.deleteDocumentsByFilter(
                searchIndexId,
                filters,
                dryRun,
                sampleSize
            );
        },
        onSuccess: (result) => {
            if (!result.dryRun) {
                invalidateContents();
            }
        },
    });
}

// ============================================================================
// QUERIES
// ============================================================================

/**
 * Hook to page through the documents in an index.
 *
 * Keeps the previous page's data while the next one loads, so the table doesn't
 * collapse to a skeleton on every page turn.
 */
export function useBrowseDocuments(
    searchIndexId: string,
    page: number,
    pageSize: number,
    options?: { enabled?: boolean }
) {
    return useQuery({
        queryKey: documentIndexingKeys.browse(searchIndexId, page, pageSize),
        queryFn: () => documentIndexingApi.listDocuments(searchIndexId, { page, pageSize }),
        enabled: (options?.enabled ?? true) && !!searchIndexId,
        placeholderData: (previous) => previous,
    });
}

/**
 * Hook to fetch a single indexed document by its id.
 *
 * Pass a null/empty documentId to keep the query idle until the user submits a
 * lookup.
 */
export function useDocument(
    searchIndexId: string,
    documentId: string | null,
    options?: { enabled?: boolean }
) {
    return useQuery({
        queryKey: documentIndexingKeys.document(searchIndexId, documentId || ''),
        queryFn: () => documentIndexingApi.getDocument(searchIndexId, documentId!),
        enabled: (options?.enabled ?? true) && !!documentId,
        // A "not found" answer should not be retried — it is a valid result
        retry: false,
    });
}

/**
 * Hook to list indexing batches
 */
export function useIndexingBatches(
    searchIndexId: string,
    options?: { limit?: number; enabled?: boolean }
) {
    return useQuery({
        queryKey: documentIndexingKeys.batches(searchIndexId),
        queryFn: () => documentIndexingApi.listBatches(searchIndexId, options?.limit),
        enabled: options?.enabled ?? true,
        staleTime: 0, // Always fetch fresh data for batches list
        select: (data) => data.batches,
    });
}

/**
 * Hook to get batch status with polling support
 */
export function useBatchStatus(
    searchIndexId: string,
    batchId: string | null,
    options?: {
        enabled?: boolean;
        /** Poll interval in ms (0 to disable) */
        pollInterval?: number;
    }
) {
    const isProcessing = (data: IndexingStatusResponse | undefined) =>
        data?.status === 'pending' || data?.status === 'processing';

    return useQuery({
        queryKey: documentIndexingKeys.batch(searchIndexId, batchId || ''),
        queryFn: () => documentIndexingApi.getBatchStatus(searchIndexId, batchId!),
        enabled: (options?.enabled ?? true) && !!batchId,
        staleTime: 0, // Always fetch fresh batch status
        // Poll while processing
        refetchInterval: (query) => {
            if (options?.pollInterval === 0) return false;
            if (isProcessing(query.state.data)) {
                return options?.pollInterval ?? 1000;
            }
            return false;
        },
    });
}
