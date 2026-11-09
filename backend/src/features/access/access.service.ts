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

import type { UserAccess } from './user-access';
import { ALL_PERMISSIONS, isPermission, effectivePermissions, } from './permissions';

import { db } from '@/db/index';
import { roles } from '@/db/schema/roles.schema';
import { user } from '@/db/schema/users.schema';


/**
 * The access of an active user, or null when the user doesn't exist or is deactivated.
 * Unknown permission strings stored on a role are ignored, never granted; implied ones
 * (permissions.ts IMPLIED_PERMISSIONS) are added, and ones missing their required companions
 * (REQUIRED_WITH) are left out.
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

  const permissions = row.isBuiltIn ? ALL_PERMISSIONS : effectivePermissions(row.permissions.filter(isPermission));
  return {
    userId: row.userId,
    roleId: row.roleId,
    roleName: row.roleName,
    isAdmin: row.isBuiltIn,
    permissions: new Set(permissions),
  };
}

