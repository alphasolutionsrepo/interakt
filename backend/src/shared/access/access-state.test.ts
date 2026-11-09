// src/shared/access/access-state.test.ts

import { describe, expect, it } from 'vitest';

import { accessState } from './access-state';

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
