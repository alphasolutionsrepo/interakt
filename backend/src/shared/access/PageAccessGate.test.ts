// src/shared/access/PageAccessGate.test.ts

/**
 * LockedPage: in place of a page whose only purpose is an action the user may not take, it says
 * why and links back; while access is still loading it shows nothing, so nothing flashes.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { LockedPage } from './PageAccessGate';

vi.mock('next/navigation', () => ({ usePathname: () => '/' }));
vi.mock('next-auth/react', () => ({ signOut: () => {} }));

describe('LockedPage', () => {
  it('shows nothing while access loads', () => {
    expect(renderToStaticMarkup(createElement(LockedPage, { gate: { state: 'loading' }, backHref: '/tools/t' }))).toBe('');
  });

  it('says why, and links back', () => {
    const html = renderToStaticMarkup(createElement(LockedPage, {
      gate: { state: 'locked', reason: 'Only an Admin can change the built-in help.' }, backHref: '/tools/t',
    }));
    expect(html).toContain('You can&#x27;t change this');
    expect(html).toContain('Only an Admin can change the built-in help.');
    expect(html).toMatch(/<a[^>]*href="\/tools\/t"[^>]*>Back<\/a>/);
  });
});
