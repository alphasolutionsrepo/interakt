// app/search-indexes/_lib/hooks/useSearchIndexes.ts

/**
 * Search Index Hooks
 * 
 * React Query hooks for managing search indexes with:
 * - Automatic caching
 * - Automatic refetching
 * - Optimistic updates
 * - Error handling with toast notifications
 * - Loading states
 * 
 * UPDATED: Removed old field mapping hooks - use useSearchIndexFields.ts instead
 */

'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { searchIndexesApi, ApiError } from '../api-client';
import type {
    CreateSearchIndexDTO,
    UpdateSearchIndexDTO,
    SearchType,
    IndexStatus,
} from '@/features/search-index';

// ============================================================================
// Query Keys
// ============================================================================

export const searchIndexKeys = {
    all: ['search-indexes'] as const,
    lists: () => [...searchIndexKeys.all, 'list'] as const,
    list: (params?: Record<string, unknown>) => [...searchIndexKeys.lists(), params] as const,
    allActive: () => [...searchIndexKeys.all, 'all-active'] as const,
    details: () => [...searchIndexKeys.all, 'detail'] as const,
    detail: (id: string) => [...searchIndexKeys.details(), id] as const,
    detailByName: (name: string) => [...searchIndexKeys.details(), 'name', name] as const,
    stats: (id: string) => [...searchIndexKeys.detail(id), 'stats'] as const,
    syncStatus: (id: string) => [...searchIndexKeys.detail(id), 'sync-status'] as const,
    nameCheck: (name: string, excludeId?: string) => [...searchIndexKeys.all, 'name-check', name, excludeId] as const,
    cache: () => [...searchIndexKeys.all, 'cache'] as const,
    cacheStats: () => [...searchIndexKeys.cache(), 'stats'] as const,
};

// ============================================================================
// Debounce Hook (internal utility)
// ============================================================================

function useDebounce<T>(value: T, delay: number = 300): T {
    const [debouncedValue, setDebouncedValue] = useState<T>(value);

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedValue(value), delay);
        return () => clearTimeout(timer);
    }, [value, delay]);

    return debouncedValue;
}

// ============================================================================
// List Hooks
// ============================================================================

interface UseSearchIndexesParams {
    page?: number;
    pageSize?: number;
    search?: string;
    searchType?: SearchType;
    status?: IndexStatus;
    isActive?: boolean;
    sortBy?: 'name' | 'displayName' | 'createdAt' | 'updatedAt' | 'documentCount';
    sortOrder?: 'asc' | 'desc';
}

/**
 * Hook to list search indexes with pagination and filtering
 */
export function useSearchIndexes(params?: UseSearchIndexesParams) {
    const queryClient = useQueryClient();

    const query = useQuery({
        queryKey: searchIndexKeys.list(params as Record<string, unknown>),
        queryFn: () => searchIndexesApi.list(params),
    });

    const createMutation = useMutation({
        mutationFn: (data: CreateSearchIndexDTO) => searchIndexesApi.create(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: searchIndexKeys.lists() });
            queryClient.invalidateQueries({ queryKey: searchIndexKeys.allActive() });
            toast.success('Search index created successfully');
        },
        onError: (error: ApiError) => {
            toast.error(error.message || 'Failed to create search index');
        },
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, data }: { id: string; data: UpdateSearchIndexDTO }) =>
            searchIndexesApi.update(id, data),
        onSuccess: (updated) => {
            queryClient.invalidateQueries({ queryKey: searchIndexKeys.lists() });
            queryClient.invalidateQueries({ queryKey: searchIndexKeys.detail(updated.id) });
            toast.success('Search index updated successfully');
        },
        onError: (error: ApiError) => {
            toast.error(error.message || 'Failed to update search index');
        },
    });

    const deleteMutation = useMutation({
        mutationFn: (id: string) => searchIndexesApi.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: searchIndexKeys.lists() });
            queryClient.invalidateQueries({ queryKey: searchIndexKeys.allActive() });
            toast.success('Search index deleted successfully');
        },
        onError: (error: ApiError) => {
            toast.error(error.message || 'Failed to delete search index');
        },
    });

    return {
        // Data
        indexes: query.data?.items || [],
        pagination: query.data?.pagination,

        // States
        isLoading: query.isLoading,
        isError: query.isError,
        error: query.error,
        isRefetching: query.isRefetching,

        // Actions
        createIndex: createMutation.mutateAsync,
        updateIndex: updateMutation.mutateAsync,
        deleteIndex: deleteMutation.mutateAsync,

        // Action states
        isCreating: createMutation.isPending,
        isUpdating: updateMutation.isPending,
        isDeleting: deleteMutation.isPending,

        // Refetch
        refetch: query.refetch,
    };
}

