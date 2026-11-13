// src/shared/access/access-state.ts

/**
 * What the page gate and the sidebar do while the user's access loads, when it fails, and once
 * it is known. Pure, so every state is tested.
 *
 *  - loading:     render nothing yet, so nothing flashes in and out
 *  - signed-out:  the server no longer accepts the session (deactivated or deleted): sign in again
 *  - unavailable: the lookup failed (server or database down): say so and offer a retry, never
 *                 "no access", and keep the full sidebar (the server still checks every request)
 *  - off:         the page's feature area is turned off (for everyone, an Admin too); said before
 *                 "denied", as no permission would help
 *  - allowed / denied: from the page's permissions
 */

import { ApiError } from '@/shared/api/api-error';

export type AccessState = 'loading' | 'signed-out' | 'unavailable' | 'off' | 'allowed' | 'denied';

export function accessState(input: { isLoading: boolean; errorStatus?: number | null; canOpen: boolean; areaOn?: boolean }): AccessState {
  if (input.isLoading) return 'loading';
  if (input.errorStatus === 401) return 'signed-out';
  if (input.errorStatus !== undefined && input.errorStatus !== null) return 'unavailable';
  if (input.areaOn === false) return 'off';
  return input.canOpen ? 'allowed' : 'denied';
}

/**
 * The status the gate acts on when the access lookup failed: a 401 always (the session is no
 * longer accepted); any other failure only when no access is known yet, so a failed background
 * refresh doesn't replace the open page. 0 for a network error; null for nothing to act on.
 */
export function lookupErrorStatus(error: unknown, haveAccess: boolean): number | null {
  if (!error) return null;
  const status = error instanceof ApiError ? error.status : 0;
  return status === 401 || !haveAccess ? status : null;
}
