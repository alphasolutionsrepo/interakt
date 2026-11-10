// app/users/_lib/user-gates.ts

/**
 * What the signed-in user manager may do on the Users page, from the same rule the server uses
 * (mayAssignRole in features/access/permissions.ts). Pure, so each case is tested on its own.
 *
 *  - Any role can be given except Admin, which only an Admin gives.
 *  - An Admin's account is managed only by an Admin.
 *  - Nobody changes their own role or deactivates themselves.
 */

import { ADMIN_ROLE_ID, mayAssignRole } from '@/features/access/permissions';
import type { ActionGate } from '@/shared/access/ActionControls';

export interface Caller {
  isLoading: boolean;
  isAdmin: boolean;
  userId?: string;
}

const ONLY_ADMIN_GIVES = 'Only an Admin can give the Admin role.';
const ONLY_ADMIN_MANAGES = 'Only an Admin can manage a user with the Admin role.';
const NOT_YOURSELF_ROLE = "You can't change your own role. Ask another user manager.";
const NOT_YOURSELF_ACTIVE = "You can't deactivate yourself. Ask another user manager.";

const gate = (caller: Caller, allowed: boolean, reason: string): ActionGate =>
  caller.isLoading ? { state: 'loading' } : allowed ? { state: 'allowed' } : { state: 'locked', reason };

/** Every role, each with why it can't be chosen when it can't. */
export function roleChoices<R extends { id: string; name: string; isBuiltIn: boolean }>(caller: Caller, roles: R[]) {
  return roles.map((r) => ({ id: r.id, name: r.name, lockedReason: mayAssignRole(caller, r) ? undefined : ONLY_ADMIN_GIVES }));
}

/** The gates on one user's row and edit form. */
export function userGates(caller: Caller, user: { id: string; roleId: string; role?: { isBuiltIn: boolean } }) {
  const self = user.id === caller.userId;
  // The list carries the role; a single user only its id
  const isBuiltIn = user.role?.isBuiltIn ?? user.roleId === ADMIN_ROLE_ID;
  const manage = gate(caller, self || mayAssignRole(caller, { isBuiltIn }), ONLY_ADMIN_MANAGES);
  const lockedByManage = manage.state === 'locked' ? manage : null;
  return {
    /** Edit the profile, change the password */
    manage,
    /** Activate or deactivate */
    activation: lockedByManage ?? gate(caller, !self, NOT_YOURSELF_ACTIVE),
    /** Change the role in the edit form */
    role: lockedByManage ?? gate(caller, !self, NOT_YOURSELF_ROLE),
  };
}
