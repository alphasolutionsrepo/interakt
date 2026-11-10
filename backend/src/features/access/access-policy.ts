// src/features/access/access-policy.ts

/**
 * Who may hand out or change which role. Pure functions, so every rule is unit-tested.
 *
 * The one rule behind all of them: nobody can give anyone, themselves included, more than
 * they hold. A caller may assign a role, or manage a user holding one, only when every
 * permission that role holds is one of theirs. (Creating, editing and deleting roles is
 * Admin-only, roles.service.ts.) The built-in Admin role holds every
 * permission, so only an Admin can assign it or manage a user who has it.
 */

import type { UserAccess } from './user-access';
import { holdsAllOf } from './permissions';

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

export function assertHoldsRole(caller: UserAccess, role: RoleShape, action: string): void {
  if (!holdsAllOf(caller, role)) {
    throw new AccessDeniedError(
      role.isBuiltIn
        ? `Only an Admin can ${action} the Admin role.`
        : `You can't ${action} a role with permissions your own role doesn't have.`,
    );
  }
}
