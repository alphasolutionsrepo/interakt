// src/features/access/access-policy.ts

/**
 * Who may hand out which role. Pure functions, so every rule is unit-tested.
 *
 * Nobody gives anyone, themselves included, more than they hold: a caller may give a role, or
 * manage a user holding one, only when every permission that role grants is one of theirs. The
 * built-in Admin role holds every permission, so only an Admin gives it or manages an Admin.
 * (Creating, editing and deleting roles is Admin-only, roles.service.ts.)
 */

import type { UserAccess } from './user-access';
import { mayAssignRole } from './permissions';

import { AppError } from '@/shared/errors/app-error';


export interface RoleShape {
  isBuiltIn: boolean;
  permissions: readonly string[];
}

export class AccessDeniedError extends AppError {
  constructor(message: string) {
    super(message, { code: 'FORBIDDEN', status: 403 });
    this.name = 'AccessDeniedError';
  }
}

/** Throws unless the caller may give this role, or act on a user holding it (`action` names which). */
export function assertMayAssignRole(caller: UserAccess, role: RoleShape, action: string): void {
  if (mayAssignRole(caller, role)) return;
  throw new AccessDeniedError(
    role.isBuiltIn
      ? `Only an Admin can ${action} the Admin role.`
      : `You can't ${action} a role with permissions your own role doesn't have.`,
  );
}
