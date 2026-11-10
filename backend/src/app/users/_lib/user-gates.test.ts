// src/app/users/_lib/user-gates.test.ts

/** What a user manager may do on the Users page: any role but Admin, never on an Admin or their own role */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { UserTable } from '../_components/UserTable';

import type { UserResponse } from './api-client';
import { roleChoices, userGates } from './user-gates';

import { ADMIN_ROLE_ID } from '@/features/access/permissions';
import { uiAccess } from '@/shared/test/ui-access-stub';
import { menuItems } from '@/shared/test/rendered-controls';

vi.mock('@/shared/access/useAccess', async () => (await import('@/shared/test/ui-access-stub')).useAccessModule);
vi.mock('@/components/ui/dropdown-menu', async () => (await import('@/shared/test/open-overlays-stub')).dropdownMenu);

const manager = { isLoading: false, isAdmin: false, userId: 'me' };
const admin = { ...manager, isAdmin: true };
const ROLES = [
  { id: ADMIN_ROLE_ID, name: 'Admin', isBuiltIn: true },
  { id: 'editor', name: 'Editor', isBuiltIn: false },
];
const user = (id: string, isBuiltIn = false) => ({ id, roleId: isBuiltIn ? ADMIN_ROLE_ID : 'editor', role: { isBuiltIn } });

describe('roleChoices', () => {
  it('lists every role, with Admin locked for a user manager', () => {
    expect(roleChoices(manager, ROLES)).toEqual([
      { id: ADMIN_ROLE_ID, name: 'Admin', lockedReason: 'Only an Admin can give the Admin role.' },
      { id: 'editor', name: 'Editor', lockedReason: undefined },
    ]);
  });

  it('locks nothing for an Admin', () => {
    expect(roleChoices(admin, ROLES).every((r) => !r.lockedReason)).toBe(true);
  });
});

describe('userGates', () => {
  it('lets a user manager manage, deactivate and re-role someone else who is not an Admin', () => {
    const g = userGates(manager, user('other'));
    expect([g.manage, g.activation, g.role]).toEqual([{ state: 'allowed' }, { state: 'allowed' }, { state: 'allowed' }]);
  });

  it("locks everything on an Admin's account for a user manager, saying why", () => {
    const g = userGates(manager, user('boss', true));
    const reason = 'Only an Admin can manage a user with the Admin role.';
    expect([g.manage, g.activation, g.role]).toEqual(Array(3).fill({ state: 'locked', reason }));
  });

  it('spots an Admin from the role id when the role itself is missing', () => {
    expect(userGates(manager, { id: 'boss', roleId: ADMIN_ROLE_ID }).manage.state).toBe('locked');
  });

  it('lets anyone edit their own profile, never their own role or active state', () => {
    for (const caller of [manager, admin]) {
      const g = userGates(caller, user('me', caller.isAdmin));
      expect(g.manage).toEqual({ state: 'allowed' });
      expect(g.activation).toEqual({ state: 'locked', reason: "You can't deactivate yourself. Ask another user manager." });
      expect(g.role).toEqual({ state: 'locked', reason: "You can't change your own role. Ask another user manager." });
    }
  });

  it('waits while access is loading', () => {
    expect(userGates({ ...manager, isLoading: true }, user('other')).manage).toEqual({ state: 'loading' });
  });
});

describe("a user's row menu", () => {
  beforeEach(() => uiAccess.hold('users:manage'));
  const noop = () => {};
  const row = (u: Partial<UserResponse>) => renderToStaticMarkup(createElement(UserTable, {
    users: [{ id: 'x', email: 'x@x.test', firstName: null, lastName: null, roleId: 'editor', isActive: true, createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-01T00:00:00Z', ...u }],
    onEdit: noop, onChangePassword: noop, onActivate: noop, onDeactivate: noop,
  }));

  it("is usable on someone else's account", () => {
    expect(menuItems(row({ role: { id: 'editor', name: 'Editor', isBuiltIn: false } }))).toEqual(['Edit User', 'Change Password', 'Deactivate']);
  });

  it("is locked on an Admin's account, with the reason", () => {
    const html = row({ roleId: ADMIN_ROLE_ID, role: { id: ADMIN_ROLE_ID, name: 'Admin', isBuiltIn: true } });
    expect(menuItems(html)).toEqual(['Edit User (locked)', 'Change Password (locked)', 'Deactivate (locked)']);
    expect(html).toContain('Only an Admin can manage a user with the Admin role.');
  });
});
