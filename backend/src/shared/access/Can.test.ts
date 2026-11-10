// src/shared/access/Can.test.ts

/** Controls and links show only to a role that can use them, and nothing shows while loading */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AccessLink, Can } from './Can';

import type { Permission } from '@/features/access/permissions';

let held: Permission[] = [];
vi.mock('./useAccess', () => ({
  useAccess: () => ({ can: (p: Permission) => held.includes(p) }),
}));

const can = (permission: Permission | Permission[]) =>
  renderToStaticMarkup(createElement(Can, { permission, fallback: 'no', children: 'yes' }));
const link = (href: string | { pathname: string }) =>
  renderToStaticMarkup(createElement(AccessLink, { href, fallback: 'plain', children: 'Open' }));

describe('Can', () => {
  beforeEach(() => { held = []; });

  it('shows the control to a role holding the permission', () => {
    held = ['tools:edit'];
    expect(can('tools:edit')).toBe('yes');
  });

  it('shows the fallback to a role without it', () => {
    held = ['tools:view'];
    expect(can('tools:edit')).toBe('no');
  });

  it('accepts any one of a list', () => {
    held = ['ai-experiences:edit'];
    expect(can(['search-experiences:edit', 'ai-experiences:edit'])).toBe('yes');
    expect(can(['search-experiences:edit', 'tools:edit'])).toBe('no');
  });

  it('shows nothing while access is loading (no permissions known yet)', () => {
    expect(can('settings:view')).toBe('no');
  });
});

describe('AccessLink', () => {
  beforeEach(() => { held = []; });

  it('links to a page the role can open', () => {
    held = ['tools:view'];
    expect(link('/tools/abc')).toContain('href="/tools/abc"');
  });

  it('renders the fallback instead of a link to a closed page', () => {
    held = ['tools:view'];
    expect(link('/tools/abc/edit')).toBe('plain');
    expect(link({ pathname: '/data-sources' })).toBe('plain');
  });

  it('ignores the query and hash when matching the page', () => {
    held = ['search-indexes:view'];
    expect(link('/search-indexes/abc?tab=documents#top')).toContain('href=');
    expect(link('/search-indexes/abc/edit?from=list')).toBe('plain');
  });

  it('always links to pages that need only a session', () => {
    expect(link('/dashboard')).toContain('href="/dashboard"');
  });
});
