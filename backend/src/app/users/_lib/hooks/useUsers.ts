// app/users/_lib/hooks/useUsers.ts

/**
 * User Management Hooks
 *
 * React Query hooks for managing users with:
 * - Automatic caching
 * - Optimistic updates
 * - Error handling with toast notifications
 * - Loading states
 */

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { usersApi, ApiError } from '../api-client';
import type {
  CreateUserDTO,
  UpdateUserDTO,
  ChangePasswordDTO,
} from '@/features/auth/auth.validations';

// ============================================================================
// Query Keys
// ============================================================================

export const userKeys = {
  all: ['users'] as const,
  lists: () => [...userKeys.all, 'list'] as const,
  list: () => [...userKeys.lists()] as const,
  details: () => [...userKeys.all, 'detail'] as const,
  detail: (id: string) => [...userKeys.details(), id] as const,
};

// ============================================================================
// User Hooks
// ============================================================================

/**
 * Hook to fetch all users
 */
export function useUsers(options?: { enabled?: boolean }) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: userKeys.list(),
    queryFn: () => usersApi.list(),
    enabled: options?.enabled !== false,
    staleTime: 30000, // 30 seconds
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (data: CreateUserDTO) => usersApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userKeys.all });
      toast.success('User created successfully');
    },
    onError: (error: ApiError) => {
      toast.error(error.message || 'Failed to create user');
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateUserDTO }) =>
      usersApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userKeys.all });
      toast.success('User updated successfully');
    },
    onError: (error: ApiError) => {
      toast.error(error.message || 'Failed to update user');
    },
  });

  // Activate mutation
  const activateMutation = useMutation({
    mutationFn: (id: string) => usersApi.activate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userKeys.all });
      toast.success('User activated successfully');
    },
    onError: (error: ApiError) => {
      toast.error(error.message || 'Failed to activate user');
    },
  });

  // Deactivate mutation
  const deactivateMutation = useMutation({
    mutationFn: (id: string) => usersApi.deactivate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userKeys.all });
      toast.success('User deactivated successfully');
    },
    onError: (error: ApiError) => {
      toast.error(error.message || 'Failed to deactivate user');
    },
  });

  // Change password mutation
  const changePasswordMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: ChangePasswordDTO }) =>
      usersApi.changePassword(id, data),
    onSuccess: () => {
      toast.success('Password changed successfully');
    },
    onError: (error: ApiError) => {
      toast.error(error.message || 'Failed to change password');
    },
  });

  return {
    // Query data
    users: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,

    // Mutations
    createUser: createMutation.mutate,
    createUserAsync: createMutation.mutateAsync,
    isCreating: createMutation.isPending,

    updateUser: updateMutation.mutate,
    updateUserAsync: updateMutation.mutateAsync,
    isUpdating: updateMutation.isPending,

    activateUser: activateMutation.mutate,
    activateUserAsync: activateMutation.mutateAsync,
    isActivating: activateMutation.isPending,

    deactivateUser: deactivateMutation.mutate,
    deactivateUserAsync: deactivateMutation.mutateAsync,
    isDeactivating: deactivateMutation.isPending,

    changePassword: changePasswordMutation.mutate,
    changePasswordAsync: changePasswordMutation.mutateAsync,
    isChangingPassword: changePasswordMutation.isPending,
  };
}

/**
 * Hook to fetch a single user
 */
export function useUser(id: string | undefined, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: userKeys.detail(id!),
    queryFn: () => usersApi.getById(id!),
    enabled: options?.enabled !== false && !!id,
    staleTime: 30000,
  });
}
