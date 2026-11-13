// src/features/access/access.api.handlers.ts

/**
 * API handlers for the caller's own access and for managing roles.
 * Routes gate these with withPermission (users:manage); the handlers re-read the caller's
 * access, and roles.service.ts lets only an Admin create, change or delete a role.
 */

import 'server-only';

import type { NextRequest } from 'next/server';



import { listRoles, createRole, updateRole, deleteRole } from './roles.service';
import { createRoleSchema, updateRoleSchema } from './roles.validations';
import { checkAccess, SIGNED_IN } from './route-guard';

import { listFeatureSwitches } from '@/features/feature-switches/feature-switches.service';
import { readJsonBody } from '@/shared/api/read-json-body';
import { apiResponse } from '@/shared/api/response';

type IdContext = { params: Promise<{ id: string }> };

/**
 * GET /api/me/access: what the signed-in user may do (drives the admin UI), and `areas`: the
 * feature areas that are on for the installation (feature-switches), so the UI hides the rest.
 * If the switches can't be read the route answers its error, like every other route does
 * (never a guessed list); the UI then treats the lookup as unavailable and hides nothing.
 */
export async function handleGetMyAccess() {
  try {
    const { access, response } = await checkAccess(SIGNED_IN);
    if (response) return response;
    const areas = (await listFeatureSwitches()).filter((s) => s.on).map((s) => s.id);
    return apiResponse.success({
      userId: access.userId,
      role: { id: access.roleId, name: access.roleName, isAdmin: access.isAdmin },
      permissions: [...access.permissions],
      areas,
    });
  } catch (error) {
    return apiResponse.error(error, 500, { operation: 'getMyAccess' });
  }
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
    const parsed = createRoleSchema.safeParse(await readJsonBody(request));
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
    const parsed = updateRoleSchema.safeParse(await readJsonBody(request));
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
