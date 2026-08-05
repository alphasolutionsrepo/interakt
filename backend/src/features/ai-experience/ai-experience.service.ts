// src/features/ai-experience/ai-experience.service.ts

import { createLogger } from '@/shared/logger/logger';
import * as repository from './ai-experience.repository';
import * as toolsService from '../tools/tools.service';
import { aiExperienceCache as cache } from './ai-experience.cache';
import { setExperienceTelemetryOverride } from '@/features/telemetry';
import { setupTopicGateEmbeddings } from '@/features/guardrails/topic-gate.service';
import { getGlobalTopicGateCache } from '@/features/guardrails/topic-gate.cache';
import type {
  CreateAIExperienceDTO,
  UpdateAIExperienceDTO,
  AssignToolDTO,
  UpdateToolAssignmentDTO,
  ListAIExperiencesQuery,
  AIExperienceListResponse,
  AIExperienceWithTools,
} from './ai-experience.types';

const logger = createLogger('ai-experience-service');

// ============================================================================
// HELPERS
// ============================================================================

async function clearListCache() {
  await cache.clear();
}

async function clearDetailCache(_id: string, _slug: string) {
  // Clear entire cache since token-based entries can't be targeted individually
  await cache.clear();
}

/**
 * Strip topic-gate embedding vectors from a guardrailConfig for list responses.
 *
 * Topic-gate rules persist `termEmbeddings`/`generalTermEmbeddings` (number[][])
 * inline in the rule config. These run into hundreds of KB per experience and are
 * only needed at runtime (loaded via the by-slug/by-id fetch into the topic-gate
 * cache) or in the detail editor. The list view never reads them, so returning
 * them bloated the list response to ~460 KB/row (11.5 MB for a default page of 25).
 * Returns a shallow copy with the embedding arrays removed; original is untouched.
 */
function stripGuardrailEmbeddings<T>(guardrailConfig: T): T {
  const config = guardrailConfig as Record<string, unknown> | null;
  if (!config) return guardrailConfig;

  const stripRules = (guardrail: unknown) => {
    const g = guardrail as { rules?: Array<Record<string, unknown>> } | undefined;
    if (!g?.rules?.length) return guardrail;
    return {
      ...g,
      rules: g.rules.map((rule) => {
        const ruleConfig = rule.config as Record<string, unknown> | undefined;
        if (!ruleConfig) return rule;
        const { termEmbeddings, generalTermEmbeddings, ...rest } = ruleConfig;
        // Touch the destructured fields so lint doesn't flag them as unused.
        void termEmbeddings;
        void generalTermEmbeddings;
        return { ...rule, config: rest };
      }),
    };
  };

  return {
    ...config,
    inputGuardrail: stripRules(config.inputGuardrail),
    outputGuardrail: stripRules(config.outputGuardrail),
  } as T;
}

// ============================================================================
// CRUD OPERATIONS
// ============================================================================

export async function createAIExperience(input: CreateAIExperienceDTO, userId: string) {
  // Validate slug uniqueness
  const slugAvailable = await repository.isSlugAvailable(input.slug);
  if (!slugAvailable) {
    throw new Error(`AI Experience with slug "${input.slug}" already exists`);
  }

  // Validate all tool IDs exist
  if (input.toolIds && input.toolIds.length > 0) {
    for (const toolId of input.toolIds) {
      const tool = await toolsService.getToolById(toolId);
      if (!tool) {
        throw new Error(`Tool with ID "${toolId}" not found`);
      }
      if (!tool.isActive) {
        throw new Error(`Tool "${tool.name}" is not active`);
      }
    }
  }

  // Expand topic gate embeddings if configured
  const guardrailConfig = await expandTopicGateIfNeeded(input.guardrailConfig);

  const created = await repository.createAIExperience(
    {
      name: input.name,
      slug: input.slug,
      description: input.description,
      icon: input.icon,
      pipelineMode: input.pipelineMode,
      pipelineConfig: input.pipelineConfig as any,
      personaConfig: input.personaConfig as any,
      guardrailConfig: guardrailConfig as any,
      sessionConfig: input.sessionConfig as any,
      accessConfig: input.accessConfig as any,
      observabilityConfig: input.observabilityConfig as any,
      providerId: input.providerId,
      modelId: input.modelId,
      createdBy: userId,
    },
    input.toolIds || [],
  );

  await clearListCache();
  logger.info('Created AI experience', { experienceId: created.id, slug: created.slug, userId });

  // Return with full tool data
  return repository.getAIExperienceById(created.id);
}

export async function getAIExperienceById(id: string) {
  return repository.getAIExperienceById(id);
}

export async function getAIExperienceBySlug(slug: string) {
  const cacheKey = `slug:${slug}`;
  const cached = cache.get<AIExperienceWithTools>(cacheKey);
  if (cached) return cached;

  const experience = await repository.getAIExperienceBySlug(slug);
  if (experience) {
    cache.set(cacheKey, experience);
  }
  return experience;
}

