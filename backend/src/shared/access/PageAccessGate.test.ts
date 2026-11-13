// src/shared/access/PageAccessGate.test.ts

/**
 * LockedPage: in place of a page whose only purpose is an action the user may not take, it says
 * why and links back; while access is still loading it shows nothing, so nothing flashes.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LockedPage, PageAccessGate } from './PageAccessGate';

import { uiAccess, uiAccessLoading } from '@/shared/test/ui-access-stub';

const nav = vi.hoisted(() => ({ path: '/' }));
vi.mock('next/navigation', () => ({ usePathname: () => nav.path }));
vi.mock('next-auth/react', () => ({ signOut: () => {} }));
vi.mock('./useAccess', async () => (await import('@/shared/test/ui-access-stub')).useAccessModule);

const gate = (path: string) => {
  nav.path = path;
  return renderToStaticMarkup(createElement(PageAccessGate, null, 'PAGE'));
};

describe('PageAccessGate', () => {
  beforeEach(() => { uiAccess.hold(); nav.path = '/'; });

  it('shows the page to a role that can open it', () => {
    uiAccess.hold('tools:view');
    expect(gate('/tools')).toBe('PAGE');
  });

  it('says why, with no link, to a role without the permission', () => {
    expect(gate('/tools')).toContain('You don&#x27;t have access to this page');
  });

  it('names the area that is off, ahead of the permission, and offers an Admin the way to turn it on', () => {
    uiAccess.asAdmin();
    uiAccess.areasOff('chat');
    const html = gate('/tools');
    expect(html).toContain('Chat is turned off for this installation.');
    expect(html).toMatch(/<a[^>]*href="\/settings\/features"[^>]*>Turn it on in Settings → Features<\/a>/);
    expect(html).not.toContain('PAGE');
  });

  it('says it is off, without the link, to a non-Admin', () => {
    uiAccess.hold('tools:view');
    uiAccess.areasOff('chat');
    const html = gate('/tools');
    expect(html).toContain('Chat is turned off for this installation.');
    expect(html).not.toContain('/settings/features');
  });

  it('names every area that keeps the page closed, and only those', () => {
    uiAccess.asAdmin();
    uiAccess.areasOff('managed-indexes', 'playground', 'analytics');
    expect(gate('/playground/search')).toContain('Managed indexes and Playground are turned off for this installation.');
    uiAccess.areasOff('search', 'chat');
    expect(gate('/experiences')).toContain('Search and Chat are turned off for this installation.');
  });

  it('keeps core pages open when areas are off, and shows nothing while loading', () => {
    uiAccess.hold('data-sources:view');
    uiAccess.areasOff('chat', 'search');
    expect(gate('/data-sources')).toBe('PAGE');
    uiAccessLoading();
    expect(gate('/tools')).toBe('');
  });
});

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
