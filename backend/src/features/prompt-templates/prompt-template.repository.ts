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

/** The minimum a row needs for lineage assembly — kept structural so the logic is testable. */
export interface LineageNode {
  id: string;
  parentId: string | null;
  version: number;
}

/**
 * Every version in the same lineage as `id`, newest first.
 *
 * Version history used to be built by walking *up* the parent chain from whichever version you
 * opened, which meant the history depended on where you stood: from v4 you saw all four, but
 * from v3 you saw three and v4 did not exist. Parent pointers run child→parent, so an ancestor
 * can never reach its descendants that way — and an old version is exactly where you stand when
 * you want to move forward, which is the case that hid the option.
 *
 * So it climbs to the root, then collects everything below it. Children are walked rather than
 * assuming one line, because two versions can share a parent when one is created from a
 * rolled-back state. Rows for the same step that belong to a different lineage are excluded:
 * they are separate templates, not versions of this one.
 */
export function collectLineage<T extends LineageNode>(rows: T[], id: string): T[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const start = byId.get(id);
  if (!start) return [];

  // Climb to the root. `seen` guards a parent cycle, which the schema does not prevent and
  // which would otherwise hang the request rather than return a short history.
  let root = start;
  const seen = new Set<string>([root.id]);
  while (root.parentId) {
    const parent = byId.get(root.parentId);
    if (!parent || seen.has(parent.id)) break;
    seen.add(parent.id);
    root = parent;
  }

  const childrenOf = new Map<string, T[]>();
  for (const row of rows) {
    if (!row.parentId) continue;
    const list = childrenOf.get(row.parentId);
    if (list) list.push(row);
    else childrenOf.set(row.parentId, [row]);
  }

  const lineage: T[] = [];
  const collected = new Set<string>();
  const frontier = [root];
  while (frontier.length > 0) {
    const row = frontier.pop()!;
    if (collected.has(row.id)) continue;
    collected.add(row.id);
    lineage.push(row);
    frontier.push(...(childrenOf.get(row.id) ?? []));
  }

  return lineage.sort((a, b) => b.version - a.version);
}

export async function getVersionHistory(id: string) {
  const target = await db.query.promptTemplates.findFirst({
    where: eq(promptTemplates.id, id),
  });
  if (!target) return [];

  // Every version of a step lives in this table, so one read covers the whole lineage and the
  // walk happens in memory. The alternative — a query per ancestor and per child — was a
  // round trip per version to reassemble something already fetchable in one.
  const siblings = await db
    .select()
    .from(promptTemplates)
    .where(eq(promptTemplates.step, target.step));

  return collectLineage(siblings, id);
}

// ============================================================================
// WRITE
// ============================================================================

export async function create(data: NewPromptTemplate) {
  const [row] = await db.insert(promptTemplates).values(data).returning();
  logger.info('Prompt template created', { id: row.id, step: row.step, version: row.version });
  return row;
}

/**
 * Overwrite a seeded system-default template's content in place.
 *
 * Used only by seedSystemDefaults to bring an untouched v1 seed row back in line
 * with the code-defined default. User-authored versions are separate rows and are
 * never rewritten — see the guard in seedSystemDefaults.
 */
export async function updateContent(
  id: string,
  data: { label?: string | null; content: string; metadata: NewPromptTemplate['metadata'] },
) {
  const [row] = await db
    .update(promptTemplates)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(promptTemplates.id, id))
    .returning();

  if (!row) {
    throw new Error(`Prompt template not found: ${id}`);
  }
  logger.info('Prompt template content updated', { id: row.id, step: row.step });
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

/**
 * Rename a template without versioning it.
 *
 * The label is not part of the versioned artifact — only `content` is — so correcting one
 * must not mint a version. Used by the seeder when a shipped default's label changes but
 * its content has not.
 */
export async function updateLabel(id: string, label: string) {
  const [row] = await db
    .update(promptTemplates)
    .set({ label, updatedAt: new Date() })
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
