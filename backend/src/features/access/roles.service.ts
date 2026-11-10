// src/features/access/roles.service.ts

/**
 * Roles: list, create, edit, delete.
 *
 * Only an Admin creates, edits or deletes roles. A user manager who isn't an Admin can read the
 * roles and assign them to users (within what they hold, user-access.service.ts), but not shape
 * them: what each role may do is decided in one place, by an Admin. The built-in Admin role
 * can't be edited or deleted by anyone.
 */

import 'server-only';


import { AccessDeniedError } from './access-policy';
import type { UserAccess } from './user-access';
import { conflictOnConstraint } from './constraint-errors';
import * as repository from './roles.repository';
import type { CreateRoleInput, UpdateRoleInput } from './roles.validations';

import { ConflictError, NotFoundError } from '@/shared/errors/app-error';

export const listRoles = repository.listRoles;

function assertAdmin(caller: UserAccess, action: string): void {
  if (!caller.isAdmin) throw new AccessDeniedError(`Only an Admin can ${action} roles.`);
}

async function editableRole(id: string) {
  const role = await repository.getRole(id);
  if (!role) throw new NotFoundError('Role not found');
  if (role.isBuiltIn) throw new AccessDeniedError('The built-in Admin role can\'t be changed or deleted.');
  return role;
}

export async function createRole(caller: UserAccess, input: CreateRoleInput) {
  assertAdmin(caller, 'create');
  if (await repository.roleNameTaken(input.name)) throw new ConflictError(`A role named "${input.name}" already exists`);
  return conflictOnConstraint(
    () => repository.createRole({ name: input.name, description: input.description ?? null, permissions: input.permissions }),
    { unique: `A role named "${input.name}" already exists` },
  );
}

export async function updateRole(caller: UserAccess, id: string, input: UpdateRoleInput) {
  assertAdmin(caller, 'change');
  await editableRole(id);
  if (input.name && (await repository.roleNameTaken(input.name, id))) {
    throw new ConflictError(`A role named "${input.name}" already exists`);
  }
  const updated = await conflictOnConstraint(() => repository.updateRole(id, input), { unique: `A role named "${input.name}" already exists` });
  // Deleted by someone else since it was read
  if (!updated) throw new NotFoundError('Role not found');
  return updated;
}

export async function deleteRole(caller: UserAccess, id: string) {
  assertAdmin(caller, 'delete');
  await editableRole(id);
  await repository.deleteRole(id);
}
