// src/features/prompt-templates/prompt-template.service.ts

/**
 * Prompt Template Service — business logic layer
 *
 * Handles template CRUD, versioning, seeding, and cache management.
 */

import { createLogger } from '@/shared/logger/logger';
import * as repo from './prompt-template.repository';
import { invalidateTemplateCache, invalidateTemplateCacheForStep } from './prompt-template.resolver';
import { SYSTEM_DEFAULT_TEMPLATES } from './prompt-template.defaults';
import type { PromptTemplateStep } from './prompt-template.types';
import type { PromptTemplateMetadata } from '@/db/schema/prompt-templates.schema';

const logger = createLogger('prompt-template-service');

// ============================================================================
// READ
// ============================================================================

export async function getTemplateById(id: string) {
  return repo.getById(id);
}

export async function getSystemDefault(step: PromptTemplateStep) {
  return repo.getSystemDefault(step);
}

export async function listTemplates() {
  return repo.listAll();
}

export async function listTemplatesByStep(step: PromptTemplateStep) {
  return repo.listByStep(step);
}

export async function getVersionHistory(id: string) {
  return repo.getVersionHistory(id);
}

/** Get the current active template for each step (system defaults). */
export async function getSystemDefaults() {
  const defaults: Record<string, Awaited<ReturnType<typeof repo.getSystemDefault>>> = {};
  const steps: PromptTemplateStep[] = [
    'turn_planner', 'param_extraction', 'response_synthesis',
    'response_synthesis_direct', 'response_synthesis_lightweight',
  ];

  for (const step of steps) {
    defaults[step] = await repo.getSystemDefault(step);
  }

  return defaults;
}

// ============================================================================
// WRITE — CREATE NEW VERSION
// ============================================================================

/**
 * Create a new version of a template.
 * The parent version remains unchanged (immutable). The new version
 * inherits the step and increments the version number.
 */
export async function createVersion(input: {
  parentId: string;
  content: string;
  label?: string;
  metadata?: PromptTemplateMetadata;
  createdBy?: string;
}) {
  const parent = await repo.getById(input.parentId);
  if (!parent) {
    throw new Error(`Parent template not found: ${input.parentId}`);
  }

  const newVersion = await repo.create({
    step: parent.step,
    version: parent.version + 1,
    parentId: parent.id,
    label: input.label ?? null,
    content: input.content,
    metadata: input.metadata ?? parent.metadata,
    status: 'active',
    isSystemDefault: false,
    createdBy: input.createdBy,
  });

  logger.info('New template version created', {
    id: newVersion.id,
    step: newVersion.step,
    version: newVersion.version,
    parentId: parent.id,
  });

  return newVersion;
}

// ============================================================================
// WRITE — ROLLBACK
// ============================================================================

/**
 * Rollback system default to a specific version.
 * Swaps which version is marked as isSystemDefault for the step.
 */
export async function rollbackSystemDefault(targetVersionId: string) {
  const target = await repo.getById(targetVersionId);
  if (!target) {
    throw new Error(`Target template not found: ${targetVersionId}`);
  }

  await repo.setSystemDefault(target.id, target.step);
  invalidateTemplateCacheForStep(target.step as PromptTemplateStep);

  logger.info('System default rolled back', {
    step: target.step,
    newDefaultId: target.id,
    version: target.version,
  });

  return target;
}

// ============================================================================
// EXPERIENCE OVERRIDES
// ============================================================================

export async function getExperienceOverrides(experienceId: string) {
  return repo.getExperienceOverrides(experienceId);
}

export async function setExperienceOverride(
  experienceId: string,
  step: PromptTemplateStep,
  templateId: string,
  createdBy?: string,
) {
  const template = await repo.getById(templateId);
  if (!template) {
    throw new Error(`Template not found: ${templateId}`);
  }
  if (template.step !== step) {
    throw new Error(`Template step mismatch: template is for ${template.step}, but override is for ${step}`);
  }

  const result = await repo.setExperienceOverride(experienceId, step, templateId, createdBy);
  invalidateTemplateCache();
  return result;
}

export async function removeExperienceOverride(experienceId: string, step: PromptTemplateStep) {
  await repo.removeExperienceOverride(experienceId, step);
  invalidateTemplateCache();
}

// ============================================================================
// SEEDING — create system defaults from code definitions
// ============================================================================

/**
 * Seed system default prompt templates from the code-defined defaults.
 * Idempotent — only creates rows that don't already exist.
 * Called at application startup.
 */
export async function seedSystemDefaults() {
  let created = 0;
  let skipped = 0;

  for (const def of SYSTEM_DEFAULT_TEMPLATES) {
    const existing = await repo.getSystemDefault(def.step);
    if (existing) {
      skipped++;
      continue;
    }

    await repo.create({
      step: def.step as any,
      version: 1,
      parentId: null,
      label: def.label,
      content: def.content,
      metadata: def.metadata,
      status: 'active',
      isSystemDefault: true,
    });
    created++;
  }

  if (created > 0) {
    logger.info('Seeded prompt templates', { created, skipped });
  } else {
    logger.debug('All prompt templates already seeded', { skipped });
  }
}
