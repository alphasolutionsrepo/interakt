// src/shared/access/PageAccessGate.states.test.ts

/**
 * PageAccessGate when the access lookup failed: "unavailable" (server down: say so, offer a
 * retry, never "no access") and "signed-out" (401: nothing shown, sign in again).
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PageAccessGate } from './PageAccessGate';

const h = vi.hoisted(() => ({
  errorStatus: null as number | null,
  retry: vi.fn(),
  signOut: vi.fn(),
  retryButton: undefined as undefined | (() => void),
}));

vi.mock('next/navigation', () => ({ usePathname: () => '/tools' }));
vi.mock('next-auth/react', () => ({ signOut: h.signOut }));
vi.mock('./useAccess', () => ({
  useAccess: () => ({
    access: undefined, isLoading: false, errorStatus: h.errorStatus, retry: h.retry,
    can: () => false, areaOn: () => true, isAdmin: false,
  }),
}));
// Effects don't run in a static render; run them at once
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useEffect: (fn: () => void) => { fn(); },
}));
vi.mock('@/components/ui/button', () => ({
  Button: (p: { onClick?: () => void; children?: unknown }) => { h.retryButton = p.onClick; return createElement('button', null, p.children as never); },
}));

const gate = () => renderToStaticMarkup(createElement(PageAccessGate, null, 'PAGE'));

describe('PageAccessGate when the access lookup failed', () => {
  beforeEach(() => { vi.clearAllMocks(); h.retryButton = undefined; });

  it.each([503, 500, 0])('says access could not be checked, and offers a retry, on status %i', (status) => {
    h.errorStatus = status;
    const html = gate();
    expect(html).toContain('Couldn&#x27;t check your access');
    expect(html).toContain('Try again');
    expect(html).not.toContain("You don&#x27;t have access");
    expect(html).not.toContain('PAGE');
    expect(h.signOut).not.toHaveBeenCalled();
    h.retryButton!();
    expect(h.retry).toHaveBeenCalledTimes(1);
  });

  it('shows nothing and signs the user out to /login on a 401', () => {
    h.errorStatus = 401;
    expect(gate()).toBe('');
    expect(h.signOut).toHaveBeenCalledWith({ callbackUrl: '/login' });
  });

  it('does not sign out for other failures', () => {
    h.errorStatus = 503;
    gate();
    expect(h.signOut).not.toHaveBeenCalled();
  });
});
