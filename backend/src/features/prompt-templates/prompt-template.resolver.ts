// src/features/prompt-templates/prompt-template.resolver.ts

/**
 * Prompt Template Resolver
 *
 * Resolves which template version to use for a given pipeline step + experience.
 * Resolution order:
 *   1. Experience-specific override (ai_experience_prompt_overrides)
 *   2. System default (prompt_templates where isSystemDefault=true)
 *   3. Null (no template found — caller should fall back to hardcoded)
 *
 * Results are cached in memory with TTL for performance.
 */

import { createLogger } from '@/shared/logger/logger';
import type { PromptTemplateStep, ResolvedTemplate } from './prompt-template.types';
import type { PromptTemplate } from '@/db/schema/prompt-templates.schema';

const logger = createLogger('prompt-template:resolver');

// ============================================================================
// CACHE
// ============================================================================

interface CacheEntry {
  template: ResolvedTemplate | null;
  expiresAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const cache = new Map<string, CacheEntry>();

function cacheKey(step: PromptTemplateStep, experienceId?: string): string {
  return experienceId ? `${step}:${experienceId}` : `${step}:__default__`;
}

/** Clear all cached templates. Call after template updates. */
export function invalidateTemplateCache(): void {
  cache.clear();
  logger.info('Template cache invalidated');
}

/** Clear cached templates for a specific step. */
export function invalidateTemplateCacheForStep(step: PromptTemplateStep): void {
  for (const key of cache.keys()) {
    if (key.startsWith(`${step}:`)) {
      cache.delete(key);
    }
  }
}

// ============================================================================
// RESOLVER
// ============================================================================

/**
 * Resolve the prompt template for a pipeline step.
 *
 * @param step - Which pipeline step needs a prompt
 * @param experienceId - The experience ID (for override lookup)
 * @returns The resolved template, or null if no template exists in DB
 */
export async function resolveTemplate(
  step: PromptTemplateStep,
  experienceId?: string,
): Promise<ResolvedTemplate | null> {
  const key = cacheKey(step, experienceId);

  // Check cache
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.template;
  }

  try {
    const resolved = await resolveFromDB(step, experienceId);

    // Cache the result (even null — to avoid repeated DB queries for missing templates)
    cache.set(key, { template: resolved, expiresAt: Date.now() + CACHE_TTL_MS });

    return resolved;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('Failed to resolve template, returning null', err, { step, experienceId });
    return null;
  }
}

// ============================================================================
// DB LOOKUP
// ============================================================================

async function resolveFromDB(
  step: PromptTemplateStep,
  experienceId?: string,
): Promise<ResolvedTemplate | null> {
  const { db } = await import('@/db/index');
  const { promptTemplates, aiExperiencePromptOverrides } = await import('@/db/schema/prompt-templates.schema');
  const { eq, and } = await import('drizzle-orm');

  // 1. Check for experience-specific override
  if (experienceId) {
    const override = await db
      .select({
        templateId: aiExperiencePromptOverrides.templateId,
      })
      .from(aiExperiencePromptOverrides)
      .where(
        and(
          eq(aiExperiencePromptOverrides.aiExperienceId, experienceId),
          eq(aiExperiencePromptOverrides.step, step),
        ),
      )
      .limit(1);

    if (override.length > 0) {
      const template = await db
        .select()
        .from(promptTemplates)
        .where(eq(promptTemplates.id, override[0].templateId))
        .limit(1);

      if (template.length > 0) {
        return toResolvedTemplate(template[0] as PromptTemplate, 'override');
      }
    }
  }

  // 2. Fall back to system default
  const systemDefault = await db
    .select()
    .from(promptTemplates)
    .where(
      and(
        eq(promptTemplates.step, step),
        eq(promptTemplates.isSystemDefault, true),
        eq(promptTemplates.status, 'active'),
      ),
    )
    .limit(1);

  if (systemDefault.length > 0) {
    return toResolvedTemplate(systemDefault[0] as PromptTemplate, 'system_default');
  }

  return null;
}

function toResolvedTemplate(
  row: PromptTemplate,
  source: 'override' | 'system_default',
): ResolvedTemplate {
  return {
    id: row.id,
    step: row.step as PromptTemplateStep,
    version: row.version,
    content: row.content,
    metadata: row.metadata,
    isSystemDefault: row.isSystemDefault,
    source,
  };
}
