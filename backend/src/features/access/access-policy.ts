// src/features/access/access-policy.ts

/**
 * Who may hand out which role. Pure functions, so every rule is unit-tested.
 *
 * A user manager may give any role except the built-in Admin, and manage any user who isn't an
 * Admin. Only an Admin makes someone an Admin or manages an Admin. (Creating, editing and
 * deleting roles is Admin-only, roles.service.ts.)
 */

import type { UserAccess } from './user-access';
import { mayAssignRole } from './permissions';

import { AppError } from '@/shared/errors/app-error';


export interface RoleShape {
  isBuiltIn: boolean;
}

export class AccessDeniedError extends AppError {
  constructor(message: string) {
    super(message, { code: 'FORBIDDEN', status: 403 });
    this.name = 'AccessDeniedError';
  }
}

/** Throws unless the caller may give this role, or act on a user holding it (`action` names which). */
export function assertMayAssignRole(caller: UserAccess, role: RoleShape, action: string): void {
  if (!mayAssignRole(caller, role)) throw new AccessDeniedError(`Only an Admin can ${action} the Admin role.`);
}