/**
 * Hook to get all active search indexes (for dropdowns)
 */
export function useAllActiveSearchIndexes(options?: { enabled?: boolean }) {
    return useQuery({
        queryKey: searchIndexKeys.allActive(),
        queryFn: () => searchIndexesApi.getAllActive(),
        enabled: options?.enabled !== false,
        staleTime: 5 * 60 * 1000, // Consider data fresh for 5 minutes
    });
}

// ============================================================================
// Single Search Index Hooks
// ============================================================================

/**
 * Hook to get a single search index by ID
 */
export function useSearchIndex(id: string, options?: { enabled?: boolean }) {
    const queryClient = useQueryClient();

    const query = useQuery({
        queryKey: searchIndexKeys.detail(id),
        queryFn: () => searchIndexesApi.getById(id),
        enabled: options?.enabled !== false && !!id,
        staleTime: 0, // Always fetch fresh data for detail views
    });

    const updateMutation = useMutation({
        mutationFn: (data: UpdateSearchIndexDTO) => searchIndexesApi.update(id, data),
        onSuccess: (updated) => {
            queryClient.setQueryData(searchIndexKeys.detail(id), updated);
            queryClient.invalidateQueries({ queryKey: searchIndexKeys.lists() });
            toast.success('Search index updated successfully');
        },
        onError: (error: ApiError) => {
            toast.error(error.message || 'Failed to update search index');
        },
    });

    const deleteMutation = useMutation({
        mutationFn: () => searchIndexesApi.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: searchIndexKeys.lists() });
            queryClient.invalidateQueries({ queryKey: searchIndexKeys.allActive() });
            toast.success('Search index deleted successfully');
        },
        onError: (error: ApiError) => {
            toast.error(error.message || 'Failed to delete search index');
        },
    });

    const activateMutation = useMutation({
        mutationFn: () => searchIndexesApi.activate(id),
        onSuccess: (updated) => {
            queryClient.setQueryData(searchIndexKeys.detail(id), updated);
            queryClient.invalidateQueries({ queryKey: searchIndexKeys.lists() });
            toast.success('Search index activated');
        },
        onError: (error: ApiError) => {
            toast.error(error.message || 'Failed to activate search index');
        },
    });

    const deactivateMutation = useMutation({
        mutationFn: () => searchIndexesApi.deactivate(id),
        onSuccess: (updated) => {
            queryClient.setQueryData(searchIndexKeys.detail(id), updated);
            queryClient.invalidateQueries({ queryKey: searchIndexKeys.lists() });
            toast.success('Search index deactivated');
        },
        onError: (error: ApiError) => {
            toast.error(error.message || 'Failed to deactivate search index');
        },
    });

    const reindexMutation = useMutation({
        mutationFn: () => searchIndexesApi.triggerReindex(id),
        onSuccess: (result) => {
            queryClient.invalidateQueries({ queryKey: searchIndexKeys.detail(id) });
            queryClient.invalidateQueries({ queryKey: searchIndexKeys.lists() });
            const duration = result.durationMs ? `${(result.durationMs / 1000).toFixed(1)}s` : '';
            toast.success('Reindex completed successfully', {
                description: `${result.documentCount} documents reindexed${duration ? ` in ${duration}` : ''}`,
            });
        },
        onError: (error: ApiError) => {
            toast.error(error.message || 'Failed to reindex');
        },
    });

    const recreateIndexMutation = useMutation({
        mutationFn: () => searchIndexesApi.recreateEmptyIndex(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: searchIndexKeys.detail(id) });
            queryClient.invalidateQueries({ queryKey: searchIndexKeys.lists() });
            toast.success('Index recreated successfully', {
                description: 'The empty index structure has been created. You can now upload documents.',
            });
        },
        onError: (error: ApiError) => {
            toast.error(error.message || 'Failed to recreate index');
        },
    });

    return {
        // Data
        searchIndex: query.data,

        // States
        isLoading: query.isLoading,
        isError: query.isError,
        error: query.error,

        // Actions
        updateIndex: updateMutation.mutateAsync,
        deleteIndex: deleteMutation.mutateAsync,
        activateIndex: activateMutation.mutateAsync,
        deactivateIndex: deactivateMutation.mutateAsync,
        triggerReindex: reindexMutation.mutateAsync,
        recreateEmptyIndex: recreateIndexMutation.mutateAsync,

        // Action states
        isUpdating: updateMutation.isPending,
        isDeleting: deleteMutation.isPending,
        isActivating: activateMutation.isPending,
        isDeactivating: deactivateMutation.isPending,
        isReindexing: reindexMutation.isPending,
        isRecreatingIndex: recreateIndexMutation.isPending,

        // Refetch
        refetch: query.refetch,
    };
}

