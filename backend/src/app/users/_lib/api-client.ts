// app/users/_lib/api-client.ts

import { ApiError, handleApiResponse } from '@/shared/api/api-error';

/**
 * Users API Client
 *
 * Thin wrapper around fetch() with:
 * - Type safety from src/features/auth
 * - Consistent error handling
 * - No business logic (just HTTP calls)
 */

import type {
  CreateUserDTO,
  UpdateUserDTO,
  ChangePasswordDTO,
} from '@/features/auth/auth.validations';

// User response type (client-safe, no password field)
export type UserResponse = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: 'user' | 'admin' | 'moderator';
  isActive: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
};

// ============================================================================
// Error Handling
// ============================================================================

export { ApiError };


// ============================================================================
// Users API
// ============================================================================

export const usersApi = {
  /**
   * List all users
   */
  list: async (): Promise<UserResponse[]> => {
    const response = await fetch('/api/users');
    return handleApiResponse(response);
  },

  /**
   * Get single user by ID
   */
  getById: async (id: string): Promise<UserResponse> => {
    const response = await fetch(`/api/users/${id}`);
    return handleApiResponse(response);
  },

  /**
   * Create new user
   */
  create: async (data: CreateUserDTO): Promise<UserResponse> => {
    const response = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleApiResponse(response);
  },

  /**
   * Update user
   */
  update: async (id: string, data: UpdateUserDTO): Promise<UserResponse> => {
    const response = await fetch(`/api/users/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleApiResponse(response);
  },

  /**
   * Activate user
   */
  activate: async (id: string): Promise<{ message: string }> => {
    const response = await fetch(`/api/users/${id}/activate`, {
      method: 'PATCH',
    });
    return handleApiResponse(response);
  },

  /**
   * Deactivate user
   */
  deactivate: async (id: string): Promise<{ message: string }> => {
    const response = await fetch(`/api/users/${id}/deactivate`, {
      method: 'PATCH',
    });
    return handleApiResponse(response);
  },

  /**
   * Change password
   */
  changePassword: async (id: string, data: ChangePasswordDTO): Promise<{ message: string }> => {
    const response = await fetch(`/api/users/${id}/change-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleApiResponse(response);
  },
};
