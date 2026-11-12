// src/features/search-experience/search-experience.admin.handlers.ts

/**
 * Search Experience Admin API Handlers
 *
 * Handles HTTP request/response for search experience management.
 * These endpoints require session authentication (admin users).
 */

import { tokensFor } from '@/features/access/access-tokens';
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
  searchExperienceExternalSourceInputSchema,
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

    if (err instanceof service.ValidationError) {
      return apiResponse.refused(error, 'BAD_REQUEST', { operation: 'createSearchExperience' });
    }

    if (err instanceof service.NotFoundError) {
      return apiResponse.refused(error, 'NOT_FOUND', { operation: 'createSearchExperience' });
    }

    return apiResponse.error(err, undefined, { operation: 'createSearchExperience' });
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

    const pagination = {
      page: result.page,
      pageSize: result.pageSize,
      totalPages: result.totalPages,
      totalItems: result.total,
      counts: result.counts,
    };
    return apiResponse.successWithPagination(await tokensFor(result.items, 'search-experiences:edit'), pagination);
  } catch (error) {
    return apiResponse.error(error as Error, undefined, { operation: 'listSearchExperiences' });
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

    return apiResponse.success(await tokensFor(experience, 'search-experiences:edit'));
  } catch (error) {
    const err = error as Error;

    if (err instanceof service.NotFoundError) {
      return apiResponse.refused(error, 'NOT_FOUND', { operation: 'getSearchExperience' });
    }

    return apiResponse.error(err, undefined, { operation: 'getSearchExperience' });
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
      return apiResponse.refused(error, 'NOT_FOUND', { operation: 'updateSearchExperience' });
    }

    if (err instanceof service.ValidationError) {
      return apiResponse.refused(error, 'BAD_REQUEST', { operation: 'updateSearchExperience' });
    }

    return apiResponse.error(err, undefined, { operation: 'updateSearchExperience' });
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
      return apiResponse.refused(error, 'NOT_FOUND', { operation: 'deleteSearchExperience' });
    }

    return apiResponse.error(err, undefined, { operation: 'deleteSearchExperience' });
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
    return apiResponse.error(error as Error, undefined, { operation: 'checkSearchExperienceSlug' });
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
      return apiResponse.refused(error, 'NOT_FOUND', { operation: 'regenerateSearchExperienceAccessToken' });
    }

    return apiResponse.error(err, undefined, { operation: 'regenerateSearchExperienceAccessToken' });
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
      return apiResponse.refused(error, 'NOT_FOUND', { operation: 'addIndex' });
    }

    if (err instanceof service.ValidationError) {
      return apiResponse.refused(error, 'BAD_REQUEST', { operation: 'addIndex' });
    }

    return apiResponse.error(err, undefined, { operation: 'addIndex' });
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
      return apiResponse.refused(error, 'NOT_FOUND', { operation: 'updateIndex' });
    }

    return apiResponse.error(err, undefined, { operation: 'updateIndex' });
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
      return apiResponse.refused(error, 'NOT_FOUND', { operation: 'removeIndex' });
    }

    if (err instanceof service.ValidationError) {
      return apiResponse.refused(error, 'BAD_REQUEST', { operation: 'removeIndex' });
    }

    return apiResponse.error(err, undefined, { operation: 'removeIndex' });
  }
}

// ============================================================================
// EXTERNAL SOURCES
// ============================================================================

/**
 * POST /api/search-experiences/:id/external-sources
 */
export async function handleAddExternalSource(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return apiResponse.unauthorized('You must be logged in');
    }

    const params = await context.params;
    const validation = searchExperienceExternalSourceInputSchema.safeParse(await request.json());
    if (!validation.success) {
      return apiResponse.validationError(validation.error);
    }

    const experience = await service.addExternalSource(
      params.id,
      { ...validation.data, dataSourceId: validation.data.dataSourceId as string },
      userId
    );
    return apiResponse.success(experience, 201);
  } catch (error) {
    const err = error as Error;
    if (err instanceof service.NotFoundError) return apiResponse.refused(error, 'NOT_FOUND', { operation: 'addExternalSource' });
    if (err instanceof service.ValidationError) return apiResponse.refused(error, 'BAD_REQUEST', { operation: 'addExternalSource' });
    return apiResponse.error(err, undefined, { operation: 'addExternalSource' });
  }
}

/**
 * DELETE /api/search-experiences/:id/external-sources/:dataSourceId
 */
export async function handleRemoveExternalSource(
  _request: NextRequest,
  context: { params: Promise<{ id: string; dataSourceId: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return apiResponse.unauthorized('You must be logged in');
    }

    const params = await context.params;
    const experience = await service.removeExternalSource(params.id, params.dataSourceId, userId);
    return apiResponse.success(experience);
  } catch (error) {
    const err = error as Error;
    if (err instanceof service.NotFoundError) return apiResponse.refused(error, 'NOT_FOUND', { operation: 'removeExternalSource' });
    if (err instanceof service.ValidationError) return apiResponse.refused(error, 'BAD_REQUEST', { operation: 'removeExternalSource' });
    return apiResponse.error(err, undefined, { operation: 'removeExternalSource' });
  }
}
