// src/features/access/user-access.service.ts

/**
 * The rules for acting on another user's account: changing their role, activating or
 * deactivating them, resetting their password, reading their profile.
 *
 *  - Acting on yourself needs no permission for your own profile and password, but you can't
 *    change your own role or deactivate yourself (another user manager does that).
 *  - Acting on someone else needs users:manage AND holding everything their role grants
 *    (so only an Admin manages an Admin).
 *  - A new role must also be one the caller holds; the last active Admin can't lose it
 *    (roles.repository.updateUserAccess).
 */

import 'server-only';


import { AccessDeniedError, assertMayAssignRole } from './access-policy';
import { conflictOnConstraint } from './constraint-errors';
import * as roles from './roles.repository';
import { can, type UserAccess } from './user-access';

import { getUserById } from '@/features/auth/auth.repository';
import { NotFoundError, ValidationError } from '@/shared/errors/app-error';

async function roleOrFail(roleId: string) {
  const role = await roles.getRole(roleId);
  if (!role) throw new ValidationError('That role doesn\'t exist', [{ field: 'roleId', message: 'Unknown role' }]);
  return role;
}

/** Throws unless the caller may manage this other user's account. Returns the target user. */
export async function assertCanManageUser(caller: UserAccess, targetUserId: string) {
  // Refused before the lookup, so a caller without users:manage can't learn which ids exist
  if (targetUserId !== caller.userId && !can(caller, 'users:manage')) {
    throw new AccessDeniedError('You can only manage your own account.');
  }
  const target = await getUserById(targetUserId);
  if (!target) throw new NotFoundError('User not found');
  if (target.id === caller.userId) return target;
  assertMayAssignRole(caller, await roleOrFail(target.roleId), 'manage');
  return target;
}

/** A role the caller may give to a new or existing user. */
export async function assertCanAssignRole(caller: UserAccess, roleId: string) {
  if (!can(caller, 'users:manage')) throw new AccessDeniedError('Your role doesn\'t allow managing users.');
  assertMayAssignRole(caller, await roleOrFail(roleId), 'give');
}

type AccessChanges = { roleId?: string; isActive?: boolean };

/** The changes that differ from what the user has now (the edit form sends the current role back). */
function realChanges(target: { roleId: string; isActive: boolean | null }, changes: AccessChanges): AccessChanges {
  return {
    roleId: changes.roleId !== undefined && changes.roleId !== target.roleId ? changes.roleId : undefined,
    isActive: changes.isActive !== undefined && changes.isActive !== target.isActive ? changes.isActive : undefined,
  };
}

/**
 * Throws unless the caller may make these role / active changes (no write). Returns the
 * changes that differ from the user's current values; values equal to the current ones are
 * not changes and need no permission.
 */
export async function assertCanChangeUserAccess(
  caller: UserAccess,
  targetUserId: string,
  changes: AccessChanges,
): Promise<AccessChanges> {
  // Someone else's account needs the right to manage it, even when nothing would change
  const target = await assertCanManageUser(caller, targetUserId);
  const real = realChanges(target, changes);
  if (real.roleId === undefined && real.isActive === undefined) return real;
  if (targetUserId === caller.userId) {
    throw new AccessDeniedError('You can\'t change your own role or deactivate yourself. Ask another user manager.');
  }
  if (real.roleId !== undefined) await assertCanAssignRole(caller, real.roleId);
  return real;
}

/** Save checked role / active changes and profile fields in one write (refusing a last-Admin loss). */
export async function writeUserChanges(
  targetUserId: string,
  changes: AccessChanges,
  profile: Parameters<typeof roles.updateUserAccess>[2] = {},
): Promise<void> {
  const found = await conflictOnConstraint(() => roles.updateUserAccess(targetUserId, changes, profile), {
    foreignKey: 'That role was just deleted. Choose another role.',
  });
  if (!found) throw new NotFoundError('User not found');
}

/** Check, then make, role / active changes (activate, deactivate). */
export async function changeUserAccess(caller: UserAccess, targetUserId: string, changes: AccessChanges): Promise<void> {
  const real = await assertCanChangeUserAccess(caller, targetUserId, changes);
  if (real.roleId === undefined && real.isActive === undefined) return;
  await writeUserChanges(targetUserId, real);
}
