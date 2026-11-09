// src/features/auth/users.api.handlers.ts

/**
 * User Management Feature - API Handlers
 * HTTP request/response handling, validation, and error handling for user CRUD operations.
 *
 * Routes gate these with withPermission (users:manage, or signed-in for a user's own
 * profile and password). The rules for acting on another user, assigning roles and keeping
 * one active Admin live in features/access/user-access.service.ts.
 */

import { NextRequest } from 'next/server';

import * as service from './auth.service';
import {
  createUserSchema,
  updateUserSchema,
  changePasswordSchema,
} from './auth.validations';

import { checkAccess, SIGNED_IN } from '@/features/access/route-guard';
import {
  assertCanAssignRole,
  assertCanChangeUserAccess,
  assertCanManageUser,
  changeUserAccess,
} from '@/features/access/user-access.service';
import { apiResponse } from '@/shared/api/response';
import { createLogger } from '@/shared/logger/logger';


const logger = createLogger('users-handlers');

// ============================================================================
// USER: CREATE HANDLERS
// ============================================================================

/**
 * POST /api/users
 * Create a new user with a role the caller holds
 */
export async function handleCreateUser(request: NextRequest) {
  try {
    const { access, response } = await checkAccess('users:manage');
    if (response) return response;

    const body = await request.json();
    const validation = createUserSchema.safeParse(body);

    if (!validation.success) {
      return apiResponse.validationError(validation.error);
    }

    await assertCanAssignRole(access, validation.data.roleId);
    const user = await service.createUser(validation.data);

    logger.info('Created user via API', {
      newUserId: user.id,
      email: user.email,
      createdBy: access.userId,
    });

    return apiResponse.success(user, 201);
  } catch (error) {
    const err = error as Error;

    if (err.message.includes('already exists')) {
      return apiResponse.refused(error, 'BAD_REQUEST', { operation: 'createUser' });
    }

    return apiResponse.error(err, undefined, { operation: 'createUser' });
  }
}

// ============================================================================
// USER: READ HANDLERS
// ============================================================================

/**
 * GET /api/users
 * List all users with their role (route requires users:manage)
 */
export async function handleListUsers(_request: NextRequest) {
  try {
    const { access, response } = await checkAccess('users:manage');
    if (response) return response;

    const users = await service.listUsers();

    logger.info('Listed users via API', {
      count: users.length,
      requestedBy: access.userId,
    });

    return apiResponse.success(users);
  } catch (error) {
    const err = error as Error;
    return apiResponse.error(err, undefined, { operation: 'listUsers' });
  }
}

/**
 * GET /api/users/[id]
 * A user's own profile, or another user's for a user manager who holds their role
 */
export async function handleGetUser(_request: NextRequest, userId: string) {
  try {
    const { access, response } = await checkAccess(SIGNED_IN);
    if (response) return response;

    await assertCanManageUser(access, userId);
    const user = await service.getUserById(userId);

    if (!user) {
      return apiResponse.notFound('User not found');
    }

    logger.info('Retrieved user via API', {
      userId: user.id,
      requestedBy: access.userId,
    });

    return apiResponse.success(user);
  } catch (error) {
    const err = error as Error;
    return apiResponse.error(err, undefined, { operation: 'getUser' });
  }
}

// ============================================================================
// USER: UPDATE HANDLERS
// ============================================================================

/**
 * PUT /api/users/[id]
 * Update a profile (yours, or another user's as a user manager). Changing the role or the
 * active flag needs users:manage and is refused on your own account.
 */
export async function handleUpdateUser(
  request: NextRequest,
  userId: string
) {
  try {
    const { access, response } = await checkAccess(SIGNED_IN);
    if (response) return response;

    const body = await request.json();
    const validation = updateUserSchema.safeParse(body);

    if (!validation.success) {
      return apiResponse.validationError(validation.error);
    }

    const { roleId, isActive, ...profile } = validation.data;
    // Check permissions before writing, so a refused role change leaves the profile as it was.
    // The last-Admin rule is checked inside the role write (a transaction), after the profile write.
    await assertCanManageUser(access, userId);
    await assertCanChangeUserAccess(access, userId, { roleId, isActive });
    await service.updateUser(userId, profile);
    await changeUserAccess(access, userId, { roleId, isActive });
    const updatedUser = await service.getUserById(userId);
    if (!updatedUser) return apiResponse.notFound('User not found');

    logger.info('Updated user via API', {
      userId: updatedUser.id,
      updatedBy: access.userId,
    });

    return apiResponse.success(updatedUser);
  } catch (error) {
    const err = error as Error;

    if (err.message.includes('already in use')) {
      return apiResponse.refused(error, 'BAD_REQUEST', { operation: 'updateUser' });
    }

    return apiResponse.error(err, undefined, { operation: 'updateUser' });
  }
}

/**
 * PATCH /api/users/[id]/activate
 */
export async function handleActivateUser(
  _request: NextRequest,
  userId: string
) {
  try {
    const { access, response } = await checkAccess('users:manage');
    if (response) return response;

    await changeUserAccess(access, userId, { isActive: true });

    logger.info('Activated user via API', {
      userId,
      activatedBy: access.userId,
    });

    return apiResponse.success({ message: 'User activated successfully' });
  } catch (error) {
    const err = error as Error;
    return apiResponse.error(err, undefined, { operation: 'activateUser' });
  }
}

/**
 * PATCH /api/users/[id]/deactivate
 * Takes effect on the user's next request: access is read from the database each time.
 */
export async function handleDeactivateUser(
  _request: NextRequest,
  userId: string
) {
  try {
    const { access, response } = await checkAccess('users:manage');
    if (response) return response;

    await changeUserAccess(access, userId, { isActive: false });

    logger.info('Deactivated user via API', {
      userId,
      deactivatedBy: access.userId,
    });

    return apiResponse.success({ message: 'User deactivated successfully' });
  } catch (error) {
    const err = error as Error;
    return apiResponse.error(err, undefined, { operation: 'deactivateUser' });
  }
}

/**
 * POST /api/users/[id]/change-password
 * Your own password, or another user's as a user manager who holds their role
 */
export async function handleChangePassword(
  request: NextRequest,
  userId: string
) {
  try {
    const { access, response } = await checkAccess(SIGNED_IN);
    if (response) return response;

    await assertCanManageUser(access, userId);

    const body = await request.json();
    const validation = changePasswordSchema.safeParse(body);

    if (!validation.success) {
      return apiResponse.validationError(validation.error);
    }

    await service.changePassword(
      userId,
      validation.data.currentPassword,
      validation.data.newPassword
    );

    logger.info('Changed user password via API', {
      userId,
      changedBy: access.userId,
    });

    return apiResponse.success({ message: 'Password changed successfully' });
  } catch (error) {
    const err = error as Error;

    if (err.message.includes('incorrect')) {
      return apiResponse.refused(error, 'BAD_REQUEST', { operation: 'changePassword' });
    }

    return apiResponse.error(err, undefined, { operation: 'changePassword' });
  }
}
