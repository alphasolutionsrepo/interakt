// app/users/_lib/hooks/useRoles.ts

'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { rolesApi } from '../roles-api';

import { roleKeys, userKeys } from './useUsers';

import type { Permission } from '@/features/access/permissions';
import type { CreateRoleInput, UpdateRoleInput } from '@/features/access/roles.validations';
import { accessKeys } from '@/shared/access/useAccess';



export function useRoles() {
  const queryClient = useQueryClient();
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: roleKeys.all });
    queryClient.invalidateQueries({ queryKey: userKeys.all });
    // Editing a role can change the caller's own permissions
    queryClient.invalidateQueries({ queryKey: accessKeys.mine });
  };

  const query = useQuery({ queryKey: roleKeys.all, queryFn: rolesApi.list, staleTime: 30_000 });

  const create = useMutation({
    mutationFn: (data: CreateRoleInput) => rolesApi.create(data),
    onSuccess: () => { refresh(); toast.success('Role created'); },
    meta: { label: 'Create role', inlineError: true },
  });
  const update = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateRoleInput }) => rolesApi.update(id, data),
    onSuccess: () => { refresh(); toast.success('Role saved'); },
    meta: { label: 'Save role', inlineError: true },
  });
  // The Access overview saves one switch at a time and has no form to show an error in, so a
  // failure is reported the usual way (toast + activity), unlike the dialog's save
  const switchPermission = useMutation({
    mutationFn: ({ id, permissions }: { id: string; permissions: Permission[] }) => rolesApi.update(id, { permissions }),
    onSuccess: refresh,
    // A refused save leaves the switch where the server has it
    onError: refresh,
    meta: { label: 'Change role permissions' },
  });
  const remove = useMutation({
    mutationFn: (id: string) => rolesApi.remove(id),
    onSuccess: () => { refresh(); toast.success('Role deleted'); },
    meta: { label: 'Delete role' },
  });

  return {
    roles: query.data ?? [],
    isLoading: query.isLoading,
    /** Why the roles list didn't load, if it didn't */
    error: query.error,
    retry: () => void query.refetch(),
    createRoleAsync: create.mutateAsync,
    updateRoleAsync: update.mutateAsync,
    setRolePermissions: switchPermission.mutate,
    /** The role whose Access overview save is in flight, if any */
    savingRoleId: switchPermission.isPending ? switchPermission.variables?.id ?? null : null,
    deleteRole: remove.mutate,
    isSaving: create.isPending || update.isPending,
    isDeleting: remove.isPending,
  };
}
