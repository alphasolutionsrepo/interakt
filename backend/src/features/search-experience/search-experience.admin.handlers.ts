// src/features/search-experience/search-experience.admin.handlers.ts

/**
 * Search Experience Admin API Handlers
 *
 * Handles HTTP request/response for search experience management.
 * These endpoints require session authentication (admin users).
 */

import { NextRequest } from 'next/server';
import { apiResponse } from '@/shared/api/response';
import { createLogger } from '@/shared/logger/logger';
import { getCurrentUserId } from '@/shared/utils/auth-utils';

import * as service from './search-experience.service';
import {
  createSearchExperienceSchema,
  updateSearchExperienceSchema,
  listSearchExperiencesQuerySchema,
  addIndexSchema,
  updateIndexSchema,
} from './search-experience.schemas';

const logger = createLogger('search-experience-admin-handlers');

// ============================================================================
// SEARCH EXPERIENCE: CRUD HANDLERS
// ============================================================================

/**
 * POST /api/search-experiences
 * Create a new search experience
 */
export async function handleCreateSearchExperience(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return apiResponse.unauthorized('You must be logged in');
    }

    const body = await request.json();
    const validation = createSearchExperienceSchema.safeParse(body);

    if (!validation.success) {
      return apiResponse.validationError(validation.error);
    }

    const experience = await service.createSearchExperience(validation.data, userId);

    logger.info('Created search experience via API', {
      experienceId: experience.id,
      name: experience.name,
      slug: experience.slug,
      userId,
    });

    return apiResponse.success(experience, 201);
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to create search experience', err);

    if (err instanceof service.ValidationError) {
      return apiResponse.badRequest(err.message);
    }

    if (err instanceof service.NotFoundError) {
      return apiResponse.notFound(err.message);
    }

    return apiResponse.error(err);
  }
}

/**
 * GET /api/search-experiences
 * List search experiences with pagination and filtering
 */
export async function handleListSearchExperiences(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return apiResponse.unauthorized('You must be logged in');
    }

    const { searchParams } = new URL(request.url);
    const query = Object.fromEntries(searchParams.entries());

    const validation = listSearchExperiencesQuerySchema.safeParse(query);

    if (!validation.success) {
      return apiResponse.validationError(validation.error);
    }

    const result = await service.listSearchExperiences(validation.data, userId);

    return apiResponse.successWithPagination(result.items, {
      page: result.page,
      pageSize: result.pageSize,
      totalPages: result.totalPages,
      totalItems: result.total,
    });
  } catch (error) {
    logger.error('Failed to list search experiences', error as Error);
    return apiResponse.error(error as Error);
  }
}

/**
 * GET /api/search-experiences/:id
 * Get a single search experience by ID with indexes
 */
export async function handleGetSearchExperience(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return apiResponse.unauthorized('You must be logged in');
    }

    const params = await context.params;

    const experience = await service.getSearchExperienceWithIndexes(params.id);

    return apiResponse.success(experience);
  } catch (error) {
    const err = error as Error;

    if (err instanceof service.NotFoundError) {
      return apiResponse.notFound(err.message);
    }

    logger.error('Failed to get search experience', err);
    return apiResponse.error(err);
  }
}

/**
 * PUT /api/search-experiences/:id
 * Update a search experience
 */
export async function handleUpdateSearchExperience(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return apiResponse.unauthorized('You must be logged in');
    }

    const params = await context.params;
    const body = await request.json();

    const validation = updateSearchExperienceSchema.safeParse(body);

    if (!validation.success) {
      return apiResponse.validationError(validation.error);
    }

    const experience = await service.updateSearchExperience(
      params.id,
      validation.data,
      userId
    );

    logger.info('Updated search experience via API', {
      experienceId: experience.id,
      userId,
    });

    return apiResponse.success(experience);
  } catch (error) {
    const err = error as Error;

    if (err instanceof service.NotFoundError) {
      return apiResponse.notFound(err.message);
    }

    if (err instanceof service.ValidationError) {
      return apiResponse.badRequest(err.message);
    }

    logger.error('Failed to update search experience', err);
    return apiResponse.error(err);
  }
}

/**
 * DELETE /api/search-experiences/:id
 * Delete a search experience
 */
export async function handleDeleteSearchExperience(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return apiResponse.unauthorized('You must be logged in');
    }

    const params = await context.params;

    await service.deleteSearchExperience(params.id, userId);

    logger.info('Deleted search experience via API', {
      experienceId: params.id,
      userId,
    });

    return apiResponse.success({ deleted: true });
  } catch (error) {
    const err = error as Error;

    if (err instanceof service.NotFoundError) {
      return apiResponse.notFound(err.message);
    }

    logger.error('Failed to delete search experience', err);
    return apiResponse.error(err);
  }
}