export async function getAIExperienceByAccessToken(accessToken: string) {
  const cacheKey = `token:${accessToken}`;
  const cached = cache.get<AIExperienceWithTools>(cacheKey);
  if (cached) return cached;

  const experience = await repository.getAIExperienceByAccessToken(accessToken);
  if (experience) {
    cache.set(cacheKey, experience);
  }
  return experience;
}

export async function listAIExperiences(query: ListAIExperiencesQuery): Promise<AIExperienceListResponse> {
  const result = await repository.listAIExperiences(query);
  return {
    experiences: result.experiences.map((experience) => ({
      ...experience,
      guardrailConfig: stripGuardrailEmbeddings(experience.guardrailConfig),
    })) as any[],
    pagination: result.pagination,
  };
}

export async function updateAIExperience(id: string, input: UpdateAIExperienceDTO, userId: string) {
  const existing = await repository.getAIExperienceById(id);
  if (!existing) return null;

  // Expand topic gate embeddings if guardrail config changed
  let guardrailConfig = input.guardrailConfig;
  if (guardrailConfig !== undefined) {
    guardrailConfig = await expandTopicGateIfNeeded(guardrailConfig);
  }

  const updated = await repository.updateAIExperience(id, {
    ...(input.name !== undefined && { name: input.name }),
    ...(input.description !== undefined && { description: input.description }),
    ...(input.icon !== undefined && { icon: input.icon }),
    ...(input.pipelineMode !== undefined && { pipelineMode: input.pipelineMode }),
    ...(input.pipelineConfig !== undefined && { pipelineConfig: input.pipelineConfig as any }),
    ...(input.personaConfig !== undefined && { personaConfig: input.personaConfig as any }),
    ...(guardrailConfig !== undefined && { guardrailConfig: guardrailConfig as any }),
    ...(input.sessionConfig !== undefined && { sessionConfig: input.sessionConfig as any }),
    ...(input.accessConfig !== undefined && { accessConfig: input.accessConfig as any }),
    ...(input.observabilityConfig !== undefined && { observabilityConfig: input.observabilityConfig as any }),
    ...(input.providerId !== undefined && { providerId: input.providerId }),
    ...(input.modelId !== undefined && { modelId: input.modelId }),
    ...(input.isActive !== undefined && { isActive: input.isActive }),
    updatedBy: userId,
  });

  if (updated) {
    // Sync telemetry override to in-memory config
    if (input.observabilityConfig?.telemetryDetailLevel !== undefined) {
      setExperienceTelemetryOverride(id, input.observabilityConfig.telemetryDetailLevel);
    }

    // Invalidate topic gate cache so next message picks up new embeddings
    if (guardrailConfig !== undefined) {
      getGlobalTopicGateCache().invalidate(id);
    }

    await clearDetailCache(id, existing.slug);
    await clearListCache();
    logger.info('Updated AI experience', { experienceId: id, slug: existing.slug, userId });
  }

  // Return with full tool data
  return repository.getAIExperienceById(id);
}

export async function deleteAIExperience(id: string, userId: string) {
  const existing = await repository.getAIExperienceById(id);
  if (!existing) return false;

  const deleted = await repository.deleteAIExperience(id);
  if (!deleted) return false;

  await clearDetailCache(id, existing.slug);
  await clearListCache();
  logger.info('Deleted AI experience', { experienceId: id, slug: existing.slug, userId });

  return true;
}

export async function regenerateAccessToken(id: string, userId: string) {
  const existing = await repository.getAIExperienceById(id);
  if (!existing) return null;

  const updated = await repository.updateAIExperience(id, {
    accessToken: crypto.randomUUID(),
    updatedBy: userId,
  });

  if (updated) {
    await clearDetailCache(id, existing.slug);
    logger.info('Regenerated access token', { experienceId: id, userId });
  }

  return updated;
}

export async function isSlugAvailable(slug: string, excludeId?: string) {
  return repository.isSlugAvailable(slug, excludeId);
}

// ============================================================================
// TOOL ASSIGNMENT MANAGEMENT
// ============================================================================

export async function assignTool(experienceId: string, input: AssignToolDTO, userId: string) {
  const experience = await repository.getAIExperienceById(experienceId);
  if (!experience) {
    throw new Error('AI Experience not found');
  }

  const tool = await toolsService.getToolById(input.toolId);
  if (!tool) {
    throw new Error(`Tool with ID "${input.toolId}" not found`);
  }

  const existing = await repository.getToolAssignment(experienceId, input.toolId);
  if (existing) {
    throw new Error(`Tool "${tool.name}" is already assigned to this experience`);
  }

  const assignment = await repository.assignTool(experienceId, {
    aiExperienceId: experienceId,
    toolId: input.toolId,
    overrideAiDescription: input.overrideAiDescription,
    overrideConfig: input.overrideConfig as Record<string, unknown>,
    isEnabled: input.isEnabled,
    sortOrder: input.sortOrder,
  });

  await clearDetailCache(experienceId, experience.slug);
  logger.info('Assigned tool to experience', { experienceId, toolId: input.toolId, userId });

  return assignment;
}

