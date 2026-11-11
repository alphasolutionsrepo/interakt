// src/app/users/_lib/user-gates.test.ts

/** What a user manager may do on the Users page: any role but Admin, never on an Admin or their own role */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { UserTable } from '../_components/UserTable';

import type { UserResponse } from './api-client';
import { roleChoices, userGates } from './user-gates';

import { ADMIN_ROLE_ID, roleRefusal } from '@/features/access/permissions';
import { menuItems } from '@/shared/test/rendered-controls';
import { uiAccess } from '@/shared/test/ui-access-stub';

vi.mock('@/shared/access/useAccess', async () => (await import('@/shared/test/ui-access-stub')).useAccessModule);
vi.mock('@/components/ui/dropdown-menu', async () => (await import('@/shared/test/open-overlays-stub')).dropdownMenu);

/** A team lead: views indexes and manages users, nothing else */
const manager = { isLoading: false, isAdmin: false, userId: 'me', permissions: ['users:manage', 'search-indexes:view'] };
const admin = { ...manager, isAdmin: true };
const ROLES = [
  { id: ADMIN_ROLE_ID, name: 'Admin', isBuiltIn: true, permissions: [] },
  { id: 'viewer', name: 'Index viewer', isBuiltIn: false, permissions: ['search-indexes:view'] },
  { id: 'editor', name: 'Editor', isBuiltIn: false, permissions: ['search-indexes:edit'] },
];
const user = (id: string, roleId: string) => ({ id, roleId });

describe('roleChoices', () => {
  it('opens only roles within what the user manager holds, saying why the rest are locked', () => {
    expect(roleChoices(manager, ROLES)).toEqual([
      { id: ADMIN_ROLE_ID, name: 'Admin', lockedReason: 'Only an Admin can give the Admin role.' },
      { id: 'viewer', name: 'Index viewer', lockedReason: undefined },
      { id: 'editor', name: 'Editor', lockedReason: "You can't give a role with permissions your own role doesn't have." },
    ]);
  });

  it('locks nothing for an Admin', () => {
    expect(roleChoices(admin, ROLES).every((r) => !r.lockedReason)).toBe(true);
  });

  it("locks nothing while access is still loading, even for an Admin, so no wrong reason shows", () => {
    for (const caller of [manager, admin]) {
      expect(roleChoices({ ...caller, isLoading: true }, ROLES).every((c) => c.lockedReason === undefined)).toBe(true);
    }
  });

  it('words each refusal as the server does', () => {
    expect(roleChoices(manager, ROLES).map((c) => c.lockedReason)).toEqual([
      roleRefusal('give', { isBuiltIn: true }), undefined, roleRefusal('give', { isBuiltIn: false }),
    ]);
  });
});

describe('userGates', () => {
  it('lets a user manager manage someone whose role is within theirs', () => {
    const g = userGates(manager, user('other', 'viewer'), ROLES);
    expect([g.manage, g.activation, g.role]).toEqual([{ state: 'allowed' }, { state: 'allowed' }, { state: 'allowed' }]);
  });

  it("locks an account whose role has more than the manager's, and an Admin's, saying why", () => {
    const above = userGates(manager, user('lead', 'editor'), ROLES);
    expect(above.manage.state).toBe('locked');
    expect(above.activation).toEqual(above.manage);
    const boss = userGates(manager, user('boss', ADMIN_ROLE_ID), ROLES);
    expect([boss.manage, boss.activation, boss.role]).toEqual(Array(3).fill({ state: 'locked', reason: 'Only an Admin can manage a user with the Admin role.' }));
  });

  it("waits for the roles before judging a user's role, and says so when they fail to load", () => {
    expect(userGates(manager, user('other', 'viewer'), [], 'loading').manage).toEqual({ state: 'loading' });
    expect(userGates(manager, user('other', 'viewer'), [], 'failed').manage)
      .toEqual({ state: 'locked', reason: "Couldn't load the roles to check this. Reload the page to try again." });
    expect(userGates(manager, user('other', 'gone'), ROLES).manage.state).toBe('locked');
  });

  it("lets an Admin manage anyone without the roles list", () => {
    for (const state of ['loading', 'failed'] as const) {
      const g = userGates(admin, user('other', 'viewer'), [], state);
      expect([g.manage, g.activation, g.role]).toEqual(Array(3).fill({ state: 'allowed' }));
    }
  });

  it('lets anyone edit their own profile, never their own role or active state', () => {
    for (const caller of [manager, admin]) {
      const g = userGates(caller, user('me', 'editor'), ROLES);
      expect(g.manage).toEqual({ state: 'allowed' });
      expect(g.activation).toEqual({ state: 'locked', reason: "You can't deactivate yourself. Ask another user manager." });
      expect(g.role).toEqual({ state: 'locked', reason: "You can't change your own role. Ask another user manager." });
    }
  });

  it('waits while access is loading', () => {
    expect(userGates({ ...manager, isLoading: true }, user('other', 'viewer'), ROLES).manage).toEqual({ state: 'loading' });
  });
});

describe("a user's row menu", () => {
  beforeEach(() => uiAccess.hold('users:manage', 'search-indexes:view'));
  const noop = () => {};
  const row = (u: Partial<UserResponse>) => renderToStaticMarkup(createElement(UserTable, {
    users: [{ id: 'x', email: 'x@x.test', firstName: null, lastName: null, roleId: 'editor', isActive: true, createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-01T00:00:00Z', ...u }],
    onEdit: noop, onChangePassword: noop, onActivate: noop, onDeactivate: noop, roles: ROLES,
  }));

  it("is usable on someone else's account", () => {
    expect(menuItems(row({ roleId: 'viewer' }))).toEqual(['Edit User', 'Change Password', 'Deactivate']);
    expect(menuItems(row({ roleId: 'editor' }))).toEqual(['Edit User (locked)', 'Change Password (locked)', 'Deactivate (locked)']);
  });

  it("is locked on an Admin's account, with the reason", () => {
    const html = row({ roleId: ADMIN_ROLE_ID });
    expect(menuItems(html)).toEqual(['Edit User (locked)', 'Change Password (locked)', 'Deactivate (locked)']);
    expect(html).toContain('Only an Admin can manage a user with the Admin role.');
  });
});
