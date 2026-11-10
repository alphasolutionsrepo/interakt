// src/shared/auth/auth-utils.ts

import bcrypt from 'bcryptjs'
import type { Session } from 'next-auth';

import { auth } from '@/features/auth/auth.api.handlers';

/**
 * Get current session (returns null if not authenticated)
 */
export async function getSession(): Promise<Session | null> {
  return await auth();
}

/**
 * Get user ID (returns null if not authenticated)
 */
export async function getCurrentUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

/**
 * Get user email (returns null if not authenticated)
 */
export async function getCurrentUserEmail(): Promise<string | null> {
  const session = await auth();
  return session?.user?.email ?? null;
}

/**
 * Check if user is authenticated (returns boolean, doesn't redirect)
 */
export async function isAuthenticated(): Promise<boolean> {
  const session = await auth();
  return !!session?.user;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12)
}

export async function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
  return bcrypt.compare(password, hashedPassword)
}

export async function getCurrentSessionAndUser() {
  const session = await auth()
  return { session, user: session?.user }
}

export function validatePassword(password: string): { isValid: boolean; errors: string[] } {
  const errors: string[] = []

  if (password.length < 6) {
    errors.push('Password must be at least 6 characters long')
  }

  if (!/(?=.*[a-z])/.test(password)) {
    errors.push('Password must contain at least one lowercase letter')
  }

  if (!/(?=.*[A-Z])/.test(password)) {
    errors.push('Password must contain at least one uppercase letter')
  }

  if (!/(?=.*\d)/.test(password)) {
    errors.push('Password must contain at least one number')
  }

  return {
    isValid: errors.length === 0,
    errors
  }
}