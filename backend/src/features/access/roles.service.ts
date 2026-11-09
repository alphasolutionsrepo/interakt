// src/features/access/roles.service.ts

/**
 * Roles: list, create, edit, delete, with the rules from access-policy.ts applied.
 * The built-in Admin role can't be edited or deleted.
 */

import 'server-only';


import { AccessDeniedError, assertHoldsPermissions, assertHoldsRole } from './access-policy';
import type { UserAccess } from './user-access';
import { conflictOnConstraint } from './constraint-errors';
import * as repository from './roles.repository';
import type { CreateRoleInput, UpdateRoleInput } from './roles.validations';

import { ConflictError, NotFoundError } from '@/shared/errors/app-error';

export const listRoles = repository.listRoles;

async function editableRole(id: string) {
  const role = await repository.getRole(id);
  if (!role) throw new NotFoundError('Role not found');
  if (role.isBuiltIn) throw new AccessDeniedError('The built-in Admin role can\'t be changed or deleted.');
  return role;
}

export async function createRole(caller: UserAccess, input: CreateRoleInput) {
  assertHoldsPermissions(caller, input.permissions, 'create');
  if (await repository.roleNameTaken(input.name)) throw new ConflictError(`A role named "${input.name}" already exists`);
  return conflictOnConstraint(
    () => repository.createRole({ name: input.name, description: input.description ?? null, permissions: input.permissions }),
    { unique: `A role named "${input.name}" already exists` },
  );
}

export async function updateRole(caller: UserAccess, id: string, input: UpdateRoleInput) {
  const role = await editableRole(id);
  assertHoldsRole(caller, role, 'edit');
  if (input.permissions) assertHoldsPermissions(caller, input.permissions, 'edit');
  if (input.name && (await repository.roleNameTaken(input.name, id))) {
    throw new ConflictError(`A role named "${input.name}" already exists`);
  }
  const updated = await conflictOnConstraint(() => repository.updateRole(id, input), { unique: `A role named "${input.name}" already exists` });
  // Deleted by someone else since it was read
  if (!updated) throw new NotFoundError('Role not found');
  return updated;
}

export async function deleteRole(caller: UserAccess, id: string) {
  const role = await editableRole(id);
  assertHoldsRole(caller, role, 'delete');
  await repository.deleteRole(id);
}
