'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { toolsApi, ApiError } from '../api-client';
import type { CreateToolPayload, UpdateToolPayload, ListToolsParams } from '../api-client';

// ============================================================================
// QUERY KEYS
// ============================================================================

export const toolKeys = {
  all: ['tools'] as const,
  lists: () => [...toolKeys.all, 'list'] as const,
  list: (params?: Record<string, unknown>) => [...toolKeys.lists(), params] as const,
  details: () => [...toolKeys.all, 'detail'] as const,
  detail: (id: string) => [...toolKeys.details(), id] as const,
  experiences: (id: string) => [...toolKeys.all, 'experiences', id] as const,
  allActive: () => [...toolKeys.all, 'all-active'] as const,
  slugCheck: (slug: string, excludeId?: string) => [...toolKeys.all, 'slug-check', slug, excludeId] as const,
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

export function useTools(params?: ListToolsParams) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: toolKeys.list(params as Record<string, unknown>),
    queryFn: () => toolsApi.list(params),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => toolsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: toolKeys.lists() });
      toast.success('Tool deleted successfully');
    },
    onError: (error: ApiError) => {
      toast.error(error.message || 'Failed to delete tool');
    },
  });

  return {
    tools: query.data?.tools ?? [],
    pagination: query.data?.pagination,
    isLoading: query.isLoading,
    isError: query.isError,
    isRefetching: query.isRefetching,
    refetch: query.refetch,
    deleteTool: deleteMutation.mutateAsync,
    isDeleting: deleteMutation.isPending,
  };
}

// ============================================================================
// SINGLE TOOL HOOK
// ============================================================================

export function useTool(id: string | undefined) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: toolKeys.detail(id!),
    queryFn: () => toolsApi.getById(id!),
    enabled: !!id,
  });

  const updateMutation = useMutation({
    mutationFn: (data: UpdateToolPayload) => toolsApi.update(id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: toolKeys.detail(id!) });
      queryClient.invalidateQueries({ queryKey: toolKeys.lists() });
      toast.success('Tool updated successfully');
    },
    onError: (error: ApiError) => {
      toast.error(error.message || 'Failed to update tool');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => toolsApi.delete(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: toolKeys.lists() });
      toast.success('Tool deleted successfully');
    },
    onError: (error: ApiError) => {
      toast.error(error.message || 'Failed to delete tool');
    },
  });

  const experiencesQuery = useQuery({
    queryKey: toolKeys.experiences(id!),
    queryFn: () => toolsApi.getExperiences(id!),
    enabled: !!id,
  });

  return {
    tool: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,

    updateTool: updateMutation.mutateAsync,
    deleteTool: deleteMutation.mutateAsync,

    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,

    experiences: experiencesQuery.data ?? [],
    isLoadingExperiences: experiencesQuery.isLoading,
  };
}

// ============================================================================
// CREATE HOOK
// ============================================================================

export function useCreateTool() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (data: CreateToolPayload) => toolsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: toolKeys.lists() });
      queryClient.invalidateQueries({ queryKey: toolKeys.allActive() });
    },
    onError: (error: ApiError) => {
      toast.error(error.message || 'Failed to create tool');
    },
  });

  return {
    createTool: mutation.mutateAsync,
    isCreating: mutation.isPending,
    error: mutation.error,
  };
}

// ============================================================================
// ALL ACTIVE TOOLS (for dropdowns)
// ============================================================================

export function useAllActiveTools() {
  return useQuery({
    queryKey: toolKeys.allActive(),
    queryFn: () => toolsApi.getAllActive(),
  });
}

// ============================================================================
// SLUG CHECK HOOK
// ============================================================================

export function useToolSlugAvailability(slug: string, excludeId?: string, enabled = true) {
  const debouncedSlug = useDebounce(slug, 300);

  const query = useQuery({
    queryKey: toolKeys.slugCheck(debouncedSlug, excludeId),
    queryFn: () => toolsApi.checkSlug(debouncedSlug, excludeId),
    enabled: enabled && debouncedSlug.length >= 3,
  });

  return {
    isAvailable: query.data?.available,
    isChecking: query.isLoading,
    isDebouncing: slug !== debouncedSlug,
  };
}
