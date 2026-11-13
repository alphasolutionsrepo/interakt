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
import { createLogger } from '@/shared/logger/logger';

const logger = createLogger('access-handlers');

type IdContext = { params: Promise<{ id: string }> };

/**
 * GET /api/me/access: what the signed-in user may do (drives the admin UI), and `areas`: the
 * feature areas that are on for the installation (feature-switches), so the UI hides the rest;
 * `pinnedOff` (the deployment setting turns them off) and `switchedOff` (an Admin did), so the UI
 * can name why an area is off. An area on neither list is off only because what it needs is off.
 * If the switches can't be read the answer still carries the role and permissions but no
 * `areas` (never a guessed list): the UI then shows every area, and the server still refuses
 * a switched-off route itself. A failed permission lookup answers 500.
 */
export async function handleGetMyAccess() {
  try {
    const { access, response } = await checkAccess(SIGNED_IN);
    if (response) return response;
    let areas: string[] | undefined;
    let pinnedOff: string[] | undefined;
    let switchedOff: string[] | undefined;
    try {
      const switches = await listFeatureSwitches();
      areas = switches.filter((s) => s.on).map((s) => s.id);
      pinnedOff = switches.filter((s) => s.pinnedOff === true).map((s) => s.id);
      switchedOff = switches.filter((s) => s.switchedOn === false).map((s) => s.id);
    } catch (error) {
      logger.error('Could not read the feature switches; answering without areas', { error });
    }
    return apiResponse.success({
      userId: access.userId,
      role: { id: access.roleId, name: access.roleName, isAdmin: access.isAdmin },
      permissions: [...access.permissions],
      ...(areas ? { areas, pinnedOff, switchedOff } : {}),
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
