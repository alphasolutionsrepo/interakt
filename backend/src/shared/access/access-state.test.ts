// src/shared/access/access-state.test.ts

import { describe, expect, it } from 'vitest';

import { accessState, lookupErrorStatus } from './access-state';

import { ApiError } from '@/shared/api/api-error';

describe('what the page gate and the sidebar show', () => {
  it('waits while access loads', () => {
    expect(accessState({ isLoading: true, errorStatus: null, canOpen: false })).toBe('loading');
  });

  it('sends a user the server no longer accepts back to sign in', () => {
    expect(accessState({ isLoading: false, errorStatus: 401, canOpen: false })).toBe('signed-out');
  });

  it('says the check failed, never "no access", when the lookup fails', () => {
    expect(accessState({ isLoading: false, errorStatus: 503, canOpen: false })).toBe('unavailable');
    expect(accessState({ isLoading: false, errorStatus: 0, canOpen: false })).toBe('unavailable'); // network
  });

  it('follows the role once access is known', () => {
    expect(accessState({ isLoading: false, errorStatus: null, canOpen: true })).toBe('allowed');
    expect(accessState({ isLoading: false, errorStatus: null, canOpen: false })).toBe('denied');
  });
});

describe('which lookup failures the gate acts on', () => {
  it('keeps the open page when a background refresh fails, but not when the session is gone', () => {
    expect(lookupErrorStatus(new ApiError('down', 503), true)).toBeNull();
    expect(lookupErrorStatus(new ApiError('gone', 401), true)).toBe(401);
  });

  it('acts on any failure when no access is known yet; a network error is 0', () => {
    expect(lookupErrorStatus(new ApiError('down', 503), false)).toBe(503);
    expect(lookupErrorStatus(new TypeError('fetch failed'), false)).toBe(0);
    expect(lookupErrorStatus(null, false)).toBeNull();
  });
});
