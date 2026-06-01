'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { promptTemplatesApi, ApiError } from '../api-client';
import type { ListTemplatesParams, CreateVersionPayload, RollbackPayload } from '../api-client';

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
