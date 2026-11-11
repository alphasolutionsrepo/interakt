// src/shared/access/Can.test.ts

/** Controls and links show only to a role that can use them, and nothing shows while loading */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AccessLink, Can } from './Can';

import type { Permission } from '@/features/access/permissions';
import { uiAccess, uiAccessLoading } from '@/shared/test/ui-access-stub';

vi.mock('./useAccess', async () => (await import('@/shared/test/ui-access-stub')).useAccessModule);

const can = (permission: Permission | Permission[]) =>
  renderToStaticMarkup(createElement(Can, { permission, fallback: 'no', children: 'yes' }));
const link = (href: string | { pathname: string }) =>
  renderToStaticMarkup(createElement(AccessLink, { href, fallback: 'plain', children: 'Open' }));

describe('Can', () => {
  beforeEach(() => { uiAccess.hold(); });

  it('shows the control to a role holding the permission', () => {
    uiAccess.hold('tools:edit');
    expect(can('tools:edit')).toBe('yes');
  });

  it('shows the fallback to a role without it', () => {
    uiAccess.hold('tools:view');
    expect(can('tools:edit')).toBe('no');
  });

  it('accepts any one of a list', () => {
    uiAccess.hold('ai-experiences:edit');
    expect(can(['search-experiences:edit', 'ai-experiences:edit'])).toBe('yes');
    expect(can(['search-experiences:edit', 'tools:edit'])).toBe('no');
  });

  it('follows the rule of a UI action', () => {
    uiAccess.hold('ai-providers:manage');
    expect(renderToStaticMarkup(createElement(Can, { action: 'ai-providers.add', fallback: 'no', children: 'yes' }))).toBe('yes');
    uiAccess.hold('ai-providers:view');
    expect(renderToStaticMarkup(createElement(Can, { action: 'ai-providers.add', fallback: 'no', children: 'yes' }))).toBe('no');
  });

  it('shows neither the section nor its fallback while access is loading', () => {
    uiAccessLoading();
    expect(can('settings:view')).toBe('');
  });

  it('shows the fallback once access is known to lack the permission', () => {
    expect(can('settings:view')).toBe('no');
  });
});

describe('AccessLink', () => {
  beforeEach(() => { uiAccess.hold(); });

  it('links to a page the role can open', () => {
    uiAccess.hold('tools:view');
    expect(link('/tools/abc')).toContain('href="/tools/abc"');
  });

  it('renders the fallback instead of a link to a closed page', () => {
    uiAccess.hold('tools:view');
    expect(link('/tools/abc/edit')).toBe('plain');
    expect(link({ pathname: '/data-sources' })).toBe('plain');
  });

  it('ignores the query and hash when matching the page', () => {
    uiAccess.hold('search-indexes:view');
    expect(link('/search-indexes/abc?tab=documents#top')).toContain('href=');
    expect(link('/search-indexes/abc/edit?from=list')).toBe('plain');
  });

  it('always links to pages that need only a session', () => {
    expect(link('/dashboard')).toContain('href="/dashboard"');
  });

  it('keeps the content, without the link or its hover styles, when asked to stay plain', () => {
    const card = () => renderToStaticMarkup(createElement(AccessLink, {
      href: '/data-sources/abc', plain: 'div', className: 'flex gap-3 hover:underline group-hover:text-primary', children: 'Docs index',
    }));
    uiAccess.hold('search-experiences:view');
    expect(card()).toBe('<div class="flex gap-3">Docs index</div>');
    uiAccess.hold('data-sources:view');
    expect(card()).toContain('href="/data-sources/abc"');
    expect(card()).toContain('hover:underline');
  });
});
