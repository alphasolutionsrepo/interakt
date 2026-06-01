// app/search-indexes/_lib/hooks/useDocumentIndexing.ts

/**
 * Document Indexing Hooks
 * React Query hooks for document upload and indexing operations
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    documentIndexingApi,
    type IndexingStatusResponse,
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
// QUERIES
// ============================================================================

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