/**
 * Hook to get a search index by name
 */
export function useSearchIndexByName(name: string, options?: { enabled?: boolean }) {
    return useQuery({
        queryKey: searchIndexKeys.detailByName(name),
        queryFn: () => searchIndexesApi.getByName(name),
        enabled: options?.enabled !== false && !!name,
    });
}

// ============================================================================
// Stats & Status Hooks
// ============================================================================

/**
 * Hook to get index statistics
 */
export function useIndexStats(id: string, options?: { enabled?: boolean }) {
    return useQuery({
        queryKey: searchIndexKeys.stats(id),
        queryFn: () => searchIndexesApi.getStats(id),
        enabled: options?.enabled !== false && !!id,
        staleTime: 0, // Always fetch fresh stats
    });
}

/**
 * Hook to get sync status
 */
export function useSyncStatus(id: string, options?: { enabled?: boolean }) {
    return useQuery({
        queryKey: searchIndexKeys.syncStatus(id),
        queryFn: () => searchIndexesApi.getSyncStatus(id),
        enabled: options?.enabled !== false && !!id,
    });
}

// ============================================================================
// Name Availability Hook
// ============================================================================

/**
 * Hook to check if index name is available (with debounce)
 */
export function useNameAvailability(
    name: string,
    excludeId?: string,
    options?: { debounceMs?: number; enabled?: boolean }
) {
    const { debounceMs = 300, enabled = true } = options || {};
    const debouncedName = useDebounce(name, debounceMs);

    const shouldCheck = enabled && debouncedName.trim().length > 0;

    const query = useQuery({
        queryKey: searchIndexKeys.nameCheck(debouncedName, excludeId),
        queryFn: () => searchIndexesApi.checkName(debouncedName, excludeId),
        enabled: shouldCheck,
        staleTime: 0, // Always check freshness
    });

    return {
        ...query,
        isAvailable: query.data?.available ?? null,
        isChecking: query.isFetching && shouldCheck,
        isDebouncing: name !== debouncedName,
    };
}

// ============================================================================
// Cache Hooks
// ============================================================================

/**
 * Hook to get cache stats
 */
export function useCacheStats() {
    return useQuery({
        queryKey: searchIndexKeys.cacheStats(),
        queryFn: () => searchIndexesApi.getCacheStats(),
    });
}

/**
 * Hook to clear cache
 */
export function useClearCache() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: () => searchIndexesApi.clearCache(),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: searchIndexKeys.all });
            toast.success('Cache cleared successfully');
        },
        onError: (error: ApiError) => {
            toast.error(error.message || 'Failed to clear cache');
        },
    });
}

// ============================================================================
// DEPRECATED: Field Mapping Hooks
// Use useSearchIndexFields.ts instead
// ============================================================================

/**
 * @deprecated Use useSearchIndexFields from useSearchIndexFields.ts instead
 */
export function useFieldMappings(searchIndexId: string, options?: { enabled?: boolean }) {
    // Import dynamically to avoid circular dependencies
    const { searchIndexFieldsApi } = require('../api-client');
    
    return useQuery({
        queryKey: [...searchIndexKeys.detail(searchIndexId), 'fields', 'list'],
        queryFn: () => searchIndexFieldsApi.list(searchIndexId),
        enabled: options?.enabled !== false && !!searchIndexId,
    });
}