// src/features/auth/auth.service.ts

import { createLogger } from '@/shared/logger/logger';
import * as repository from './auth.repository';
import { hashPassword, verifyPassword } from '@/shared/utils/auth-utils';
import type { CreateUserDTO, UpdateUserDTO } from './auth.validations';
import type { User } from '@/db/schema/users.schema';

const logger = createLogger('auth-service');

// ============================================================================
// CREATE OPERATIONS
// ============================================================================

/**
 * Create a new user with hashed password
 */
export async function createUser(input: CreateUserDTO): Promise<Omit<User, 'password'>> {
  try {
    // Check if email already exists
    const exists = await repository.emailExists(input.email);
    if (exists) {
      throw new Error(`User with email ${input.email} already exists`);
    }

    // Hash password
    const hashedPassword = await hashPassword(input.password);

    // Create user
    const newUser = await repository.createUser({
      email: input.email.toLowerCase(),
      password: hashedPassword,
      firstName: input.firstName ?? null,
      lastName: input.lastName ?? null,
      role: input.role ?? 'user',
      isActive: input.isActive ?? true,
    });

    logger.info('Created user via service', {
      userId: newUser.id,
      email: newUser.email,
      role: newUser.role,
    });

    // Return user without password
    const { password: _, ...userWithoutPassword } = newUser;
    return userWithoutPassword;
  } catch (error) {
    logger.error('Failed to create user', error as Error);
    throw error;
  }
}

// ============================================================================
// READ OPERATIONS
// ============================================================================

/**
 * Get user by email (without password)
 */
export async function getUserByEmail(email: string): Promise<Omit<User, 'password'> | null> {
  try {
    const foundUser = await repository.getUserByEmail(email);
    if (!foundUser) {
      return null;
    }

    const { password: _, ...userWithoutPassword } = foundUser;
    return userWithoutPassword;
  } catch (error) {
    logger.error('Failed to get user by email', error as Error);
    throw error;
  }
}

/**
 * Get user by ID (without password)
 */
export async function getUserById(id: string): Promise<Omit<User, 'password'> | null> {
  try {
    const foundUser = await repository.getUserById(id);
    if (!foundUser) {
      return null;
    }

    const { password: _, ...userWithoutPassword } = foundUser;
    return userWithoutPassword;
  } catch (error) {
    logger.error('Failed to get user by ID', error as Error);
    throw error;
  }
}

/**
 * Get user for authentication (includes password for verification)
 * INTERNAL USE ONLY - Never expose this to API
 */
export async function getUserForAuth(email: string): Promise<User | null> {
  try {
    return await repository.getActiveUserByEmail(email);
  } catch (error) {
    logger.error('Failed to get user for auth', error as Error);
    throw error;
  }
}

/**
 * List all users (without passwords)
 */
export async function listUsers(): Promise<Omit<User, 'password'>[]> {
  try {
    const users = await repository.listUsers();
    return users.map(({ password: _, ...user }) => user);
  } catch (error) {
    logger.error('Failed to list users', error as Error);
    throw error;
  }
}

// ============================================================================
// UPDATE OPERATIONS
// ============================================================================

/**
 * Update user
 */
export async function updateUser(
  id: string,
  input: UpdateUserDTO
): Promise<Omit<User, 'password'>> {
  try {
    // If email is being updated, check uniqueness
    if (input.email) {
      const existingUser = await repository.getUserByEmail(input.email);
      if (existingUser && existingUser.id !== id) {
        throw new Error(`Email ${input.email} is already in use`);
      }
    }

    const updatedUser = await repository.updateUser(id, {
      ...input,
      email: input.email?.toLowerCase(),
    });

    logger.info('Updated user via service', { userId: id });

    const { password: _, ...userWithoutPassword } = updatedUser;
    return userWithoutPassword;
  } catch (error) {
    logger.error('Failed to update user', error as Error);
    throw error;
  }
}

/**
 * Change user password
 */
export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string
): Promise<void> {
  try {
    // Get user with password
    const user = await repository.getUserById(userId);
    if (!user || !user.password) {
      throw new Error('User not found');
    }

    // Verify current password
    const isValid = await verifyPassword(currentPassword, user.password);
    if (!isValid) {
      throw new Error('Current password is incorrect');
    }

    // Hash and update new password
    const hashedPassword = await hashPassword(newPassword);
    await repository.updateUserPassword(userId, hashedPassword);

    logger.info('Changed user password', { userId });
  } catch (error) {
    logger.error('Failed to change password', error as Error);
    throw error;
  }
}

/**
 * Deactivate user
 */
export async function deactivateUser(id: string): Promise<void> {
  try {
    await repository.deactivateUser(id);
    logger.info('Deactivated user via service', { userId: id });
  } catch (error) {
    logger.error('Failed to deactivate user', error as Error);
    throw error;
  }
}

/**
 * Activate user
 */
export async function activateUser(id: string): Promise<void> {
  try {
    await repository.activateUser(id);
    logger.info('Activated user via service', { userId: id });
  } catch (error) {
    logger.error('Failed to activate user', error as Error);
    throw error;
  }
}

// ============================================================================
// AUTHENTICATION HELPERS
// ============================================================================

/**
 * Authenticate user with email and password
 * Returns user if credentials are valid, null otherwise
 */
export async function authenticateUser(
  email: string,
  password: string
): Promise<Omit<User, 'password'> | null> {
  try {
    const user = await getUserForAuth(email);

    if (!user || !user.password) {
      logger.warn('Authentication failed: user not found or no password', { email });
      return null;
    }

    const isPasswordValid = await verifyPassword(password, user.password);

    if (!isPasswordValid) {
      logger.warn('Authentication failed: invalid password', { email });
      return null;
    }

    logger.info('User authenticated successfully', { userId: user.id, email });

    const { password: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
  } catch (error) {
    logger.error('Authentication error', error as Error);
    return null;
  }
}