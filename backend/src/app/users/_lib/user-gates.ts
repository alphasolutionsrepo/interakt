// app/users/_lib/user-gates.ts

/**
 * What the signed-in user manager may do on the Users page, from the same rule the server uses
 * (mayAssignRole in features/access/permissions.ts). Pure, so each case is tested on its own.
 *
 *  - A role can be given only when every permission in it is one the manager holds; only an
 *    Admin gives the Admin role.
 *  - A user's account is managed only by someone holding everything that user's role grants.
 *  - Nobody changes their own role or deactivates themselves.
 */

import { mayAssignRole } from '@/features/access/permissions';
import type { ActionGate } from '@/shared/access/ActionControls';

export interface Caller {
  isLoading: boolean;
  isAdmin: boolean;
  userId?: string;
  /** What the caller's role grants */
  permissions: readonly string[];
}

export interface RoleInfo {
  id: string;
  name: string;
  isBuiltIn: boolean;
  permissions: readonly string[];
}

const NOT_YOURSELF_ROLE = "You can't change your own role. Ask another user manager.";
const NOT_YOURSELF_ACTIVE = "You can't deactivate yourself. Ask another user manager.";

/** Why a role can't be given; matches the server's refusal. */
const giveReason = (role: RoleInfo) =>
  role.isBuiltIn ? 'Only an Admin can give the Admin role.' : 'This role has permissions yours doesn’t.';
const manageReason = (role: RoleInfo) =>
  role.isBuiltIn
    ? 'Only an Admin can manage a user with the Admin role.'
    : 'This user’s role has permissions yours doesn’t, so only someone holding them can manage this account.';

const gate = (caller: Caller, allowed: boolean, reason: string): ActionGate =>
  caller.isLoading ? { state: 'loading' } : allowed ? { state: 'allowed' } : { state: 'locked', reason };

/** Every role, each with why it can't be given when it can't. */
export function roleChoices(caller: Caller, roles: RoleInfo[]) {
  return roles.map((r) => ({ id: r.id, name: r.name, lockedReason: mayAssignRole(caller, r) ? undefined : giveReason(r) }));
}

/** The gates on one user's row and edit form; `roles` gives their role's permissions. */
export function userGates(caller: Caller, user: { id: string; roleId: string }, roles: RoleInfo[]) {
  const self = user.id === caller.userId;
  const role = roles.find((r) => r.id === user.roleId);
  // A role not in the list yet (still loading) is treated as one the caller can't manage
  const mayManage = self || (!!role && mayAssignRole(caller, role));
  const manage = gate(caller, mayManage, role ? manageReason(role) : 'Loading the roles…');
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
