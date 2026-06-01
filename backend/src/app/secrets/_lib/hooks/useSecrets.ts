'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { secretsApi, ApiError } from '../api-client';
import type { CreateSecretPayload, UpdateSecretPayload } from '../api-client';

export const secretKeys = {
  all: ['secrets'] as const,
  lists: () => [...secretKeys.all, 'list'] as const,
  list: (search?: string) => [...secretKeys.lists(), { search }] as const,
};

export function useSecrets(search?: string) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: secretKeys.list(search),
    queryFn: () => secretsApi.list(search),
  });

  const createMutation = useMutation({
    mutationFn: (data: CreateSecretPayload) => secretsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: secretKeys.lists() });
      toast.success('Secret created successfully');
    },
    onError: (error: ApiError) => {
      toast.error(error.message || 'Failed to create secret');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateSecretPayload }) =>
      secretsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: secretKeys.lists() });
      toast.success('Secret updated successfully');
    },
    onError: (error: ApiError) => {
      toast.error(error.message || 'Failed to update secret');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => secretsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: secretKeys.lists() });
      toast.success('Secret deleted successfully');
    },
    onError: (error: ApiError) => {
      toast.error(error.message || 'Failed to delete secret');
    },
  });

  return {
    secrets: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    isRefetching: query.isRefetching,
    refetch: query.refetch,

    createSecret: createMutation.mutateAsync,
    updateSecret: updateMutation.mutateAsync,
    deleteSecret: deleteMutation.mutateAsync,

    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}
