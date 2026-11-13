// src/shared/access/useAccess.test.ts

/** The area helper the hook returns: false while loading, everything on when the lookup failed. */

import { describe, expect, it } from 'vitest';

import { accessQueryOptions, areaOnFor } from './useAccess';

describe('areaOn', () => {
  it('is false for every area while loading', () => {
    expect(areaOnFor({ isLoading: true, errorStatus: null, areas: undefined })('search')).toBe(false);
  });

  it('is true for every area when the lookup failed, so nothing is hidden by a guess', () => {
    expect(areaOnFor({ isLoading: false, errorStatus: 503, areas: undefined })('chat')).toBe(true);
    expect(areaOnFor({ isLoading: false, errorStatus: 0, areas: undefined })('chat')).toBe(true);
  });

  it('follows the areas the server listed', () => {
    const areaOn = areaOnFor({ isLoading: false, errorStatus: null, areas: ['search'] });
    expect(areaOn('search')).toBe(true);
    expect(areaOn('chat')).toBe(false);
  });

  it('treats a server that sends no list (an older one) as everything on', () => {
    expect(areaOnFor({ isLoading: false, errorStatus: null, areas: undefined })('chat')).toBe(true);
  });
});

describe('the access query', () => {
  it('refetches on every window focus, even within the stale time, so a switch change shows on return', () => {
    expect(accessQueryOptions.refetchOnWindowFocus).toBe('always');
    expect(accessQueryOptions.staleTime).toBe(60_000);
  });
});
