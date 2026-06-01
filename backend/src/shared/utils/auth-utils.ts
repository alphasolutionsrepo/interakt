// src/shared/auth/auth-utils.ts

import { auth } from '@/features/auth/auth.api.handlers';
import { redirect } from 'next/navigation';
import type { Session } from 'next-auth';
import bcrypt from 'bcryptjs'

/**
 * Get current session (returns null if not authenticated)
 */
export async function getSession(): Promise<Session | null> {
  return await auth();
}

/**
 * Get current user (returns null if not authenticated)
 */
export async function getCurrentUser() {
  const session = await auth();
  return session?.user ?? null;
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
 * Require authentication - redirects to login if not authenticated
 * Use in Server Components and API routes
 */
export async function requireAuth() {
  const session = await auth();
  if (!session?.user) {
    redirect('/login');
  }
  return session.user;
}

/**
 * Require specific role - redirects if user doesn't have role
 */
export async function requireRole(requiredRole: 'user' | 'admin' | 'moderator') {
  const user = await requireAuth();

  if (user.role !== requiredRole) {
    redirect('/unauthorized');
  }

  return user;
}

/**
 * Check if user has role (returns boolean, doesn't redirect)
 */
export async function hasRole(requiredRole: 'user' | 'admin' | 'moderator'): Promise<boolean> {
  const session = await auth();
  return session?.user?.role === requiredRole;
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