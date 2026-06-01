// app/users/_lib/api-client.ts

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

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Handle API response and extract data
 */
async function handleResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get('content-type');

  if (!contentType?.includes('application/json')) {
    if (!response.ok) {
      throw new ApiError(response.status, `HTTP ${response.status}: ${response.statusText}`);
    }
    return response.text() as unknown as T;
  }

  const json = await response.json();

  if (!response.ok) {
    throw new ApiError(
      response.status,
      json.error || json.message || `HTTP ${response.status}`,
      json.code
    );
  }

  // Handle { success: true, data: {...} } format
  if (json.success !== undefined && json.data !== undefined) {
    return json.data;
  }

  // Handle { data: {...} } format
  if (json.data !== undefined) {
    return json.data;
  }

  return json;
}

// ============================================================================
// Users API
// ============================================================================

export const usersApi = {
  /**
   * List all users
   */
  list: async (): Promise<UserResponse[]> => {
    const response = await fetch('/api/users');
    return handleResponse(response);
  },

  /**
   * Get single user by ID
   */
  getById: async (id: string): Promise<UserResponse> => {
    const response = await fetch(`/api/users/${id}`);
    return handleResponse(response);
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
    return handleResponse(response);
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
    return handleResponse(response);
  },

  /**
   * Activate user
   */
  activate: async (id: string): Promise<{ message: string }> => {
    const response = await fetch(`/api/users/${id}/activate`, {
      method: 'PATCH',
    });
    return handleResponse(response);
  },

  /**
   * Deactivate user
   */
  deactivate: async (id: string): Promise<{ message: string }> => {
    const response = await fetch(`/api/users/${id}/deactivate`, {
      method: 'PATCH',
    });
    return handleResponse(response);
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
    return handleResponse(response);
  },
};
