// src/shared/access/access-state.ts

/**
 * What the page gate and the sidebar do while the user's access loads, when it fails, and once
 * it is known. Pure, so every state is tested.
 *
 *  - loading:     render nothing yet, so nothing flashes in and out
 *  - signed-out:  the server no longer accepts the session (deactivated or deleted): sign in again
 *  - unavailable: the lookup failed (server or database down): say so and offer a retry, never
 *                 "no access", and keep the full sidebar (the server still checks every request)
 *  - allowed / denied: from the page's permissions
 */

export type AccessState = 'loading' | 'signed-out' | 'unavailable' | 'allowed' | 'denied';

export function accessState(input: { isLoading: boolean; errorStatus?: number | null; canOpen: boolean }): AccessState {
  if (input.isLoading) return 'loading';
  if (input.errorStatus === 401) return 'signed-out';
  if (input.errorStatus !== undefined && input.errorStatus !== null) return 'unavailable';
  return input.canOpen ? 'allowed' : 'denied';
}
