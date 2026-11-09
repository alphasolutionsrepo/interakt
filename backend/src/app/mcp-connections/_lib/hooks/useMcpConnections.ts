'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { toast } from 'sonner';
import { reportActionError } from '@/shared/activity/report';
import { mcpConnectionsApi } from '../api-client';
import type {
  CreateMcpConnectionPayload,
  UpdateMcpConnectionPayload,
  ListMcpConnectionsParams,
} from '../api-client';

// ============================================================================
// QUERY KEYS
// ============================================================================

export const mcpKeys = {
  all: ['mcp-connections'] as const,
  lists: () => [...mcpKeys.all, 'list'] as const,
  list: (params?: Record<string, unknown>) => [...mcpKeys.lists(), params] as const,
  details: () => [...mcpKeys.all, 'detail'] as const,
  detail: (id: string) => [...mcpKeys.details(), id] as const,
  attachments: (experienceId: string) => ['mcp-attachments', experienceId] as const,
};

// ============================================================================
// DEBOUNCE
// ============================================================================

export function useDebounce<T>(value: T, delay = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debouncedValue;
}

// ============================================================================
// LIST
// ============================================================================

export function useMcpConnections(params?: ListMcpConnectionsParams) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: mcpKeys.list(params as Record<string, unknown>),
    queryFn: () => mcpConnectionsApi.list(params),
    // Keep the current list on screen while a new filter loads, so the page
    // doesn't swap to its skeleton and unmount the search box.
    placeholderData: keepPreviousData,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => mcpConnectionsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mcpKeys.lists() });
      toast.success('MCP connection deleted');
    },
    meta: { label: 'Delete connection' },
  });

  return {
    connections: query.data?.connections ?? [],
    pagination: query.data?.pagination,
    isLoading: query.isLoading,
    isError: query.isError,
    isRefetching: query.isRefetching,
    refetch: query.refetch,
    deleteConnection: deleteMutation.mutateAsync,
    isDeleting: deleteMutation.isPending,
  };
}

// ============================================================================
// SINGLE
// ============================================================================

export function useMcpConnection(id: string | undefined) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: mcpKeys.detail(id!),
    queryFn: () => mcpConnectionsApi.getById(id!),
    enabled: !!id,
  });

  const updateMutation = useMutation({
    mutationFn: (data: UpdateMcpConnectionPayload) => mcpConnectionsApi.update(id!, data),
    onSuccess: (updated) => {
      queryClient.setQueryData(mcpKeys.detail(id!), updated);
      queryClient.invalidateQueries({ queryKey: mcpKeys.lists() });
      toast.success('Connection updated');
    },
    meta: { label: 'Update connection' },
  });

  const syncMutation = useMutation({
    mutationFn: () => mcpConnectionsApi.sync(id!),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: mcpKeys.detail(id!) });
      queryClient.invalidateQueries({ queryKey: mcpKeys.lists() });
      if (result.status === 'healthy') {
        toast.success(`Discovered ${result.toolCount} tool${result.toolCount === 1 ? '' : 's'}`);
      } else {
        reportActionError('Sync', result.message);
      }
    },
    meta: { label: 'Sync' },
  });

  const testMutation = useMutation({
    mutationFn: () => mcpConnectionsApi.test(id!),
    onSuccess: (result) => {
      if (result.status === 'healthy') {
        toast.success(`Test passed — ${result.toolCount} tool${result.toolCount === 1 ? '' : 's'} reachable`);
      } else {
        reportActionError('Test connection', result.message);
      }
    },
    meta: { label: 'Test connection' },
  });

  return {
    connection: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
    updateConnection: updateMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
    syncConnection: syncMutation.mutateAsync,
    isSyncing: syncMutation.isPending,
    testConnection: testMutation.mutateAsync,
    isTesting: testMutation.isPending,
  };
}

// ============================================================================
// CREATE
// ============================================================================

export function useCreateMcpConnection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateMcpConnectionPayload) => mcpConnectionsApi.create(data),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: mcpKeys.lists() });
      toast.success(`MCP connection "${created.name}" created`);
    },
    meta: { label: 'Create connection' },
  });
}

// ============================================================================
// EXPERIENCE ATTACHMENTS
// ============================================================================

export function useExperienceMcpAttachments(experienceId: string | undefined) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: mcpKeys.attachments(experienceId ?? ''),
    queryFn: () => mcpConnectionsApi.listAttachments(experienceId!),
    enabled: !!experienceId,
  });

  const attachMutation = useMutation({
    mutationFn: (payload: { mcpConnectionId: string; enabledToolNames?: string[] | null }) =>
      mcpConnectionsApi.attach(experienceId!, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mcpKeys.attachments(experienceId!) });
      toast.success('Connection attached');
    },
    meta: { label: 'Attach connection' },
  });

  const updateAttachmentMutation = useMutation({
    mutationFn: ({
      connectionId,
      payload,
    }: {
      connectionId: string;
      payload: { enabledToolNames?: string[] | null; isEnabled?: boolean };
    }) => mcpConnectionsApi.updateAttachment(experienceId!, connectionId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mcpKeys.attachments(experienceId!) });
      toast.success('Attachment updated');
    },
    meta: { label: 'Update attachment' },
  });

  const detachMutation = useMutation({
    mutationFn: (connectionId: string) => mcpConnectionsApi.detach(experienceId!, connectionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mcpKeys.attachments(experienceId!) });
      toast.success('Connection detached');
    },
    meta: { label: 'Detach connection' },
  });

  return {
    attachments: query.data ?? [],
    isLoading: query.isLoading,
    refetch: query.refetch,
    attachConnection: attachMutation.mutateAsync,
    isAttaching: attachMutation.isPending,
    updateAttachment: updateAttachmentMutation.mutateAsync,
    isUpdatingAttachment: updateAttachmentMutation.isPending,
    detachConnection: detachMutation.mutateAsync,
    isDetaching: detachMutation.isPending,
  };
}
