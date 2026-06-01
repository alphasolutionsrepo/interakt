'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { aiExperiencesApi, ApiError } from '../api-client';
import type {
  CreateAIExperiencePayload,
  UpdateAIExperiencePayload,
  AssignToolPayload,
  UpdateToolAssignmentPayload,
  ListAIExperiencesParams,
} from '../api-client';

export const aiExperienceKeys = {
  all: ['ai-experiences'] as const,
  lists: () => [...aiExperienceKeys.all, 'list'] as const,
  list: (params?: Record<string, unknown>) => [...aiExperienceKeys.lists(), params] as const,
  details: () => [...aiExperienceKeys.all, 'detail'] as const,
  detail: (id: string) => [...aiExperienceKeys.details(), id] as const,
  slugCheck: (slug: string, excludeId?: string) => [...aiExperienceKeys.all, 'slug-check', slug, excludeId] as const,
};

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

export function useAIExperiences(params?: ListAIExperiencesParams) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: aiExperienceKeys.list(params as Record<string, unknown>),
    queryFn: () => aiExperiencesApi.list(params),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => aiExperiencesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: aiExperienceKeys.lists() });
      toast.success('AI Experience deleted');
    },
    onError: (error: ApiError) => {
      toast.error(error.message || 'Failed to delete experience');
    },
  });

  return {
    experiences: query.data?.experiences ?? [],
    pagination: query.data?.pagination,
    isLoading: query.isLoading,
    isError: query.isError,
    isRefetching: query.isRefetching,
    refetch: query.refetch,
    deleteExperience: deleteMutation.mutateAsync,
    isDeleting: deleteMutation.isPending,
  };
}

// ============================================================================
// SINGLE EXPERIENCE HOOK
// ============================================================================

export function useAIExperience(id: string | undefined) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: aiExperienceKeys.detail(id!),
    queryFn: () => aiExperiencesApi.getById(id!),
    enabled: !!id,
  });

  const updateMutation = useMutation({
    mutationFn: (data: UpdateAIExperiencePayload) => aiExperiencesApi.update(id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: aiExperienceKeys.detail(id!) });
      queryClient.invalidateQueries({ queryKey: aiExperienceKeys.lists() });
      toast.success('Experience updated');
    },
    onError: (error: ApiError) => {
      toast.error(error.message || 'Failed to update experience');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => aiExperiencesApi.delete(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: aiExperienceKeys.lists() });
      toast.success('Experience deleted');
    },
    onError: (error: ApiError) => {
      toast.error(error.message || 'Failed to delete experience');
    },
  });

  const regenerateTokenMutation = useMutation({
    mutationFn: () => aiExperiencesApi.regenerateToken(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: aiExperienceKeys.detail(id!) });
      toast.success('Access token regenerated');
    },
    onError: (error: ApiError) => {
      toast.error(error.message || 'Failed to regenerate token');
    },
  });

  const assignToolMutation = useMutation({
    mutationFn: (data: AssignToolPayload) => aiExperiencesApi.assignTool(id!, data),
    onSuccess: async () => {
      await queryClient.refetchQueries({ queryKey: aiExperienceKeys.detail(id!), exact: true });
      toast.success('Tool assigned');
    },
    onError: (error: ApiError) => {
      toast.error(error.message || 'Failed to assign tool');
    },
  });

  const updateToolAssignmentMutation = useMutation({
    mutationFn: ({ toolId, data }: { toolId: string; data: UpdateToolAssignmentPayload }) =>
      aiExperiencesApi.updateToolAssignment(id!, toolId, data),
    onSuccess: async () => {
      await queryClient.refetchQueries({ queryKey: aiExperienceKeys.detail(id!), exact: true });
    },
    onError: (error: ApiError) => {
      toast.error(error.message || 'Failed to update tool assignment');
    },
  });

  const removeToolMutation = useMutation({
    mutationFn: (toolId: string) => aiExperiencesApi.removeTool(id!, toolId),
    onSuccess: async () => {
      await queryClient.refetchQueries({ queryKey: aiExperienceKeys.detail(id!), exact: true });
      toast.success('Tool removed');
    },
    onError: (error: ApiError) => {
      toast.error(error.message || 'Failed to remove tool');
    },
  });

  return {
    experience: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,

    updateExperience: updateMutation.mutateAsync,
    deleteExperience: deleteMutation.mutateAsync,
    regenerateToken: regenerateTokenMutation.mutateAsync,
    assignTool: assignToolMutation.mutateAsync,
    updateToolAssignment: updateToolAssignmentMutation.mutateAsync,
    removeTool: removeToolMutation.mutateAsync,

    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
    isRegeneratingToken: regenerateTokenMutation.isPending,
    isAssigningTool: assignToolMutation.isPending,
    isUpdatingAssignment: updateToolAssignmentMutation.isPending,
    isRemovingTool: removeToolMutation.isPending,
  };
}

// ============================================================================
// CREATE HOOK
// ============================================================================

export function useCreateAIExperience() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (data: CreateAIExperiencePayload) => aiExperiencesApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: aiExperienceKeys.lists() });
    },
    onError: (error: ApiError) => {
      toast.error(error.message || 'Failed to create experience');
    },
  });

  return {
    createExperience: mutation.mutateAsync,
    isCreating: mutation.isPending,
  };
}

// ============================================================================
// SLUG CHECK
// ============================================================================

export function useAIExperienceSlugAvailability(slug: string, excludeId?: string, enabled = true) {
  const debouncedSlug = useDebounce(slug, 300);

  const query = useQuery({
    queryKey: aiExperienceKeys.slugCheck(debouncedSlug, excludeId),
    queryFn: () => aiExperiencesApi.checkSlug(debouncedSlug, excludeId),
    enabled: enabled && debouncedSlug.length >= 3,
  });

  return {
    isAvailable: query.data?.available,
    isChecking: query.isLoading,
    isDebouncing: slug !== debouncedSlug,
  };
}
