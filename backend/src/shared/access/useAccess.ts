// src/shared/access/useAccess.ts

/**
 * The signed-in user's permissions, for the admin UI to show only what the user can do. The
 * server checks every request itself; hiding something here is a convenience, not the gate.
 *
 * The UI asks only can(permission) and isAdmin. The server works out the permissions from the
 * user's role(s), so components never depend on how roles are stored or how many a user has.
 */

'use client';

import { useQuery } from '@tanstack/react-query';

import { lookupErrorStatus } from './access-state';

import type { Permission } from '@/features/access/permissions';
import { allowsAction, type UiActionId } from '@/features/access/ui-actions';
import { ApiError, handleApiResponse } from '@/shared/api/api-error';


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
    // A 401 means the session is no longer accepted; retrying won't change that
    retry: (count, error) => !(error instanceof ApiError && error.status === 401) && count < 2,
  });
  const permissions = new Set<string>(query.data?.permissions ?? []);
  const can = (permission: Permission) => permissions.has(permission);
  return {
    access: query.data,
    isLoading: query.isLoading,
    /** The lookup's HTTP status when it failed with no access known yet (0 for a network error), null otherwise */
    // A failed background refresh keeps the access already known, unless the server no longer
    // accepts the session (401: deactivated), which signs the user out
    errorStatus: lookupErrorStatus(query.error, !!query.data),
    retry: () => void query.refetch(),
    /** False while loading, so nothing flashes in and then disappears. */
    can,
    /** Whether the user may take a UI action (ui-actions.ts); false while loading. */
    canDo: (action: UiActionId) => allowsAction(can, action),
    /**
     * Holds the built-in Admin role. For the few Admin-only actions (shaping roles, changing the
     * built-in help); everything else asks can(permission). Components read this, never the
     * role itself, so how roles are assigned can change without touching them.
     */
    isAdmin: query.data?.role.isAdmin ?? false,
  };
}
