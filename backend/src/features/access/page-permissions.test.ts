// src/features/access/page-permissions.test.ts

import { describe, expect, it } from 'vitest';

import { sidebarGroups, visibleSidebarGroups } from '@/shared/data/SideBar-Items';

import { canOpenPage, permissionsForPage } from './page-permissions';
import { VIEWER_DEFAULT_PERMISSIONS, type Permission } from './permissions';

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
