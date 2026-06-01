// src/features/prompt-templates/prompt-template.api.handlers.ts

import { NextRequest } from 'next/server';
import { apiResponse } from '@/shared/api/response';
import { createLogger } from '@/shared/logger/logger';
import { getCurrentUserId } from '@/shared/utils/auth-utils';
import * as service from './prompt-template.service';
import {
  listTemplatesQuerySchema,
  createVersionSchema,
  rollbackSchema,
  setExperienceOverrideSchema,
  removeExperienceOverrideParamsSchema,
} from './prompt-template.validation';

const logger = createLogger('prompt-template-handlers');

// ============================================================================
// LIST TEMPLATES
// ============================================================================

export async function handleListTemplates(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return apiResponse.unauthorized();

    const searchParams = Object.fromEntries(request.nextUrl.searchParams);
    const validation = listTemplatesQuerySchema.safeParse(searchParams);
    if (!validation.success) {
      return apiResponse.validationError(validation.error);
    }

    const { step } = validation.data;
    const templates = step
      ? await service.listTemplatesByStep(step)
      : await service.listTemplates();

    return apiResponse.success(templates);
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to list templates', err);
    return apiResponse.error(err);
  }
}

// ============================================================================
// GET TEMPLATE BY ID
// ============================================================================

export async function handleGetTemplate(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return apiResponse.unauthorized();

    const { id } = await context.params;
    const template = await service.getTemplateById(id);
    if (!template) {
      return apiResponse.notFound('Template not found');
    }

    return apiResponse.success(template);
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to get template', err);
    return apiResponse.error(err);
  }
}

// ============================================================================
// GET SYSTEM DEFAULTS (one per step)
// ============================================================================

export async function handleGetSystemDefaults() {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return apiResponse.unauthorized();

    const defaults = await service.getSystemDefaults();
    return apiResponse.success(defaults);
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to get system defaults', err);
    return apiResponse.error(err);
  }
}

// ============================================================================
// GET VERSION HISTORY
// ============================================================================

export async function handleGetVersionHistory(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return apiResponse.unauthorized();

    const { id } = await context.params;
    const template = await service.getTemplateById(id);
    if (!template) {
      return apiResponse.notFound('Template not found');
    }

    const history = await service.getVersionHistory(id);
    return apiResponse.success(history);
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to get version history', err);
    return apiResponse.error(err);
  }
}

// ============================================================================
// CREATE NEW VERSION
// ============================================================================

export async function handleCreateVersion(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return apiResponse.unauthorized();

    const body = await request.json();
    const validation = createVersionSchema.safeParse(body);
    if (!validation.success) {
      return apiResponse.validationError(validation.error);
    }

    const { parentId, content, label, metadata } = validation.data;
    const template = await service.createVersion({
      parentId,
      content,
      label,
      metadata: metadata as import('./prompt-template.types').PromptTemplateMetadata | undefined,
      createdBy: userId,
    });

    logger.info('Template version created via API', {
      id: template.id,
      step: template.step,
      version: template.version,
      userId,
    });

    return apiResponse.success(template, 201);
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to create template version', err);
    if (err.message.includes('not found')) {
      return apiResponse.notFound(err.message);
    }
    return apiResponse.error(err);
  }
}

// ============================================================================
// ROLLBACK SYSTEM DEFAULT
// ============================================================================

export async function handleRollback(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return apiResponse.unauthorized();

    const { id } = await context.params;
    const body = await request.json();
    const validation = rollbackSchema.safeParse(body);
    if (!validation.success) {
      return apiResponse.validationError(validation.error);
    }

    // Verify the target belongs to the same step lineage
    const current = await service.getTemplateById(id);
    if (!current) {
      return apiResponse.notFound('Template not found');
    }

    const target = await service.getTemplateById(validation.data.targetVersionId);
    if (!target) {
      return apiResponse.notFound('Target version not found');
    }

    if (current.step !== target.step) {
      return apiResponse.badRequest('Target version must belong to the same step');
    }

    const result = await service.rollbackSystemDefault(validation.data.targetVersionId);

    logger.info('System default rolled back via API', {
      step: result.step,
      newDefaultId: result.id,
      version: result.version,
      userId,
    });

    return apiResponse.success(result);
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to rollback system default', err);
    if (err.message.includes('not found')) {
      return apiResponse.notFound(err.message);
    }
    return apiResponse.error(err);
  }
}

// ============================================================================
// EXPERIENCE OVERRIDES — LIST
// ============================================================================

export async function handleListExperienceOverrides(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return apiResponse.unauthorized();

    const { id: experienceId } = await context.params;
    const overrides = await service.getExperienceOverrides(experienceId);
    return apiResponse.success(overrides);
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to list experience overrides', err);
    return apiResponse.error(err);
  }
}

// ============================================================================
// EXPERIENCE OVERRIDES — SET
// ============================================================================

export async function handleSetExperienceOverride(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return apiResponse.unauthorized();

    const { id: experienceId } = await context.params;
    const body = await request.json();
    const validation = setExperienceOverrideSchema.safeParse(body);
    if (!validation.success) {
      return apiResponse.validationError(validation.error);
    }

    const { step, templateId } = validation.data;
    const result = await service.setExperienceOverride(
      experienceId,
      step,
      templateId,
      userId,
    );

    logger.info('Experience override set via API', {
      experienceId,
      step,
      templateId,
      userId,
    });

    return apiResponse.success(result);
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to set experience override', err);
    if (err.message.includes('not found')) {
      return apiResponse.notFound(err.message);
    }
    if (err.message.includes('mismatch')) {
      return apiResponse.badRequest(err.message);
    }
    return apiResponse.error(err);
  }
}

// ============================================================================
// EXPERIENCE OVERRIDES — REMOVE
// ============================================================================

export async function handleRemoveExperienceOverride(
  _request: NextRequest,
  context: { params: Promise<{ id: string; step: string }> },
) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return apiResponse.unauthorized();

    const { id: experienceId, step } = await context.params;
    const validation = removeExperienceOverrideParamsSchema.safeParse({ step });
    if (!validation.success) {
      return apiResponse.validationError(validation.error);
    }

    await service.removeExperienceOverride(experienceId, validation.data.step);

    logger.info('Experience override removed via API', {
      experienceId,
      step: validation.data.step,
      userId,
    });

    return apiResponse.success({ deleted: true });
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to remove experience override', err);
    return apiResponse.error(err);
  }
}