// ============================================================================
// SEARCH EXPERIENCE: SLUG CHECK
// ============================================================================

/**
 * GET /api/search-experiences/check-slug?slug=xxx&excludeId=xxx
 * Check if a slug is available
 */
export async function handleCheckSlug(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return apiResponse.unauthorized('You must be logged in');
    }

    const { searchParams } = new URL(request.url);
    const slug = searchParams.get('slug');
    const excludeId = searchParams.get('excludeId') || undefined;

    if (!slug) {
      return apiResponse.badRequest('Slug is required');
    }

    const available = await service.isSlugAvailable(slug, excludeId);

    return apiResponse.success({ available });
  } catch (error) {
    logger.error('Failed to check slug availability', error as Error);
    return apiResponse.error(error as Error);
  }
}

// ============================================================================
// SEARCH EXPERIENCE: ACCESS TOKEN
// ============================================================================

/**
 * POST /api/search-experiences/:id/token
 * Regenerate access token for a search experience
 */
export async function handleRegenerateAccessToken(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return apiResponse.unauthorized('You must be logged in');
    }

    const params = await context.params;

    const newToken = await service.regenerateAccessToken(params.id, userId);

    logger.info('Regenerated access token via API', {
      experienceId: params.id,
      userId,
    });

    return apiResponse.success({ accessToken: newToken });
  } catch (error) {
    const err = error as Error;

    if (err instanceof service.NotFoundError) {
      return apiResponse.notFound(err.message);
    }

    logger.error('Failed to regenerate access token', err);
    return apiResponse.error(err);
  }
}

// ============================================================================
// SEARCH EXPERIENCE: INDEX MANAGEMENT
// ============================================================================

/**
 * POST /api/search-experiences/:id/indexes
 * Add an index to a search experience
 */
export async function handleAddIndex(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return apiResponse.unauthorized('You must be logged in');
    }

    const params = await context.params;
    const body = await request.json();

    const validation = addIndexSchema.safeParse(body);

    if (!validation.success) {
      return apiResponse.validationError(validation.error);
    }

    const experience = await service.addIndex(params.id, validation.data, userId);

    logger.info('Added index to search experience via API', {
      experienceId: params.id,
      searchIndexId: validation.data.searchIndexId,
      userId,
    });

    return apiResponse.success(experience, 201);
  } catch (error) {
    const err = error as Error;

    if (err instanceof service.NotFoundError) {
      return apiResponse.notFound(err.message);
    }

    if (err instanceof service.ValidationError) {
      return apiResponse.badRequest(err.message);
    }

    logger.error('Failed to add index to search experience', err);
    return apiResponse.error(err);
  }
}

/**
 * PUT /api/search-experiences/:id/indexes/:indexId
 * Update an index in a search experience
 */
export async function handleUpdateIndex(
  request: NextRequest,
  context: { params: Promise<{ id: string; indexId: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return apiResponse.unauthorized('You must be logged in');
    }

    const params = await context.params;
    const body = await request.json();

    const validation = updateIndexSchema.safeParse(body);

    if (!validation.success) {
      return apiResponse.validationError(validation.error);
    }

    const experience = await service.updateIndex(
      params.id,
      params.indexId,
      validation.data,
      userId
    );

    logger.info('Updated index in search experience via API', {
      experienceId: params.id,
      searchIndexId: params.indexId,
      userId,
    });

    return apiResponse.success(experience);
  } catch (error) {
    const err = error as Error;

    if (err instanceof service.NotFoundError) {
      return apiResponse.notFound(err.message);
    }

    logger.error('Failed to update index in search experience', err);
    return apiResponse.error(err);
  }
}

/**
 * DELETE /api/search-experiences/:id/indexes/:indexId
 * Remove an index from a search experience
 */
export async function handleRemoveIndex(
  request: NextRequest,
  context: { params: Promise<{ id: string; indexId: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return apiResponse.unauthorized('You must be logged in');
    }

    const params = await context.params;

    const experience = await service.removeIndex(params.id, params.indexId, userId);

    logger.info('Removed index from search experience via API', {
      experienceId: params.id,
      searchIndexId: params.indexId,
      userId,
    });

    return apiResponse.success(experience);
  } catch (error) {
    const err = error as Error;

    if (err instanceof service.NotFoundError) {
      return apiResponse.notFound(err.message);
    }

    if (err instanceof service.ValidationError) {
      return apiResponse.badRequest(err.message);
    }

    logger.error('Failed to remove index from search experience', err);
    return apiResponse.error(err);
  }
}
