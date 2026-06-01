'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { dataSourcesApi, ApiError } from '../api-client';
import type { CreateDataSourcePayload, UpdateDataSourcePayload, ListDataSourcesParams } from '../api-client';

// ============================================================================
// QUERY KEYS
// ============================================================================

export const dataSourceKeys = {
  all: ['data-sources'] as const,
  lists: () => [...dataSourceKeys.all, 'list'] as const,
  list: (params?: Record<string, unknown>) => [...dataSourceKeys.lists(), params] as const,
  details: () => [...dataSourceKeys.all, 'detail'] as const,
  detail: (id: string) => [...dataSourceKeys.details(), id] as const,
  slugCheck: (slug: string, excludeId?: string) => [...dataSourceKeys.all, 'slug-check', slug, excludeId] as const,
};

// ============================================================================
// DEBOUNCE
// ============================================================================

function useDebounce<T>(value: T, delay = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debouncedValue;
}

// ============================================================================
// LIST HOOK
// ============================================================================

export function useDataSources(params?: ListDataSourcesParams) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: dataSourceKeys.list(params as Record<string, unknown>),
    queryFn: () => dataSourcesApi.list(params),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => dataSourcesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dataSourceKeys.lists() });
      toast.success('Data source deleted successfully');
    },
    onError: (error: ApiError) => {
      toast.error(error.message || 'Failed to delete data source');
    },
  });

  return {
    dataSources: query.data?.dataSources ?? [],
    pagination: query.data?.pagination,
    isLoading: query.isLoading,
    isError: query.isError,
    isRefetching: query.isRefetching,
    refetch: query.refetch,
    deleteDataSource: deleteMutation.mutateAsync,
    isDeleting: deleteMutation.isPending,
  };
}

// ============================================================================
// SINGLE DATA SOURCE HOOK
// ============================================================================

export function useDataSource(id: string | undefined) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: dataSourceKeys.detail(id!),
    queryFn: () => dataSourcesApi.getById(id!),
    enabled: !!id,
  });

  const updateMutation = useMutation({
    mutationFn: (data: UpdateDataSourcePayload) => dataSourcesApi.update(id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dataSourceKeys.detail(id!) });
      queryClient.invalidateQueries({ queryKey: dataSourceKeys.lists() });
      toast.success('Data source updated successfully');
    },
    onError: (error: ApiError) => {
      toast.error(error.message || 'Failed to update data source');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => dataSourcesApi.delete(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dataSourceKeys.lists() });
      toast.success('Data source deleted successfully');
    },
    onError: (error: ApiError) => {
      toast.error(error.message || 'Failed to delete data source');
    },
  });

  return {
    dataSource: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
    updateDataSource: updateMutation.mutateAsync,
    deleteDataSource: deleteMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}

// ============================================================================
// CREATE HOOK
// ============================================================================

export function useCreateDataSource() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (data: CreateDataSourcePayload) => dataSourcesApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dataSourceKeys.lists() });
    },
    onError: (error: ApiError) => {
      toast.error(error.message || 'Failed to create data source');
    },
  });

  return {
    createDataSource: mutation.mutateAsync,
    isCreating: mutation.isPending,
    error: mutation.error,
  };
}

// ============================================================================
// SLUG CHECK HOOK
// ============================================================================

export function useDataSourceSlugAvailability(slug: string, excludeId?: string, enabled = true) {
  const debouncedSlug = useDebounce(slug, 300);

  const query = useQuery({
    queryKey: dataSourceKeys.slugCheck(debouncedSlug, excludeId),
    queryFn: () => dataSourcesApi.checkSlug(debouncedSlug, excludeId),
    enabled: enabled && debouncedSlug.length >= 3,
  });

  return {
    isAvailable: query.data?.available,
    isChecking: query.isLoading,
    isDebouncing: slug !== debouncedSlug,
  };
}
