// src/features/ai-experience/ai-experience.api.handlers.ts

import { NextRequest } from 'next/server';
import { apiResponse } from '@/shared/api/response';
import { createLogger } from '@/shared/logger/logger';
import { getCurrentUserId } from '@/shared/utils/auth-utils';
import * as service from './ai-experience.service';
import {
  createAIExperienceSchema,
  updateAIExperienceSchema,
  listAIExperiencesQuerySchema,
  assignToolSchema,
  updateToolAssignmentSchema,
} from './ai-experience.validation';

const logger = createLogger('ai-experience-handlers');

// ============================================================================
// LIST
// ============================================================================

export async function handleListAIExperiences(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return apiResponse.unauthorized();

    const searchParams = Object.fromEntries(request.nextUrl.searchParams);
    const validation = listAIExperiencesQuerySchema.safeParse(searchParams);
    if (!validation.success) {
      return apiResponse.validationError(validation.error);
    }

    const result = await service.listAIExperiences(validation.data);
    return apiResponse.successWithPagination(result.experiences, result.pagination);
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to list AI experiences', err);
    return apiResponse.error(err);
  }
}

// ============================================================================
// CREATE
// ============================================================================

export async function handleCreateAIExperience(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return apiResponse.unauthorized();

    const body = await request.json();
    const validation = createAIExperienceSchema.safeParse(body);
    if (!validation.success) {
      return apiResponse.validationError(validation.error);
    }

    const experience = await service.createAIExperience(validation.data, userId);
    return apiResponse.success(experience, 201);
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to create AI experience', err);
    if (err.message.includes('already exists') || err.message.includes('not found') || err.message.includes('not active')) {
      return apiResponse.badRequest(err.message);
    }
    return apiResponse.error(err);
  }
}

// ============================================================================
// GET BY ID
// ============================================================================

export async function handleGetAIExperience(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return apiResponse.unauthorized();

    const { id } = await context.params;
    const experience = await service.getAIExperienceById(id);
    if (!experience) {
      return apiResponse.notFound('AI Experience not found');
    }

    return apiResponse.success(experience);
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to get AI experience', err);
    return apiResponse.error(err);
  }
}

// ============================================================================
// UPDATE
// ============================================================================

export async function handleUpdateAIExperience(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return apiResponse.unauthorized();

    const { id } = await context.params;
    const body = await request.json();
    const validation = updateAIExperienceSchema.safeParse(body);
    if (!validation.success) {
      return apiResponse.validationError(validation.error);
    }

    const updated = await service.updateAIExperience(id, validation.data, userId);
    if (!updated) {
      return apiResponse.notFound('AI Experience not found');
    }

    return apiResponse.success(updated);
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to update AI experience', err);
    return apiResponse.error(err);
  }
}

// ============================================================================
// DELETE
// ============================================================================

export async function handleDeleteAIExperience(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return apiResponse.unauthorized();

    const { id } = await context.params;
    const deleted = await service.deleteAIExperience(id, userId);
    if (!deleted) {
      return apiResponse.notFound('AI Experience not found');
    }

    return apiResponse.success({ deleted: true });
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to delete AI experience', err);
    return apiResponse.error(err);
  }
}

// ============================================================================
// REGENERATE ACCESS TOKEN
// ============================================================================

export async function handleRegenerateAccessToken(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return apiResponse.unauthorized();

    const { id } = await context.params;
    const updated = await service.regenerateAccessToken(id, userId);
    if (!updated) {
      return apiResponse.notFound('AI Experience not found');
    }

    return apiResponse.success({ accessToken: updated.accessToken });
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to regenerate access token', err);
    return apiResponse.error(err);
  }
}

// ============================================================================
// CHECK SLUG
// ============================================================================

export async function handleCheckSlug(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return apiResponse.unauthorized();

    const slug = request.nextUrl.searchParams.get('slug');
    const excludeId = request.nextUrl.searchParams.get('excludeId') ?? undefined;

    if (!slug) {
      return apiResponse.badRequest('Slug parameter is required');
    }

    const available = await service.isSlugAvailable(slug, excludeId);
    return apiResponse.success({ slug, available });
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to check slug', err);
    return apiResponse.error(err);
  }
}

// ============================================================================
// TOOL ASSIGNMENT
// ============================================================================

export async function handleAssignTool(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return apiResponse.unauthorized();

    const { id } = await context.params;
    const body = await request.json();
    const validation = assignToolSchema.safeParse(body);
    if (!validation.success) {
      return apiResponse.validationError(validation.error);
    }

    const assignment = await service.assignTool(id, validation.data, userId);
    return apiResponse.success(assignment, 201);
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to assign tool', err);
    if (err.message.includes('not found') || err.message.includes('already assigned')) {
      return apiResponse.badRequest(err.message);
    }
    return apiResponse.error(err);
  }
}

export async function handleUpdateToolAssignment(
  request: NextRequest,
  context: { params: Promise<{ id: string; toolId: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return apiResponse.unauthorized();

    const { id, toolId } = await context.params;
    const body = await request.json();
    const validation = updateToolAssignmentSchema.safeParse(body);
    if (!validation.success) {
      return apiResponse.validationError(validation.error);
    }

    const updated = await service.updateToolAssignment(id, toolId, validation.data, userId);
    return apiResponse.success(updated);
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to update tool assignment', err);
    if (err.message.includes('not found')) {
      return apiResponse.notFound(err.message);
    }
    return apiResponse.error(err);
  }
}

export async function handleRemoveToolAssignment(
  _request: NextRequest,
  context: { params: Promise<{ id: string; toolId: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return apiResponse.unauthorized();

    const { id, toolId } = await context.params;
    await service.removeToolAssignment(id, toolId, userId);
    return apiResponse.success({ removed: true });
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to remove tool assignment', err);
    if (err.message.includes('not found')) {
      return apiResponse.notFound(err.message);
    }
    return apiResponse.error(err);
  }
}
