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
import { controlState } from '@/shared/test/rendered-controls';
import { uiAccess } from '@/shared/test/ui-access-stub';

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
    isSwitching: false, deleteRole: () => {}, isSaving: false, isDeleting: false,
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

const grid = (editable: boolean, saving = false) =>
  renderToStaticMarkup(createElement(AccessOverview, { roles: ROLES, editable, saving, onChange: () => {} }));

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

  it('holds every switch, in every role, while a save is in flight', () => {
    expect(cell(grid(true), 'Manage secrets and ingestion keys: Editor')?.[2]).toBe(false);
    const html = grid(true, true);
    expect(switches(html).every(([, , d]) => d)).toBe(true);
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

describe('with a feature area turned off', () => {
  const html = (admin: boolean) => {
    if (admin) uiAccess.asAdmin(); else uiAccess.hold('users:manage');
    uiAccess.areasOff('chat');
    return renderToStaticMarkup(createElement(AccessOverview, { roles: ROLES, editable: admin, onChange: () => {} }));
  };

  it('keeps its permissions listed but disabled, with the value each role holds', () => {
    const out = html(true);
    expect(switches(out)).toHaveLength(ALL_PERMISSIONS.length * ROLES.length);
    // Editor holds tools:edit by default; Tester doesn't
    expect(cell(out, 'Create, edit and delete tools and MCP connections: Editor')).toEqual([expect.any(String), true, true]);
    expect(cell(out, 'View tools and MCP connections: Tester')).toEqual([expect.any(String), false, true]);
    // a permission of an area that is on stays switchable
    expect(cell(out, 'Manage secrets and ingestion keys: Editor')?.[2]).toBe(false);
  });

  it('notes the area once in each group that has its permissions, with a link for an Admin only', () => {
    const out = html(true);
    expect(out).toContain('Chat is turned off for this installation.');
    expect(out).toContain('Roles keep these permissions, and they apply again when Chat is on.');
    expect(out).toContain('href="/settings/features"');
    expect(html(false)).not.toContain('href="/settings/features"');
  });

  it('shows no note and no disabled switch when every area is on', () => {
    uiAccess.asAdmin();
    const out = grid(true);
    expect(out).not.toContain('turned off');
    expect(cell(out, 'View tools and MCP connections: Tester')?.[2]).toBe(false);
  });

  it('never tells anyone to tick a permission they cannot', () => {
    const stored = ['setup:run'];
    const text = unmetTitle(stored, 'setup:run', (a) => a !== 'chat');
    expect(text).toContain('Create, edit and delete tools and MCP connections');
    expect(text).toContain('Chat is turned off for this installation');
    expect(text.split('Also needs')[0]).not.toContain('tools and MCP connections');
  });
});

describe('toggled with an area off', () => {
  it('keeps a held permission of the off area when another one is switched', () => {
    expect(toggled(role({ permissions: ['tools:view', 'prompts:view'] }), 'playground:use', true)).toEqual(['tools:view', 'prompts:view', 'playground:use']);
  });
});
