// src/features/access/page-permissions.test.ts

import fs from 'fs';
import path from 'path';

import { describe, expect, it } from 'vitest';


import { canOpenPage, permissionsForPage } from './page-permissions';
import { VIEWER_DEFAULT_PERMISSIONS, type Permission } from './permissions';

import { sidebarGroups, visibleSidebarGroups } from '@/shared/data/SideBar-Items';

const holding = (list: readonly Permission[]) => (p: Permission) => list.includes(p);
const urls = (groups: ReturnType<typeof visibleSidebarGroups>) =>
  groups.flatMap((g) => g.items.flatMap((i) => [i.url, ...(i.subItems ?? []).map((s) => s.url)]));

describe('which permission opens which page', () => {
  it('asks for edit on create and edit pages, view on the rest of an area', () => {
    expect(permissionsForPage('/search-experiences/create')).toEqual(['search-experiences:edit']);
    expect(permissionsForPage('/search-experiences/abc/edit')).toEqual(['search-experiences:edit']);
    expect(permissionsForPage('/search-experiences/abc')).toEqual(['search-experiences:view']);
    expect(permissionsForPage('/search-indexes/abc/upload')).toEqual(['documents:edit']);
    expect(permissionsForPage('/experiences')).toEqual(['search-experiences:view', 'ai-experiences:view']);
  });

  it('needs only a session for the dashboard, docs and health', () => {
    for (const page of ['/dashboard', '/docs', '/docs/concepts/users', '/health']) expect(permissionsForPage(page)).toEqual([]);
  });

  it('does not let a look-alike path borrow a looser rule', () => {
    expect(permissionsForPage('/secrets-old')).toEqual([]);
    expect(permissionsForPage('/secrets/')).toEqual(['secrets:manage']);
  });

  it('opens a page with any one of its permissions', () => {
    expect(canOpenPage('/experiences', holding(['ai-experiences:view']))).toBe(true);
    expect(canOpenPage('/users', holding(VIEWER_DEFAULT_PERMISSIONS))).toBe(false);
  });
});

describe('the sidebar a role sees', () => {
  it('shows a Viewer no admin, test or create pages', () => {
    const seen = urls(visibleSidebarGroups(sidebarGroups, (url) => canOpenPage(url, holding(VIEWER_DEFAULT_PERMISSIONS))));
    expect(seen).toContain('/dashboard');
    expect(seen).toContain('/search-indexes');
    for (const hidden of ['/users', '/secrets', '/ai-providers', '/setup', '/playground/widget', '/search-indexes/create', '/experiences/create', '/jobs']) {
      expect(seen).not.toContain(hidden);
    }
  });

  it('drops a group with nothing left and keeps a parent with any sub-item left', () => {
    const groups = visibleSidebarGroups(sidebarGroups, (url) => url === '/dashboard' || url === '/settings/search');
    expect(urls(groups)).toEqual(['/dashboard', '/settings', '/settings/search']);
  });
});

describe('every admin page has a rule', () => {
  /** Pages any signed-in user may open, on purpose. Everything else needs a rule. */
  const SESSION_ONLY = ['/', '/login', '/dashboard', '/health', '/docs/x'];
  const APP = path.resolve(__dirname, '../../app');

  function pages(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      if (e.isDirectory()) return e.name === 'api' || e.name.startsWith('_') ? [] : pages(path.join(dir, e.name));
      return e.name === 'page.tsx' ? [dir] : [];
    });
  }
  const urlOf = (dir: string) =>
    '/' + path.relative(APP, dir).split(path.sep)
      .filter((part) => !/^\(.*\)$/.test(part)) // route groups don't appear in the URL
      .map((part) => (/^\[.*\]$/.test(part) ? 'x' : part))
      .join('/');

  it('finds the pages', () => {
    expect(pages(APP).length).toBeGreaterThan(40);
  });

  it('gives every page a permission unless it is meant for any signed-in user', () => {
    const uncovered = pages(APP).map(urlOf).map((u) => u.replace(/\/$/, '') || '/')
      .filter((u) => permissionsForPage(u).length === 0 && !SESSION_ONLY.includes(u));
    expect(uncovered).toEqual([]);
  });
});
