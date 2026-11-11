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

import { mayAssignRole, roleRefusal } from '@/features/access/permissions';
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


/** Whether the roles list (and so each role's permissions) is in */
export type RolesState = 'loading' | 'failed' | 'ready';

const ROLES_FAILED = "Couldn't load the roles to check this. Reload the page to try again.";

const gate = (caller: Caller, allowed: boolean, reason: string): ActionGate =>
  caller.isLoading ? { state: 'loading' } : allowed ? { state: 'allowed' } : { state: 'locked', reason };

/** Every role, each with why it can't be given when it can't. */
export function roleChoices(caller: Caller, roles: RoleInfo[]) {
  return roles.map((r) => ({ id: r.id, name: r.name, lockedReason: caller.isLoading || mayAssignRole(caller, r) ? undefined : roleRefusal('give', r) }));
}

/** The gate on managing a user whose role isn't in the list: an Admin manages anyone; others wait or are told why. */
function unknownRoleGate(caller: Caller, rolesState: RolesState): ActionGate {
  if (caller.isAdmin || caller.isLoading) return gate(caller, true, '');
  if (rolesState === 'loading') return { state: 'loading' };
  return { state: 'locked', reason: ROLES_FAILED };
}

/** The gates on one user's row and edit form; `roles` gives their role's permissions. */
export function userGates(caller: Caller, user: { id: string; roleId: string }, roles: RoleInfo[], rolesState: RolesState = 'ready') {
  const self = user.id === caller.userId;
  const role = roles.find((r) => r.id === user.roleId);
  const manage = self ? gate(caller, true, '')
    : role ? gate(caller, mayAssignRole(caller, role), roleRefusal('manage', role))
    : unknownRoleGate(caller, rolesState);
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

/**
 * The gate on the role picker in the user form: an existing user's role gate, or, for a new
 * user, a wait while access loads (roleChoices locks nothing then, so nothing is offered early).
 */
export function rolePickerGate(caller: Caller, user: { id: string; roleId: string } | undefined, roles: RoleInfo[], rolesState: RolesState): ActionGate | undefined {
  if (user) return userGates(caller, user, roles, rolesState).role;
  return caller.isLoading ? { state: 'loading' } : undefined;
}
