// src/shared/access/useAccess.ts

/**
 * The signed-in user's role and permissions, for the admin UI to show only what the user can
 * do. The server checks every request itself; hiding something here is a convenience, not
 * the gate.
 */

'use client';

import { useQuery } from '@tanstack/react-query';

import type { Permission } from '@/features/access/permissions';
import { handleApiResponse } from '@/shared/api/api-error';

export interface MyAccess {
  userId: string;
  role: { id: string; name: string; isAdmin: boolean };
  permissions: Permission[];
}

export const accessKeys = { mine: ['access', 'mine'] as const };

export function useAccess() {
  const query = useQuery({
    queryKey: accessKeys.mine,
    queryFn: async () => handleApiResponse<MyAccess>(await fetch('/api/me/access')),
    staleTime: 60_000,
  });
  const permissions = new Set<string>(query.data?.permissions ?? []);
  return {
    access: query.data,
    isLoading: query.isLoading,
    /** False while loading, so nothing flashes in and then disappears. */
    can: (permission: Permission) => permissions.has(permission),
  };
}