export async function updateToolAssignment(
  experienceId: string,
  toolId: string,
  input: UpdateToolAssignmentDTO,
  userId: string
) {
  const experience = await repository.getAIExperienceById(experienceId);
  if (!experience) {
    throw new Error('AI Experience not found');
  }

  const updated = await repository.updateToolAssignment(experienceId, toolId, {
    ...(input.overrideAiDescription !== undefined && { overrideAiDescription: input.overrideAiDescription }),
    ...(input.overrideConfig !== undefined && { overrideConfig: input.overrideConfig as Record<string, unknown> }),
    ...(input.isEnabled !== undefined && { isEnabled: input.isEnabled }),
    ...(input.sortOrder !== undefined && { sortOrder: input.sortOrder }),
  });

  if (!updated) {
    throw new Error('Tool assignment not found');
  }

  await clearDetailCache(experienceId, experience.slug);
  logger.info('Updated tool assignment', { experienceId, toolId, userId });

  return updated;
}

export async function removeToolAssignment(experienceId: string, toolId: string, userId: string) {
  const experience = await repository.getAIExperienceById(experienceId);
  if (!experience) {
    throw new Error('AI Experience not found');
  }

  const removed = await repository.removeToolAssignment(experienceId, toolId);
  if (!removed) {
    throw new Error('Tool assignment not found');
  }

  await clearDetailCache(experienceId, experience.slug);
  logger.info('Removed tool from experience', { experienceId, toolId, userId });

  return true;
}

// ============================================================================
// TOPIC GATE EMBEDDING SETUP
// ============================================================================

/**
 * If guardrailConfig contains a topic_gate rule with allowedDomains,
 * expand keywords into semantic terms and generate embeddings.
 * Returns the guardrailConfig with embeddings merged into the rule config.
 */
async function expandTopicGateIfNeeded(
  guardrailConfig: Record<string, unknown> | undefined,
): Promise<Record<string, unknown> | undefined> {
  if (!guardrailConfig) return guardrailConfig;

  const inputGuardrail = guardrailConfig.inputGuardrail as {
    enabled?: boolean;
    rules?: Array<{ type: string; enabled: boolean; config: Record<string, unknown> }>;
  } | undefined;

  if (!inputGuardrail?.rules) return guardrailConfig;

  const topicGateRule = inputGuardrail.rules.find(
    (r) => r.type === 'topic_gate' && r.enabled,
  );

  if (!topicGateRule) return guardrailConfig;

  const allowedDomains = topicGateRule.config.allowedDomains as string[] | undefined;
  if (!allowedDomains?.length) return guardrailConfig;

  // Skip regeneration if the frontend sent pre-existing expandedTerms + termEmbeddings.
  // This happens when the user only removed some terms (manual edit) without changing domains.
  const existingTerms = topicGateRule.config.expandedTerms as string[] | undefined;
  const existingEmbeddings = topicGateRule.config.termEmbeddings as number[][] | undefined;
  if (existingTerms?.length && existingEmbeddings?.length && existingTerms.length === existingEmbeddings.length) {
    logger.info('Topic gate embeddings preserved from frontend edit', {
      terms: existingTerms.length,
    });
    return guardrailConfig;
  }

  try {
    logger.info('Expanding topic gate embeddings', { domains: allowedDomains });
    const embeddingConfig = await setupTopicGateEmbeddings(allowedDomains);

    // Merge embedding data into the rule config (both domain + general clusters)
    topicGateRule.config = {
      ...topicGateRule.config,
      expandedTerms: embeddingConfig.expandedTerms,
      termEmbeddings: embeddingConfig.termEmbeddings,
      threshold: embeddingConfig.threshold,
      generalTerms: embeddingConfig.generalTerms,
      generalTermEmbeddings: embeddingConfig.generalTermEmbeddings,
      generalThreshold: embeddingConfig.generalThreshold,
      lastExpandedAt: embeddingConfig.lastExpandedAt,
    };

    logger.info('Topic gate embeddings generated', {
      domainTerms: embeddingConfig.expandedTerms.length,
      generalTerms: embeddingConfig.generalTerms.length,
      threshold: embeddingConfig.threshold,
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('Failed to generate topic gate embeddings (saving without)', err);
    // Don't block the save — embeddings will be missing but fail-open at runtime
  }

  return guardrailConfig;
}
