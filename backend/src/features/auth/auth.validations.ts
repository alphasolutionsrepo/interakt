// src/features/auth/auth.validation.ts

import { z } from 'zod';

/**
 * Password validation rules
 * - Minimum 8 characters (increased from 6 for better security)
 * - At least one lowercase letter
 * - At least one uppercase letter
 * - At least one number
 */
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters long')
  .regex(/(?=.*[a-z])/, 'Password must contain at least one lowercase letter')
  .regex(/(?=.*[A-Z])/, 'Password must contain at least one uppercase letter')
  .regex(/(?=.*\d)/, 'Password must contain at least one number');

/**
 * Email validation
 */
export const emailSchema = z
  .string()
  .email('Invalid email address')
  .max(64, 'Email must be 64 characters or less')
  .toLowerCase();

/**
 * Create user schema (for admin/seed purposes)
 */
export const createUserSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  firstName: z.string()
    .min(1, 'First name is required')
    .max(64, 'First name must be 64 characters or less')
    .optional(),
  lastName: z.string()
    .min(1, 'Last name is required')
    .max(64, 'Last name must be 64 characters or less')
    .optional(),
  role: z.enum(['user', 'admin', 'moderator']).default('user'),
  isActive: z.boolean().default(true),
});

/**
 * Login credentials schema
 */
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
});

/**
 * Update user schema (partial updates)
 */
export const updateUserSchema = z.object({
  email: emailSchema.optional(),
  firstName: z.string().max(64).optional(),
  lastName: z.string().max(64).optional(),
  role: z.enum(['user', 'admin', 'moderator']).optional(),
  isActive: z.boolean().optional(),
});

/**
 * Change password schema
 */
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: passwordSchema,
  confirmPassword: z.string(),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});

// Export inferred types
export type CreateUserDTO = z.infer<typeof createUserSchema>;
export type LoginDTO = z.infer<typeof loginSchema>;
export type UpdateUserDTO = z.infer<typeof updateUserSchema>;
export type ChangePasswordDTO = z.infer<typeof changePasswordSchema>;