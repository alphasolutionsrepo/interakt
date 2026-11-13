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
import type { Area } from '@/features/feature-switches/areas';
import { ApiError, handleApiResponse } from '@/shared/api/api-error';


export interface MyAccess {
  userId: string;
  role: { id: string; name: string; isAdmin: boolean };
  permissions: Permission[];
  /** The feature areas that are on for the installation (feature-switches) */
  areas: Area[];
  /** Areas the deployment setting turns off, which can't be turned on in Settings → Features (absent from an older server) */
  pinnedOff?: Area[];
  /** Areas an Admin switched off (absent from an older server) */
  switchedOff?: Area[];
}

export const accessKeys = { mine: ['access', 'mine'] as const };

/**
 * Whether an area is on, for the hook's areaOn. False while loading (nothing flashes in and
 * disappears); every area on when the lookup failed (the sidebar's "unavailable, show
 * everything": the server still refuses an area that is off); an answer without a list (an
 * older server) counts as everything on.
 */
export function areaOnFor(input: { isLoading: boolean; errorStatus: number | null; areas: readonly Area[] | undefined }) {
  return (area: Area): boolean => {
    if (input.isLoading) return false;
    if (input.errorStatus !== null) return true;
    return input.areas ? input.areas.includes(area) : true;
  };
}

export function useAccess() {
  const query = useQuery({
    queryKey: accessKeys.mine,
    queryFn: async () => handleApiResponse<MyAccess>(await fetch('/api/me/access')),
    staleTime: 60_000,
    // So another user sees a feature switch change soon, not only after the stale time passes
    refetchOnWindowFocus: true,
    // A 401 means the session is no longer accepted; retrying won't change that
    retry: (count, error) => !(error instanceof ApiError && error.status === 401) && count < 2,
  });
  const permissions = new Set<string>(query.data?.permissions ?? []);
  const can = (permission: Permission) => permissions.has(permission);
  const errorStatus = lookupErrorStatus(query.error, !!query.data);
  return {
    access: query.data,
    isLoading: query.isLoading,
    /** The lookup's HTTP status when it failed with no access known yet (0 for a network error), null otherwise */
    // A failed background refresh keeps the access already known, unless the server no longer
    // accepts the session (401: deactivated), which signs the user out
    errorStatus,
    retry: () => void query.refetch(),
    /** False while loading, so nothing flashes in and then disappears. */
    can,
    /** Whether a feature area is on (feature-switches): false while loading, true when the lookup failed. */
    areaOn: areaOnFor({ isLoading: query.isLoading, errorStatus, areas: query.data?.areas }),
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
