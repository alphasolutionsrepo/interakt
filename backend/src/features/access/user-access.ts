// src/features/access/user-access.ts

/**
 * What a signed-in user may do (the shape access.service.ts reads from the database), and the
 * check against it. No database or server imports, so tests that stub the database read still
 * run this real check.
 */

import type { Permission } from './permissions';

export interface UserAccess {
  userId: string;
  roleId: string;
  roleName: string;
  /** The built-in Admin role: every permission, whatever its row holds. */
  isAdmin: boolean;
  permissions: ReadonlySet<Permission>;
}

export function can(access: UserAccess, permission: Permission): boolean {
  return access.permissions.has(permission);
}
