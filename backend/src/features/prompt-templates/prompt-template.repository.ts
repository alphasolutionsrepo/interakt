// src/features/prompt-templates/prompt-template.repository.ts

/**
 * Prompt Template Repository — database queries
 */

import { eq, and, desc } from 'drizzle-orm';
import { db } from '@/db/index';
import { promptTemplates, aiExperiencePromptOverrides } from '@/db/schema/prompt-templates.schema';
import type { NewPromptTemplate } from '@/db/schema/prompt-templates.schema';
import { createLogger } from '@/shared/logger/logger';

const logger = createLogger('prompt-template-repository');

// ============================================================================
// READ
// ============================================================================

export async function getById(id: string) {
  return db.query.promptTemplates.findFirst({
    where: eq(promptTemplates.id, id),
  });
}

export async function getSystemDefault(step: string) {
  return db.query.promptTemplates.findFirst({
    where: and(
      eq(promptTemplates.step, step as any),
      eq(promptTemplates.isSystemDefault, true),
      eq(promptTemplates.status, 'active'),
    ),
  });
}

export async function listByStep(step: string) {
  return db
    .select()
    .from(promptTemplates)
    .where(eq(promptTemplates.step, step as any))
    .orderBy(desc(promptTemplates.version));
}

export async function listAll() {
  return db
    .select()
    .from(promptTemplates)
    .orderBy(desc(promptTemplates.createdAt));
}

export async function getVersionHistory(id: string) {
  // Walk the parent chain to build version history
  const versions: Array<typeof promptTemplates.$inferSelect> = [];
  let currentId: string | null = id;

  while (currentId) {
    const row = await db.query.promptTemplates.findFirst({
      where: eq(promptTemplates.id, currentId),
    });
    if (!row) break;
    versions.push(row);
    currentId = row.parentId;
  }

  return versions;
}

// ============================================================================
// WRITE
// ============================================================================

export async function create(data: NewPromptTemplate) {
  const [row] = await db.insert(promptTemplates).values(data).returning();
  logger.info('Prompt template created', { id: row.id, step: row.step, version: row.version });
  return row;
}

export async function updateStatus(id: string, status: 'draft' | 'active' | 'archived') {
  const [row] = await db
    .update(promptTemplates)
    .set({ status, updatedAt: new Date() })
    .where(eq(promptTemplates.id, id))
    .returning();
  return row;
}

export async function setSystemDefault(id: string, step: string) {
  // Clear existing default for this step
  await db
    .update(promptTemplates)
    .set({ isSystemDefault: false, updatedAt: new Date() })
    .where(and(
      eq(promptTemplates.step, step as any),
      eq(promptTemplates.isSystemDefault, true),
    ));

  // Set new default
  const [row] = await db
    .update(promptTemplates)
    .set({ isSystemDefault: true, updatedAt: new Date() })
    .where(eq(promptTemplates.id, id))
    .returning();

  logger.info('System default updated', { id, step });
  return row;
}

// ============================================================================
// EXPERIENCE OVERRIDES
// ============================================================================

export async function getExperienceOverrides(experienceId: string) {
  return db
    .select()
    .from(aiExperiencePromptOverrides)
    .where(eq(aiExperiencePromptOverrides.aiExperienceId, experienceId));
}

export async function getExperienceOverride(experienceId: string, step: string) {
  return db.query.aiExperiencePromptOverrides.findFirst({
    where: and(
      eq(aiExperiencePromptOverrides.aiExperienceId, experienceId),
      eq(aiExperiencePromptOverrides.step, step as any),
    ),
    with: { template: true },
  });
}

export async function setExperienceOverride(
  experienceId: string,
  step: string,
  templateId: string,
  createdBy?: string,
) {
  // Upsert — delete existing then insert (Drizzle doesn't have native upsert for all cases)
  await db
    .delete(aiExperiencePromptOverrides)
    .where(and(
      eq(aiExperiencePromptOverrides.aiExperienceId, experienceId),
      eq(aiExperiencePromptOverrides.step, step as any),
    ));

  const [row] = await db
    .insert(aiExperiencePromptOverrides)
    .values({
      aiExperienceId: experienceId,
      step: step as any,
      templateId,
      createdBy,
    })
    .returning();

  logger.info('Experience prompt override set', { experienceId, step, templateId });
  return row;
}

export async function removeExperienceOverride(experienceId: string, step: string) {
  await db
    .delete(aiExperiencePromptOverrides)
    .where(and(
      eq(aiExperiencePromptOverrides.aiExperienceId, experienceId),
      eq(aiExperiencePromptOverrides.step, step as any),
    ));

  logger.info('Experience prompt override removed', { experienceId, step });
}
