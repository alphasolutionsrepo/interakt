// src/features/access/access.api.handlers.ts

/**
 * API handlers for the caller's own access and for managing roles.
 * Routes gate these with withPermission; the handlers re-read the caller's access for the
 * privilege rules (nobody grants more than they hold).
 */

import 'server-only';

import type { NextRequest } from 'next/server';


import { listRoles, createRole, updateRole, deleteRole } from './roles.service';
import { createRoleSchema, updateRoleSchema } from './roles.validations';
import { checkAccess, SIGNED_IN } from './route-guard';

import { apiResponse } from '@/shared/api/response';

type IdContext = { params: Promise<{ id: string }> };

/** GET /api/me/access: what the signed-in user may do (drives the admin UI). */
export async function handleGetMyAccess() {
  const { access, response } = await checkAccess(SIGNED_IN);
  if (response) return response;
  return apiResponse.success({
    userId: access.userId,
    role: { id: access.roleId, name: access.roleName, isAdmin: access.isAdmin },
    permissions: [...access.permissions],
  });
}

export async function handleListRoles() {
  try {
    return apiResponse.success(await listRoles());
  } catch (error) {
    return apiResponse.error(error, 500, { operation: 'listRoles' });
  }
}

export async function handleCreateRole(request: NextRequest) {
  try {
    const { access, response } = await checkAccess('users:manage');
    if (response) return response;
    const parsed = createRoleSchema.safeParse(await request.json());
    if (!parsed.success) return apiResponse.validationError(parsed.error);
    return apiResponse.success(await createRole(access, parsed.data), 201);
  } catch (error) {
    return apiResponse.error(error, 500, { operation: 'createRole' });
  }
}

export async function handleUpdateRole(request: NextRequest, context: IdContext) {
  try {
    const { access, response } = await checkAccess('users:manage');
    if (response) return response;
    const { id } = await context.params;
    const parsed = updateRoleSchema.safeParse(await request.json());
    if (!parsed.success) return apiResponse.validationError(parsed.error);
    return apiResponse.success(await updateRole(access, id, parsed.data));
  } catch (error) {
    return apiResponse.error(error, 500, { operation: 'updateRole' });
  }
}

export async function handleDeleteRole(_request: NextRequest, context: IdContext) {
  try {
    const { access, response } = await checkAccess('users:manage');
    if (response) return response;
    const { id } = await context.params;
    await deleteRole(access, id);
    return apiResponse.success({ deleted: true });
  } catch (error) {
    return apiResponse.error(error, 500, { operation: 'deleteRole' });
  }
}
