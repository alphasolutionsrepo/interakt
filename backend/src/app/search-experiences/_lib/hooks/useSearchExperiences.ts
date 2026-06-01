// app/search-experiences/_lib/hooks/useSearchExperiences.ts

/**
 * Search Experience Hooks
 *
 * React Query hooks for managing search experiences with:
 * - Automatic caching
 * - Automatic refetching
 * - Error handling with toast notifications
 * - Loading states
 */

'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { searchExperiencesApi, searchExperienceIndexesApi, ApiError } from '../api-client';
import type {
  CreateSearchExperienceDTO,
  UpdateSearchExperienceDTO,
  AddIndexDTO,
  UpdateIndexDTO,
} from '@/features/search-experience/search-experience.client';

// ============================================================================
// Query Keys
// ============================================================================

export const searchExperienceKeys = {
  all: ['search-experiences'] as const,
  lists: () => [...searchExperienceKeys.all, 'list'] as const,
  list: (params?: Record<string, unknown>) => [...searchExperienceKeys.lists(), params] as const,
  details: () => [...searchExperienceKeys.all, 'detail'] as const,
  detail: (id: string) => [...searchExperienceKeys.details(), id] as const,
  slugCheck: (slug: string, excludeId?: string) => [...searchExperienceKeys.all, 'slug-check', slug, excludeId] as const,
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
// List Hook
// ============================================================================

interface UseSearchExperiencesParams {
  page?: number;
  pageSize?: number;
  search?: string;
  isActive?: boolean;
  sortBy?: 'name' | 'createdAt' | 'updatedAt';
  sortOrder?: 'asc' | 'desc';
}

/**
 * Hook to list search experiences with pagination and filtering
 */
export function useSearchExperiences(params?: UseSearchExperiencesParams) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: searchExperienceKeys.list(params as Record<string, unknown>),
    queryFn: () => searchExperiencesApi.list(params),
  });

  const createMutation = useMutation({
    mutationFn: (data: CreateSearchExperienceDTO) => searchExperiencesApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: searchExperienceKeys.lists() });
      toast.success('Search experience created successfully');
    },
    onError: (error: ApiError) => {
      toast.error(error.message || 'Failed to create search experience');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => searchExperiencesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: searchExperienceKeys.lists() });
      toast.success('Search experience deleted successfully');
    },
    onError: (error: ApiError) => {
      toast.error(error.message || 'Failed to delete search experience');
    },
  });

  return {
    // Data
    experiences: query.data?.items || [],
    pagination: query.data?.pagination,

    // States
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    isRefetching: query.isRefetching,

    // Actions
    createExperience: createMutation.mutateAsync,
    deleteExperience: deleteMutation.mutateAsync,

    // Action states
    isCreating: createMutation.isPending,
    isDeleting: deleteMutation.isPending,

    // Refetch
    refetch: query.refetch,
  };
}

// ============================================================================
// Single Item Hook
// ============================================================================

/**
 * Hook to get and manage a single search experience
 */
export function useSearchExperience(id: string | undefined) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: searchExperienceKeys.detail(id!),
    queryFn: () => searchExperiencesApi.getById(id!),
    enabled: !!id,
  });

  const updateMutation = useMutation({
    mutationFn: (data: UpdateSearchExperienceDTO) => searchExperiencesApi.update(id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: searchExperienceKeys.detail(id!) });
      queryClient.invalidateQueries({ queryKey: searchExperienceKeys.lists() });
      toast.success('Search experience updated successfully');
    },
    onError: (error: ApiError) => {
      toast.error(error.message || 'Failed to update search experience');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => searchExperiencesApi.delete(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: searchExperienceKeys.lists() });
      toast.success('Search experience deleted successfully');
    },
    onError: (error: ApiError) => {
      toast.error(error.message || 'Failed to delete search experience');
    },
  });

  const regenerateTokenMutation = useMutation({
    mutationFn: () => searchExperiencesApi.regenerateToken(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: searchExperienceKeys.detail(id!) });
      toast.success('Access token regenerated');
    },
    onError: (error: ApiError) => {
      toast.error(error.message || 'Failed to regenerate access token');
    },
  });

  // Index management mutations
  const addIndexMutation = useMutation({
    mutationFn: (data: AddIndexDTO) => searchExperienceIndexesApi.add(id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: searchExperienceKeys.detail(id!) });
      toast.success('Index added successfully');
    },
    onError: (error: ApiError) => {
      toast.error(error.message || 'Failed to add index');
    },
  });

  const updateIndexMutation = useMutation({
    mutationFn: ({ indexId, data }: { indexId: string; data: UpdateIndexDTO }) =>
      searchExperienceIndexesApi.update(id!, indexId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: searchExperienceKeys.detail(id!) });
      toast.success('Index updated successfully');
    },
    onError: (error: ApiError) => {
      toast.error(error.message || 'Failed to update index');
    },
  });

  const removeIndexMutation = useMutation({
    mutationFn: (indexId: string) => searchExperienceIndexesApi.remove(id!, indexId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: searchExperienceKeys.detail(id!) });
      toast.success('Index removed successfully');
    },
    onError: (error: ApiError) => {
      toast.error(error.message || 'Failed to remove index');
    },
  });

  return {
    // Data
    experience: query.data,

    // States
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,

    // Actions
    updateExperience: updateMutation.mutateAsync,
    deleteExperience: deleteMutation.mutateAsync,
    regenerateToken: regenerateTokenMutation.mutateAsync,
    addIndex: addIndexMutation.mutateAsync,
    updateIndex: updateIndexMutation.mutateAsync,
    removeIndex: removeIndexMutation.mutateAsync,

    // Action states
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
    isRegeneratingToken: regenerateTokenMutation.isPending,
    isAddingIndex: addIndexMutation.isPending,
    isUpdatingIndex: updateIndexMutation.isPending,
    isRemovingIndex: removeIndexMutation.isPending,

    // Refetch
    refetch: query.refetch,
  };
}

// ============================================================================
// Slug Availability Hook
// ============================================================================

interface UseSlugAvailabilityOptions {
  enabled?: boolean;
  debounceMs?: number;
}

/**
 * Hook to check slug availability with debouncing
 */
export function useSlugAvailability(
  slug: string,
  excludeId?: string,
  options: UseSlugAvailabilityOptions = {}
) {
  const { enabled = true, debounceMs = 300 } = options;
  const debouncedSlug = useDebounce(slug, debounceMs);

  const query = useQuery({
    queryKey: searchExperienceKeys.slugCheck(debouncedSlug, excludeId),
    queryFn: () => searchExperiencesApi.checkSlug(debouncedSlug, excludeId),
    enabled: enabled && debouncedSlug.length >= 3,
  });

  return {
    isAvailable: query.data?.available,
    isChecking: query.isLoading,
    isDebouncing: slug !== debouncedSlug,
  };
}
