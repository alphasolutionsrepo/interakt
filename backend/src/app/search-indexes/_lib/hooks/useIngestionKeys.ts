// app/search-indexes/_lib/hooks/useIngestionKeys.ts

/**
 * Ingestion Key Hooks
 *
 * React Query hooks for managing an index's server-to-server write credentials.
 */

'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
    ingestionKeysApi,
    ApiError,
    type CreateIngestionKeyInput,
} from '../api-client';
import { searchIndexKeys } from './useSearchIndexes';

// ============================================================================
// QUERY KEYS
// ============================================================================

export const ingestionKeyKeys = {
    all: (indexId: string) => [...searchIndexKeys.detail(indexId), 'ingestion-keys'] as const,
    list: (indexId: string) => [...ingestionKeyKeys.all(indexId), 'list'] as const,
};

// ============================================================================
// QUERIES
// ============================================================================

export function useIngestionKeys(searchIndexId: string, options?: { enabled?: boolean }) {
    return useQuery({
        queryKey: ingestionKeyKeys.list(searchIndexId),
        queryFn: () => ingestionKeysApi.list(searchIndexId),
        enabled: (options?.enabled ?? true) && !!searchIndexId,
        select: (data) => data.keys,
    });
}

// ============================================================================
// MUTATIONS
// ============================================================================

/**
 * Create a key.
 *
 * The caller is responsible for showing `plaintextKey` to the user — it is the
 * only time it exists, so no toast or log should contain it.
 */
export function useCreateIngestionKey(searchIndexId: string) {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (data: CreateIngestionKeyInput) =>
            ingestionKeysApi.create(searchIndexId, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ingestionKeyKeys.list(searchIndexId) });
        },
        onError: (error: ApiError) => {
            toast.error(error.message || 'Failed to create ingestion key');
        },
    });
}

export function useRevokeIngestionKey(searchIndexId: string) {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (keyId: string) => ingestionKeysApi.revoke(searchIndexId, keyId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ingestionKeyKeys.list(searchIndexId) });
            toast.success('Ingestion key revoked');
        },
        onError: (error: ApiError) => {
            toast.error(error.message || 'Failed to revoke ingestion key');
        },
    });
}
