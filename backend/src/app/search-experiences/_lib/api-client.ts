// app/search-experiences/_lib/api-client.ts

/**
 * Search Experience API Client
 *
 * Frontend API client for search experience operations.
 */

import type {
  SearchExperience,
  SearchExperienceWithIndexes,
  SearchExperienceListResponse,
  CreateSearchExperienceDTO,
  UpdateSearchExperienceDTO,
  AddIndexDTO,
  UpdateIndexDTO,
  ListSearchExperiencesQueryDTO,
} from '@/features/search-experience/search-experience.client';

// ============================================================================
// ERROR HANDLING
// ============================================================================

export class ApiError extends Error {
  status: number;
  details?: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  const data = await response.json();

  if (!response.ok) {
    throw new ApiError(
      data.error || data.message || 'An error occurred',
      response.status,
      data.details
    );
  }

  return data.data ?? data;
}

// ============================================================================
// Search Experiences API
// ============================================================================

export const searchExperiencesApi = {
  // ==========================================================================
  // CRUD
  // ==========================================================================

  /**
   * Create a new search experience
   */
  create: async (data: CreateSearchExperienceDTO): Promise<SearchExperience> => {
    const response = await fetch('/api/search-experiences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse<SearchExperience>(response);
  },

  /**
   * Get search experience by ID (with indexes)
   */
  getById: async (id: string): Promise<SearchExperienceWithIndexes> => {
    const response = await fetch(`/api/search-experiences/${id}`);
    return handleResponse<SearchExperienceWithIndexes>(response);
  },

  /**
   * List search experiences with pagination
   */
  list: async (query?: Partial<ListSearchExperiencesQueryDTO>): Promise<SearchExperienceListResponse> => {
    const params = new URLSearchParams();
    if (query?.page) params.set('page', String(query.page));
    if (query?.pageSize) params.set('pageSize', String(query.pageSize));
    if (query?.search) params.set('search', query.search);
    if (query?.isActive !== undefined) params.set('isActive', String(query.isActive));
    if (query?.sortBy) params.set('sortBy', query.sortBy);
    if (query?.sortOrder) params.set('sortOrder', query.sortOrder);

    const url = `/api/search-experiences${params.toString() ? `?${params.toString()}` : ''}`;
    const response = await fetch(url);
    const json = await response.json();

    if (!response.ok) {
      throw new ApiError(
        json.error || json.message || 'An error occurred',
        response.status,
        json.details
      );
    }

    // Transform API response format: { data: [...], pagination: {...} }
    // to client format: { items: [...], pagination: {...} }
    return {
      items: json.data || [],
      pagination: json.pagination,
    };
  },

  /**
   * Update a search experience
   */
  update: async (id: string, data: UpdateSearchExperienceDTO): Promise<SearchExperience> => {
    const response = await fetch(`/api/search-experiences/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse<SearchExperience>(response);
  },

  /**
   * Delete a search experience
   */
  delete: async (id: string): Promise<void> => {
    const response = await fetch(`/api/search-experiences/${id}`, {
      method: 'DELETE',
    });
    await handleResponse<void>(response);
  },

  /**
   * Regenerate access token
   */
  regenerateToken: async (id: string): Promise<{ accessToken: string }> => {
    const response = await fetch(`/api/search-experiences/${id}/token`, {
      method: 'POST',
    });
    return handleResponse<{ accessToken: string }>(response);
  },

  /**
   * Check slug availability
   */
  checkSlug: async (slug: string, excludeId?: string): Promise<{ available: boolean }> => {
    const params = new URLSearchParams({ slug });
    if (excludeId) params.set('excludeId', excludeId);
    const response = await fetch(`/api/search-experiences/check-slug?${params.toString()}`);
    return handleResponse<{ available: boolean }>(response);
  },
};

// ============================================================================
// Search Experience Indexes API
// ============================================================================

export const searchExperienceIndexesApi = {
  /**
   * Add an index to a search experience
   */
  add: async (experienceId: string, data: AddIndexDTO): Promise<void> => {
    const response = await fetch(`/api/search-experiences/${experienceId}/indexes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    await handleResponse<void>(response);
  },

  /**
   * Update an index in a search experience
   */
  update: async (experienceId: string, indexId: string, data: UpdateIndexDTO): Promise<void> => {
    const response = await fetch(`/api/search-experiences/${experienceId}/indexes/${indexId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    await handleResponse<void>(response);
  },

  /**
   * Remove an index from a search experience
   */
  remove: async (experienceId: string, indexId: string): Promise<void> => {
    const response = await fetch(`/api/search-experiences/${experienceId}/indexes/${indexId}`, {
      method: 'DELETE',
    });
    await handleResponse<void>(response);
  },
};
