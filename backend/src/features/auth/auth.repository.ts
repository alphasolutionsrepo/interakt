// src/features/auth/auth.repository.ts

import { db } from '@/db/index';
import { user } from '@/db/schema/users.schema';
import { eq, and } from 'drizzle-orm';
import { createLogger } from '@/shared/logger/logger';
import type { User, NewUser } from '@/db/schema/users.schema';

const logger = createLogger('auth-repository');

// ============================================================================
// CREATE OPERATIONS
// ============================================================================

/**
 * Create a new user
 */
export async function createUser(userData: NewUser): Promise<User> {
  try {
    const [newUser] = await db
      .insert(user)
      .values(userData)
      .returning();

    logger.info('Created user', {
      userId: newUser.id,
      email: newUser.email,
      role: newUser.role
    });

    return newUser;
  } catch (error) {
    logger.error('Failed to create user', error as Error, { email: userData.email });
    throw error;
  }
}

// ============================================================================
// READ OPERATIONS
// ============================================================================

/**
 * Get user by email
 */
export async function getUserByEmail(email: string): Promise<User | null> {
  try {
    const [foundUser] = await db
      .select()
      .from(user)
      .where(eq(user.email, email.toLowerCase()))
      .limit(1);

    return foundUser || null;
  } catch (error) {
    logger.error('Failed to get user by email', error as Error, { email });
    throw error;
  }
}

/**
 * Get user by ID
 */
export async function getUserById(id: string): Promise<User | null> {
  try {
    const [foundUser] = await db
      .select()
      .from(user)
      .where(eq(user.id, id))
      .limit(1);

    return foundUser || null;
  } catch (error) {
    logger.error('Failed to get user by ID', error as Error, { userId: id });
    throw error;
  }
}

/**
 * Get active user by email (for login)
 */
export async function getActiveUserByEmail(email: string): Promise<User | null> {
  try {
    const [foundUser] = await db
      .select()
      .from(user)
      .where(
        and(
          eq(user.email, email.toLowerCase()),
          eq(user.isActive, true)
        )
      )
      .limit(1);

    return foundUser || null;
  } catch (error) {
    logger.error('Failed to get active user by email', error as Error, { email });
    throw error;
  }
}

/**
 * List all users (admin only)
 */
export async function listUsers(): Promise<User[]> {
  try {
    const users = await db
      .select()
      .from(user)
      .orderBy(user.createdAt);

    logger.debug('Listed all users', { count: users.length });

    return users;
  } catch (error) {
    logger.error('Failed to list users', error as Error);
    throw error;
  }
}

/**
 * Check if email exists
 */
export async function emailExists(email: string): Promise<boolean> {
  try {
    const [existingUser] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, email.toLowerCase()))
      .limit(1);

    return !!existingUser;
  } catch (error) {
    logger.error('Failed to check email existence', error as Error, { email });
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
  updates: Partial<Omit<User, 'id' | 'createdAt'>>
): Promise<User> {
  try {
    const [updatedUser] = await db
      .update(user)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(user.id, id))
      .returning();

    if (!updatedUser) {
      throw new Error(`User with ID ${id} not found`);
    }

    logger.info('Updated user', { userId: id });

    return updatedUser;
  } catch (error) {
    logger.error('Failed to update user', error as Error, { userId: id });
    throw error;
  }
}

/**
 * Update user password
 */
export async function updateUserPassword(
  id: string,
  hashedPassword: string
): Promise<void> {
  try {
    await db
      .update(user)
      .set({
        password: hashedPassword,
        updatedAt: new Date(),
      })
      .where(eq(user.id, id));

    logger.info('Updated user password', { userId: id });
  } catch (error) {
    logger.error('Failed to update user password', error as Error, { userId: id });
    throw error;
  }
}

/**
 * Deactivate user (soft delete)
 */
export async function deactivateUser(id: string): Promise<void> {
  try {
    await db
      .update(user)
      .set({
        isActive: false,
        updatedAt: new Date(),
      })
      .where(eq(user.id, id));

    logger.info('Deactivated user', { userId: id });
  } catch (error) {
    logger.error('Failed to deactivate user', error as Error, { userId: id });
    throw error;
  }
}

/**
 * Activate user
 */
export async function activateUser(id: string): Promise<void> {
  try {
    await db
      .update(user)
      .set({
        isActive: true,
        updatedAt: new Date(),
      })
      .where(eq(user.id, id));

    logger.info('Activated user', { userId: id });
  } catch (error) {
    logger.error('Failed to activate user', error as Error, { userId: id });
    throw error;
  }
}

// ============================================================================
// DELETE OPERATIONS
// ============================================================================

/**
 * Delete user (hard delete - use with caution)
 */
export async function deleteUser(id: string): Promise<void> {
  try {
    await db
      .delete(user)
      .where(eq(user.id, id));

    logger.warn('Deleted user (hard delete)', { userId: id });
  } catch (error) {
    logger.error('Failed to delete user', error as Error, { userId: id });
    throw error;
  }
}