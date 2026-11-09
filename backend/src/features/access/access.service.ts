// src/features/access/access.service.ts

/**
 * What a signed-in user may do, read from the database on every call.
 *
 * The sign-in token only says who the user is. Their role, its permissions and whether the
 * account is still active come from here, so a demotion, a role edit or a deactivation takes
 * effect on the user's next request rather than when their token expires.
 */

import 'server-only';

import { eq } from 'drizzle-orm';

import { ALL_PERMISSIONS, isPermission, withImplied, type Permission } from './permissions';

import { db } from '@/db/index';
import { roles } from '@/db/schema/roles.schema';
import { user } from '@/db/schema/users.schema';


export interface UserAccess {
  userId: string;
  roleId: string;
  roleName: string;
  /** The built-in Admin role: every permission, whatever its row holds. */
  isAdmin: boolean;
  permissions: ReadonlySet<Permission>;
}

/**
 * The access of an active user, or null when the user doesn't exist or is deactivated.
 * Unknown permission strings stored on a role are ignored, never granted; implied ones
 * (permissions.ts IMPLIED_PERMISSIONS) are added.
 */
export async function resolveAccess(userId: string): Promise<UserAccess | null> {
  const [row] = await db
    .select({
      userId: user.id,
      isActive: user.isActive,
      roleId: roles.id,
      roleName: roles.name,
      isBuiltIn: roles.isBuiltIn,
      permissions: roles.permissions,
    })
    .from(user)
    .innerJoin(roles, eq(user.roleId, roles.id))
    .where(eq(user.id, userId))
    .limit(1);

  if (!row || row.isActive !== true) return null;

  const permissions = row.isBuiltIn ? ALL_PERMISSIONS : withImplied(row.permissions.filter(isPermission));
  return {
    userId: row.userId,
    roleId: row.roleId,
    roleName: row.roleName,
    isAdmin: row.isBuiltIn,
    permissions: new Set(permissions),
  };
}

export function can(access: UserAccess, permission: Permission): boolean {
  return access.permissions.has(permission);
}
