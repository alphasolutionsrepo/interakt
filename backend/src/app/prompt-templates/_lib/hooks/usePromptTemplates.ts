'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { promptTemplatesApi, ApiError } from '../api-client';
import type {
  ListTemplatesParams,
  CreateVersionPayload,
  RollbackPayload,
  SetExperienceOverridePayload,
  PromptTemplateStep,
} from '../api-client';

// ============================================================================
// QUERY KEYS
// ============================================================================

export const promptTemplateKeys = {
  all: ['prompt-templates'] as const,
  lists: () => [...promptTemplateKeys.all, 'list'] as const,
  list: (params?: Record<string, unknown>) => [...promptTemplateKeys.lists(), params] as const,
  details: () => [...promptTemplateKeys.all, 'detail'] as const,
  detail: (id: string) => [...promptTemplateKeys.details(), id] as const,
  history: (id: string) => [...promptTemplateKeys.all, 'history', id] as const,
  defaults: () => [...promptTemplateKeys.all, 'defaults'] as const,
};

// ============================================================================
// LIST HOOK
// ============================================================================

export function usePromptTemplates(params?: ListTemplatesParams) {
  const query = useQuery({
    queryKey: promptTemplateKeys.list(params as Record<string, unknown>),
    queryFn: () => promptTemplatesApi.list(params),
  });

  return {
    templates: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    isRefetching: query.isRefetching,
    refetch: query.refetch,
  };
}

// ============================================================================
// SYSTEM DEFAULTS HOOK
// ============================================================================

export function useSystemDefaults() {
  const query = useQuery({
    queryKey: promptTemplateKeys.defaults(),
    queryFn: () => promptTemplatesApi.getDefaults(),
  });

  return {
    defaults: query.data ?? {},
    isLoading: query.isLoading,
    isError: query.isError,
  };
}

// ============================================================================
// SINGLE TEMPLATE HOOK
// ============================================================================

export function usePromptTemplate(id: string | undefined) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: promptTemplateKeys.detail(id!),
    queryFn: () => promptTemplatesApi.getById(id!),
    enabled: !!id,
  });

  const historyQuery = useQuery({
    queryKey: promptTemplateKeys.history(id!),
    queryFn: () => promptTemplatesApi.getHistory(id!),
    enabled: !!id,
  });

  const createVersionMutation = useMutation({
    mutationFn: (data: CreateVersionPayload) => promptTemplatesApi.createVersion(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: promptTemplateKeys.lists() });
      queryClient.invalidateQueries({ queryKey: promptTemplateKeys.detail(id!) });
      queryClient.invalidateQueries({ queryKey: promptTemplateKeys.history(id!) });
      queryClient.invalidateQueries({ queryKey: promptTemplateKeys.defaults() });
      toast.success('New version created');
    },
    onError: (error: ApiError) => {
      toast.error(error.message || 'Failed to create version');
    },
  });

  const rollbackMutation = useMutation({
    mutationFn: (data: RollbackPayload) => promptTemplatesApi.rollback(id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: promptTemplateKeys.lists() });
      queryClient.invalidateQueries({ queryKey: promptTemplateKeys.detail(id!) });
      queryClient.invalidateQueries({ queryKey: promptTemplateKeys.defaults() });
      toast.success('Rolled back to selected version');
    },
    onError: (error: ApiError) => {
      toast.error(error.message || 'Failed to rollback');
    },
  });

  return {
    template: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,

    history: historyQuery.data ?? [],
    isLoadingHistory: historyQuery.isLoading,

    createVersion: createVersionMutation.mutateAsync,
    isCreatingVersion: createVersionMutation.isPending,

    rollback: rollbackMutation.mutateAsync,
    isRollingBack: rollbackMutation.isPending,
  };
}

// ============================================================================
// PER-EXPERIENCE OVERRIDES HOOK
// ============================================================================

export const experienceOverrideKeys = {
  all: ['experience-prompt-overrides'] as const,
  forExperience: (experienceId: string) => [...experienceOverrideKeys.all, experienceId] as const,
};

/**
 * Read and change which template an experience uses for each pipeline step.
 *
 * The override API has existed since prompt templates shipped, with nothing in the UI
 * calling it — assigning an override meant a hand-written SQL statement, which is not
 * something an operator can be asked to do.
 *
 * Mutations invalidate the template caches as well as the overrides: the resolver caches
 * per (step, experienceId), so a stale list would keep showing the previous assignment
 * after a successful save.
 */
export function useExperienceOverrides(experienceId: string) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: experienceOverrideKeys.forExperience(experienceId),
    queryFn: () => promptTemplatesApi.getExperienceOverrides(experienceId),
    enabled: !!experienceId,
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: experienceOverrideKeys.forExperience(experienceId) });
    queryClient.invalidateQueries({ queryKey: promptTemplateKeys.lists() });
  }

  const setOverrideMutation = useMutation({
    mutationFn: (data: SetExperienceOverridePayload) =>
      promptTemplatesApi.setExperienceOverride(experienceId, data),
    onSuccess: () => {
      invalidate();
      toast.success('Prompt override assigned');
    },
    onError: (error: ApiError) => {
      toast.error(error.message || 'Failed to assign override');
    },
  });

  const removeOverrideMutation = useMutation({
    mutationFn: (step: PromptTemplateStep) =>
      promptTemplatesApi.removeExperienceOverride(experienceId, step),
    onSuccess: () => {
      invalidate();
      toast.success('Reverted to the system default');
    },
    onError: (error: ApiError) => {
      toast.error(error.message || 'Failed to remove override');
    },
  });

  return {
    overrides: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,

    setOverride: setOverrideMutation.mutateAsync,
    isSettingOverride: setOverrideMutation.isPending,

    removeOverride: removeOverrideMutation.mutateAsync,
    isRemovingOverride: removeOverrideMutation.isPending,
  };
}
