// src/features/auth/users.api.handlers.ts

/**
 * User Management Feature - API Handlers
 * HTTP request/response handling, validation, and error handling for user CRUD operations
 */

import { NextRequest } from 'next/server';
import { apiResponse } from '@/shared/api/response';
import { createLogger } from '@/shared/logger/logger';
import { getCurrentUser } from '@/shared/utils/auth-utils';
import * as service from './auth.service';
import {
  createUserSchema,
  updateUserSchema,
  changePasswordSchema,
} from './auth.validations';

const logger = createLogger('users-handlers');

// ============================================================================
// USER: CREATE HANDLERS
// ============================================================================

/**
 * POST /api/users
 * Create a new user (admin only)
 */
export async function handleCreateUser(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return apiResponse.unauthorized('You must be logged in to create users');
    }

    // Only admins can create users
    if (currentUser.role !== 'admin') {
      return apiResponse.forbidden('Only administrators can create users');
    }

    const body = await request.json();
    const validation = createUserSchema.safeParse(body);

    if (!validation.success) {
      return apiResponse.validationError(validation.error);
    }

    const user = await service.createUser(validation.data);

    logger.info('Created user via API', {
      newUserId: user.id,
      email: user.email,
      createdBy: currentUser.id,
    });

    return apiResponse.success(user, 201);
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to create user', err);

    if (err.message.includes('already exists')) {
      return apiResponse.badRequest(err.message);
    }

    return apiResponse.error(err);
  }
}

// ============================================================================
// USER: READ HANDLERS
// ============================================================================

/**
 * GET /api/users
 * List all users (admin only)
 */
export async function handleListUsers(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return apiResponse.unauthorized('You must be logged in to view users');
    }

    // Only admins can list users
    if (currentUser.role !== 'admin') {
      return apiResponse.forbidden('Only administrators can view users');
    }

    const users = await service.listUsers();

    logger.info('Listed users via API', {
      count: users.length,
      requestedBy: currentUser.id,
    });

    return apiResponse.success(users);
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to list users', err);
    return apiResponse.error(err);
  }
}

/**
 * GET /api/users/[id]
 * Get a specific user by ID (admin only)
 */
export async function handleGetUser(request: NextRequest, userId: string) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return apiResponse.unauthorized('You must be logged in to view user details');
    }

    // Only admins can view user details (or users can view their own profile)
    if (currentUser.id !== userId && currentUser.role !== 'admin') {
      return apiResponse.forbidden('You can only view your own profile');
    }

    const user = await service.getUserById(userId);

    if (!user) {
      return apiResponse.notFound('User not found');
    }

    logger.info('Retrieved user via API', {
      userId: user.id,
      requestedBy: currentUser.id,
    });

    return apiResponse.success(user);
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to get user', err);
    return apiResponse.error(err);
  }
}

// ============================================================================
// USER: UPDATE HANDLERS
// ============================================================================

/**
 * PUT /api/users/[id]
 * Update a user (admin only, or users can update their own profile)
 */
export async function handleUpdateUser(
  request: NextRequest,
  userId: string
) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return apiResponse.unauthorized('You must be logged in to update users');
    }

    // Users can update their own profile, or admins can update any user
    if (currentUser.id !== userId && currentUser.role !== 'admin') {
      return apiResponse.forbidden('You can only update your own profile');
    }

    const body = await request.json();
    const validation = updateUserSchema.safeParse(body);

    if (!validation.success) {
      return apiResponse.validationError(validation.error);
    }

    // Non-admin users cannot change their own role
    if (currentUser.id === userId && validation.data.role && currentUser.role !== 'admin') {
      return apiResponse.forbidden('You cannot change your own role');
    }

    const updatedUser = await service.updateUser(userId, validation.data);

    logger.info('Updated user via API', {
      userId: updatedUser.id,
      updatedBy: currentUser.id,
    });

    return apiResponse.success(updatedUser);
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to update user', err);

    if (err.message.includes('already in use')) {
      return apiResponse.badRequest(err.message);
    }

    return apiResponse.error(err);
  }
}

/**
 * PATCH /api/users/[id]/activate
 * Activate a user (admin only)
 */
export async function handleActivateUser(
  request: NextRequest,
  userId: string
) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return apiResponse.unauthorized('You must be logged in to activate users');
    }

    // Only admins can activate users
    if (currentUser.role !== 'admin') {
      return apiResponse.forbidden('Only administrators can activate users');
    }

    await service.activateUser(userId);

    logger.info('Activated user via API', {
      userId,
      activatedBy: currentUser.id,
    });

    return apiResponse.success({ message: 'User activated successfully' });
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to activate user', err);
    return apiResponse.error(err);
  }
}

/**
 * PATCH /api/users/[id]/deactivate
 * Deactivate a user (admin only)
 */
export async function handleDeactivateUser(
  request: NextRequest,
  userId: string
) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return apiResponse.unauthorized('You must be logged in to deactivate users');
    }

    // Only admins can deactivate users
    if (currentUser.role !== 'admin') {
      return apiResponse.forbidden('Only administrators can deactivate users');
    }

    // Prevent deactivating yourself
    if (currentUser.id === userId) {
      return apiResponse.badRequest('You cannot deactivate your own account');
    }

    await service.deactivateUser(userId);

    logger.info('Deactivated user via API', {
      userId,
      deactivatedBy: currentUser.id,
    });

    return apiResponse.success({ message: 'User deactivated successfully' });
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to deactivate user', err);
    return apiResponse.error(err);
  }
}

/**
 * POST /api/users/[id]/change-password
 * Change user password
 */
export async function handleChangePassword(
  request: NextRequest,
  userId: string
) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return apiResponse.unauthorized('You must be logged in to change passwords');
    }

    // Users can only change their own password, admins can reset any password
    if (currentUser.id !== userId && currentUser.role !== 'admin') {
      return apiResponse.forbidden('You can only change your own password');
    }

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
      changedBy: currentUser.id,
    });

    return apiResponse.success({ message: 'Password changed successfully' });
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to change password', err);

    if (err.message.includes('incorrect')) {
      return apiResponse.badRequest(err.message);
    }

    return apiResponse.error(err);
  }
}
