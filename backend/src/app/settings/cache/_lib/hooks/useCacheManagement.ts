// app/settings/cache/_lib/hooks/useCacheManagement.ts

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { cacheApi } from '../api-client';

// ============================================================================
// Query Keys
// ============================================================================

export const cacheKeys = {
  all: ['cache'] as const,
  stats: () => [...cacheKeys.all, 'stats'] as const,
  featureStats: (featureId: string) => [...cacheKeys.stats(), featureId] as const,
};

// ============================================================================
// Hooks
// ============================================================================

/**
 * Hook to fetch all cache statistics
 */
export function useAllCacheStats() {
  return useQuery({
    queryKey: cacheKeys.stats(),
    queryFn: () => cacheApi.getAllCacheStats(),
    staleTime: 30_000, // 30 seconds
    refetchInterval: 60_000, // Auto-refresh every minute
  });
}

/**
 * Hook to fetch cache statistics for a specific feature
 */
export function useCacheStats(featureId: string) {
  return useQuery({
    queryKey: cacheKeys.featureStats(featureId),
    queryFn: () => cacheApi.getCacheStats(featureId),
    staleTime: 30_000,
  });
}

/**
 * Hook to clear a specific feature's cache
 */
export function useClearCache() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (featureId: string) => cacheApi.clearCache(featureId),
    onSuccess: (_, featureId) => {
      const feature = cacheApi.CACHE_FEATURES.find(f => f.id === featureId);
      toast.success(`${feature?.name || 'Cache'} cleared successfully`);
      // Invalidate cache stats to trigger refetch
      queryClient.invalidateQueries({ queryKey: cacheKeys.stats() });
    },
    onError: (error: Error, featureId) => {
      const feature = cacheApi.CACHE_FEATURES.find(f => f.id === featureId);
      toast.error(`Failed to clear ${feature?.name || 'cache'}: ${error.message}`);
    },
  });
}

/**
 * Hook to clear all caches
 */
export function useClearAllCaches() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => cacheApi.clearAllCaches(),
    onSuccess: () => {
      toast.success('All caches cleared successfully');
      queryClient.invalidateQueries({ queryKey: cacheKeys.stats() });
    },
    onError: (error: Error) => {
      toast.error(`Failed to clear caches: ${error.message}`);
    },
  });
}

/**
 * Combined hook for cache management
 */
export function useCacheManagement() {
  const statsQuery = useAllCacheStats();
  const clearCache = useClearCache();
  const clearAllCaches = useClearAllCaches();

  // Calculate aggregate stats
  const aggregateStats = statsQuery.data
    ? Object.values(statsQuery.data).reduce(
        (acc, stats) => ({
          totalEntries: acc.totalEntries + stats.size,
          totalMaxSize: acc.totalMaxSize + stats.maxSize,
          totalPending: acc.totalPending + stats.pending,
        }),
        { totalEntries: 0, totalMaxSize: 0, totalPending: 0 }
      )
    : null;

  return {
    // Stats
    stats: statsQuery.data,
    aggregateStats,
    isLoading: statsQuery.isLoading,
    isError: statsQuery.isError,
    error: statsQuery.error,
    refetch: statsQuery.refetch,

    // Actions
    clearCache: clearCache.mutate,
    clearAllCaches: clearAllCaches.mutate,
    isClearingCache: clearCache.isPending,
    isClearingAllCaches: clearAllCaches.isPending,
    clearingFeatureId: clearCache.variables,
  };
}
