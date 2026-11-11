// src/app/users/_components/AccessOverview.test.ts

/**
 * The Access overview on the Roles tab: every role against every permission. An Admin
 * switches permissions there; other user managers see it read-only; only an Admin sees the
 * add, edit and delete buttons.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import type { RoleResponse } from '../_lib/roles-api';

import { AccessOverview, cellState, toggled, unmetTitle } from './AccessOverview';
import { RolesPanel } from './RolesPanel';

import { ADMIN_ROLE_ID, ALL_PERMISSIONS, EDITOR_DEFAULT_PERMISSIONS, REQUIRED_WITH } from '@/features/access/permissions';
import { uiAccess } from '@/shared/test/ui-access-stub';
import { controlState } from '@/shared/test/rendered-controls';

const role = (over: Partial<RoleResponse>): RoleResponse => ({
  id: 'r', name: 'R', description: null, permissions: [], isBuiltIn: false, userCount: 0, ...over,
});
const admin = role({ id: ADMIN_ROLE_ID, name: 'Admin', isBuiltIn: true, userCount: 1 });
const editor = role({ id: 'editor', name: 'Editor', permissions: [...EDITOR_DEFAULT_PERMISSIONS], userCount: 2 });
const tester = role({ id: 'tester', name: 'Tester', permissions: ['playground:use'] });
const ROLES = [admin, editor, tester];

vi.mock('@/shared/access/useAccess', async () => (await import('@/shared/test/ui-access-stub')).useAccessModule);
vi.mock('../_lib/hooks/useRoles', () => ({
  useRoles: () => ({
    roles: ROLES, isLoading: false, error: null, retry: () => {},
    createRoleAsync: async () => {}, updateRoleAsync: async () => {}, setRolePermissions: () => {},
    savingRoleId: null, deleteRole: () => {}, isSaving: false, isDeleting: false,
  }),
}));

/** Each switch in the grid as [aria-label, checked, disabled] */
function switches(html: string): Array<[string, boolean, boolean]> {
  return [...html.matchAll(/<button[^>]*role="switch"[^>]*>/g)].map(([tag]) => [
    /aria-label="([^"]*)"/.exec(tag)![1],
    tag.includes('aria-checked="true"'),
    / disabled=""/.test(tag),
  ]);
}
const cell = (html: string, label: string) => switches(html).find(([l]) => l === label);

const grid = (editable: boolean, savingRoleId: string | null = null) =>
  renderToStaticMarkup(createElement(AccessOverview, { roles: ROLES, editable, savingRoleId, onChange: () => {} }));

describe('cellState', () => {
  it('reads Admin as holding everything', () => {
    expect(ALL_PERMISSIONS.every((p) => cellState(admin, p) === 'on')).toBe(true);
  });

  it('tells held, included, unmet and off apart', () => {
    expect(cellState(tester, 'playground:use')).toBe('on');
    expect(cellState(tester, 'search-indexes:view')).toBe('included');
    expect(cellState(role({ permissions: ['setup:run'] }), 'setup:run')).toBe('unmet');
    expect(cellState(tester, 'tools:view')).toBe('off');
  });
});

describe('toggled', () => {
  it('adds or removes only the switched permission', () => {
    expect(toggled(tester, 'tools:view', true)).toEqual(['playground:use', 'tools:view']);
    expect(toggled(tester, 'playground:use', false)).toEqual([]);
  });

  it('drops permission names the code no longer knows, so a save is never refused for them', () => {
    expect(toggled(role({ permissions: ['old:thing', 'tools:view'] }), 'tools:edit', true)).toEqual(['tools:view', 'tools:edit']);
  });
});

describe('AccessOverview', () => {
  it('shows a switch for every permission in every role', () => {
    expect(switches(grid(true))).toHaveLength(ALL_PERMISSIONS.length * ROLES.length);
  });

  it('lets an Admin switch what a role holds or lacks', () => {
    const html = grid(true);
    expect(cell(html, 'View tools and MCP connections: Tester')).toEqual([expect.any(String), false, false]);
    expect(cell(html, 'Use the playgrounds and test buttons (spends AI tokens): Tester')).toEqual([expect.any(String), true, false]);
  });

  it("never lets anyone switch the Admin column or a permission another one includes", () => {
    const html = grid(true);
    expect(switches(html).filter(([l]) => l.endsWith(': Admin')).every(([, on, off]) => on && off)).toBe(true);
    expect(cell(html, 'View search indexes and their documents: Tester')).toEqual([expect.any(String), true, true]);
  });

  it('is read-only for a user manager who is not an Admin, showing the same values', () => {
    const html = grid(false);
    expect(switches(html).every(([, , disabled]) => disabled)).toBe(true);
    expect(switches(html).map(([l, on]) => [l, on])).toEqual(switches(grid(true)).map(([l, on]) => [l, on]));
    expect(html).toContain('Only an Admin can change it');
  });

  it("holds a role's switches while its save is in flight", () => {
    const html = grid(true, 'tester');
    expect(switches(html).filter(([l]) => l.endsWith(': Tester')).every(([, , d]) => d)).toBe(true);
    expect(cell(html, 'View tools and MCP connections: Editor')?.[2]).toBe(false);
    expect(cell(html, 'Manage secrets and ingestion keys: Editor')?.[2]).toBe(false);
  });
});

describe('RolesPanel', () => {
  const panel = (isAdmin: boolean) => {
    if (isAdmin) uiAccess.asAdmin();
    else uiAccess.hold('users:manage');
    return renderToStaticMarkup(createElement(RolesPanel));
  };

  it('gives an Admin the add, edit and delete buttons, never on the built-in Admin role', () => {
    const html = panel(true);
    expect(html).not.toContain('data-locked');
    expect(html).toContain('Add Role');
    expect(html).toContain('aria-label="Edit Editor"');
    expect(html).toContain('aria-label="Delete Tester"');
    expect(html).not.toContain('aria-label="Edit Admin"');
    expect(html).toContain('Access overview');
  });

  it('shows another user manager the same buttons, locked with the reason, and the overview read-only', () => {
    const html = panel(false);
    expect(controlState(html, { attr: 'aria-label="Edit Editor"' }) === 'locked').toBe(true);
    expect(controlState(html, { attr: 'aria-label="Delete Tester"' }) === 'locked').toBe(true);
    expect(controlState(html, { text: 'Add Role' }) === 'locked').toBe(true);
    expect(html).toContain('Only an Admin can add, change or delete roles.');
    expect(switches(html).every(([, , disabled]) => disabled)).toBe(true);
  });
});

describe('a ticked permission that grants nothing yet', () => {
  it('names only the companions the role still lacks', () => {
    const [first, ...rest] = REQUIRED_WITH['setup:run']!;
    const stored = ['setup:run', ...rest];
    expect(cellState(role({ permissions: stored }), 'setup:run')).toBe('unmet');
    expect(unmetTitle(stored, 'setup:run')).toBe('Takes effect only once this role also has: Add, edit and delete AI providers, models and keys');
    expect(first).toBe('ai-providers:manage');
  });
});
