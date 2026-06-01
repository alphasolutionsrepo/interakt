// src/features/search-experience/search-experience.service.ts

/**
 * Search Experience Service
 *
 * Business logic for search experiences, including validation,
 * authorization, and orchestration of repository operations.
 */

import 'server-only';

import { createLogger } from '@/shared/logger/logger';
import { getHybridSearchDefaults } from '@/features/global-settings';
import * as repository from './search-experience.repository';
import * as cache from './search-experience.cache';
import {
  createSearchExperienceSchema,
  updateSearchExperienceSchema,
  addIndexSchema,
  updateIndexSchema,
  type CreateSearchExperienceDTO,
  type UpdateSearchExperienceDTO,
  type AddIndexDTO,
  type UpdateIndexDTO,
  type ListSearchExperiencesQueryDTO,
} from './search-experience.schemas';
import type {
  SearchExperience,
  SearchExperienceWithIndexes,
  SearchExperienceSummary,
  AddSearchExperienceIndexInput,
  SearchExperienceDisplayConfig,
  SearchExperienceHybridConfig,
} from './search-experience.types';
import {
  DEFAULT_SEARCH_CONFIG,
  DEFAULT_AI_CONFIG,
  DEFAULT_TOOLS_CONFIG,
} from './search-experience.types';
import { setExperienceTelemetryOverride } from '@/features/telemetry';

const logger = createLogger('search-experience-service');

// ============================================================================
// ERROR CLASSES
// ============================================================================

export class SearchExperienceError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 400,
    public details?: unknown
  ) {
    super(message);
    this.name = 'SearchExperienceError';
  }
}

export class NotFoundError extends SearchExperienceError {
  constructor(resource: string, identifier: string) {
    super(`${resource} not found: ${identifier}`, 'NOT_FOUND', 404);
  }
}

export class ValidationError extends SearchExperienceError {
  constructor(message: string, details?: unknown) {
    super(message, 'VALIDATION_ERROR', 400, details);
  }
}

export class UnauthorizedError extends SearchExperienceError {
  constructor(message: string = 'Unauthorized') {
    super(message, 'UNAUTHORIZED', 401);
  }
}

export class ForbiddenError extends SearchExperienceError {
  constructor(message: string = 'Forbidden') {
    super(message, 'FORBIDDEN', 403);
  }
}

// ============================================================================
// SEARCH EXPERIENCE: CREATE
// ============================================================================

/**
 * Create a new search experience
 */
export async function createSearchExperience(
  input: CreateSearchExperienceDTO,
  createdBy: string
): Promise<SearchExperienceWithIndexes> {
  // Validate input
  const validated = createSearchExperienceSchema.parse(input);

  // Check slug uniqueness
  const slugUnique = await repository.isSlugUnique(validated.slug);
  if (!slugUnique) {
    throw new ValidationError(`Slug "${validated.slug}" is already in use`);
  }

  // Validate all search indexes exist
  for (const idx of validated.indexes) {
    const exists = await repository.searchIndexExists(idx.searchIndexId);
    if (!exists) {
      throw new ValidationError(`Search index not found: ${idx.searchIndexId}`);
    }
  }

  // Validate defaultSearchType is compatible with index capabilities
  if (validated.searchConfig?.defaultSearchType && validated.searchConfig.defaultSearchType !== 'auto') {
    const searchIndexService = await import('@/features/search-index/search-index.service');
    const primaryIdx = validated.indexes.find(idx => idx.role === 'primary') || validated.indexes[0];
    if (primaryIdx) {
      const indexDetails = await searchIndexService.getSearchIndexById(primaryIdx.searchIndexId);
      if (indexDetails) {
        const requestedType = validated.searchConfig.defaultSearchType;
        const indexType = indexDetails.searchType as string;

        // Check if requested type requires embeddings
        if ((requestedType === 'semantic' || requestedType === 'hybrid') && indexType === 'lexical') {
          throw new ValidationError(
            `Cannot use "${requestedType}" search type with index "${indexDetails.name}" which is configured as "lexical" only. ` +
            `The index does not have embeddings configured.`
          );
        }
      }
    }
  }

  // Ensure at least one primary index
  const hasPrimary = validated.indexes.some((idx) => idx.role === 'primary');
  if (!hasPrimary && validated.indexes.length > 0) {
    // Default first index to primary
    validated.indexes[0].role = 'primary';
  }

  // Get global hybrid search defaults to populate hybridConfig
  // This ensures Search Experience is the single source of truth for all search config
  const globalHybridDefaults = await getHybridSearchDefaults();
  const hybridConfig: SearchExperienceHybridConfig = {
    lexicalWeight: validated.searchConfig?.hybridConfig?.lexicalWeight ?? globalHybridDefaults.lexicalWeight,
    semanticWeight: validated.searchConfig?.hybridConfig?.semanticWeight ?? globalHybridDefaults.semanticWeight,
    rrfRankConstant: validated.searchConfig?.hybridConfig?.rrfRankConstant ?? globalHybridDefaults.rrfRankConstant,
    rrfWindowSize: validated.searchConfig?.hybridConfig?.rrfWindowSize ?? globalHybridDefaults.rrfWindowSize,
  };

  // Build complete configs with defaults
  const searchConfig = {
    ...DEFAULT_SEARCH_CONFIG,
    ...validated.searchConfig,
    autocomplete: { ...DEFAULT_SEARCH_CONFIG.autocomplete, ...validated.searchConfig?.autocomplete },
    hybridConfig, // Always include hybridConfig with resolved values
  };
  const aiConfig = {
    ...DEFAULT_AI_CONFIG,
    ...validated.aiConfig,
    summary: { ...DEFAULT_AI_CONFIG.summary, ...validated.aiConfig?.summary },
  };
  const toolsConfig = { ...DEFAULT_TOOLS_CONFIG, ...validated.toolsConfig };

  // Build rate limit config with defaults if provided
  const rateLimitConfig = validated.rateLimitConfig
    ? {
        searchPerMinute: validated.rateLimitConfig.searchPerMinute,
        chatPerMinute: validated.rateLimitConfig.chatPerMinute,
        requestsPerDay: validated.rateLimitConfig.requestsPerDay,
      }
    : undefined;

  // Map indexes to required type (searchIndexId is required after validation)
  const indexInputs: AddSearchExperienceIndexInput[] = validated.indexes.map((idx) => ({
    searchIndexId: idx.searchIndexId,
    role: idx.role,
    weight: idx.weight,
    sortOrder: idx.sortOrder,
    aiDescription: idx.aiDescription,
  }));

  // Create experience with indexes
  const experience = await repository.createSearchExperienceWithIndexes(
    {
      name: validated.name,
      slug: validated.slug,
      description: validated.description,
      searchConfig,
      aiConfig,
      toolsConfig,
      allowedOrigins: validated.allowedOrigins || [],
      rateLimitConfig,
      displayConfig: validated.displayConfig as SearchExperienceDisplayConfig | undefined,
      createdBy,
    },
    indexInputs
  );

  logger.info('Created search experience', {
    id: experience.id,
    name: experience.name,
    slug: experience.slug,
    indexCount: experience.indexes.length,
    createdBy,
  });

  return experience;
}

// ============================================================================
// SEARCH EXPERIENCE: READ
// ============================================================================

/**
 * Get search experience by ID
 */
export async function getSearchExperienceById(
  id: string
): Promise<SearchExperience> {
  const experience = await repository.getSearchExperienceById(id);
  if (!experience) {
    throw new NotFoundError('Search experience', id);
  }
  return experience;
}

/**
 * Get search experience by ID with indexes (cached)
 */
export async function getSearchExperienceWithIndexes(
  id: string
): Promise<SearchExperienceWithIndexes> {
  const experience = await cache.getOrFetchById(id, () =>
    repository.getSearchExperienceWithIndexes(id)
  );
  if (!experience) {
    throw new NotFoundError('Search experience', id);
  }
  return experience;
}

/**
 * Get search experience by slug
 */
export async function getSearchExperienceBySlug(
  slug: string
): Promise<SearchExperience> {
  const experience = await repository.getSearchExperienceBySlug(slug);
  if (!experience) {
    throw new NotFoundError('Search experience', slug);
  }
  return experience;
}

/**
 * Check if a slug is available
 */
export async function isSlugAvailable(
  slug: string,
  excludeId?: string
): Promise<boolean> {
  const existing = await repository.getSearchExperienceBySlug(slug);
  if (!existing) {
    return true;
  }
  // If excludeId is provided, the slug is available if it belongs to that experience
  return excludeId ? existing.id === excludeId : false;
}

/**
 * Get search experience by access token (cached)
 * Used for public API authentication
 */
export async function getSearchExperienceByAccessToken(
  accessToken: string
): Promise<SearchExperienceWithIndexes> {
  if (!accessToken) {
    throw new UnauthorizedError('Access token is required');
  }

  const experience = await cache.getOrFetchByToken(accessToken, () =>
    repository.getSearchExperienceByAccessToken(accessToken)
  );
  if (!experience) {
    throw new UnauthorizedError('Invalid access token');
  }

  if (!experience.isActive) {
    throw new ForbiddenError('This search experience is not active');
  }

  return experience;
}

/**
 * List search experiences with pagination
 */
export async function listSearchExperiences(
  query: ListSearchExperiencesQueryDTO,
  userId?: string
): Promise<{
  items: SearchExperienceSummary[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}> {
  // Ensure page and pageSize have defaults (they should from schema, but TypeScript needs assurance)
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 20;

  const { items, total } = await repository.listSearchExperiences({
    page,
    pageSize,
    search: query.search,
    isActive: query.isActive,
    sortBy: query.sortBy,
    sortOrder: query.sortOrder,
    // createdBy not filtered — admin listing shows all experiences (consistent with AI experiences)
  });

  const totalPages = Math.ceil(total / pageSize);

  return {
    items,
    total,
    page,
    pageSize,
    totalPages,
  };
}

// ============================================================================
// SEARCH EXPERIENCE: UPDATE
// ============================================================================

/**
 * Update a search experience
 */
export async function updateSearchExperience(
  id: string,
  input: UpdateSearchExperienceDTO,
  updatedBy: string
): Promise<SearchExperience> {
  // Validate input
  const validated = updateSearchExperienceSchema.parse(input);

  // Check experience exists
  const existing = await repository.getSearchExperienceById(id);
  if (!existing) {
    throw new NotFoundError('Search experience', id);
  }

  // Check slug uniqueness if changing
  if (validated.slug && validated.slug !== existing.slug) {
    const slugUnique = await repository.isSlugUnique(validated.slug, id);
    if (!slugUnique) {
      throw new ValidationError(`Slug "${validated.slug}" is already in use`);
    }
  }

  // Merge configs
  const updateData: Record<string, unknown> = { updatedBy };

  if (validated.name !== undefined) updateData.name = validated.name;
  if (validated.slug !== undefined) updateData.slug = validated.slug;
  if (validated.description !== undefined) updateData.description = validated.description;
  if (validated.isActive !== undefined) updateData.isActive = validated.isActive;
  if (validated.telemetryDetailLevel !== undefined) updateData.telemetryDetailLevel = validated.telemetryDetailLevel;
  if (validated.allowedOrigins !== undefined) updateData.allowedOrigins = validated.allowedOrigins;
  if (validated.rateLimitConfig !== undefined) updateData.rateLimitConfig = validated.rateLimitConfig;
  if (validated.displayConfig !== undefined) updateData.displayConfig = validated.displayConfig;

  // Merge search config (including nested autocomplete and hybridConfig)
  if (validated.searchConfig) {
    updateData.searchConfig = {
      ...existing.searchConfig,
      ...validated.searchConfig,
      autocomplete: {
        ...existing.searchConfig.autocomplete,
        ...validated.searchConfig.autocomplete,
      },
      // Merge hybridConfig - existing values as base, override with new values
      hybridConfig: {
        ...existing.searchConfig.hybridConfig,
        ...validated.searchConfig.hybridConfig,
      },
    };
  }

  // Merge AI config (nested)
  if (validated.aiConfig) {
    updateData.aiConfig = {
      ...existing.aiConfig,
      ...validated.aiConfig,
      summary: {
        ...existing.aiConfig.summary,
        ...validated.aiConfig.summary,
      },
    };
  }

  // Merge tools config
  if (validated.toolsConfig) {
    updateData.toolsConfig = {
      ...existing.toolsConfig,
      ...validated.toolsConfig,
    };
  }

  const updated = await repository.updateSearchExperience(id, updateData);
  if (!updated) {
    throw new NotFoundError('Search experience', id);
  }

  // Sync telemetry override to in-memory config
  if (validated.telemetryDetailLevel !== undefined) {
    setExperienceTelemetryOverride(id, validated.telemetryDetailLevel);
  }

  // Invalidate cache
  await cache.invalidateExperience(id, existing.accessToken);

  logger.info('Updated search experience', {
    id,
    fields: Object.keys(validated),
    updatedBy,
  });

  return updated;
}

/**
 * Regenerate access token
 */
export async function regenerateAccessToken(
  id: string,
  userId: string
): Promise<string> {
  // Check experience exists
  const existing = await repository.getSearchExperienceById(id);
  if (!existing) {
    throw new NotFoundError('Search experience', id);
  }

  const newToken = await repository.regenerateAccessToken(id);
  if (!newToken) {
    throw new SearchExperienceError('Failed to regenerate access token', 'INTERNAL_ERROR', 500);
  }

  // Invalidate cache (old token is no longer valid)
  await cache.invalidateExperience(id, existing.accessToken);

  logger.info('Regenerated access token', { id, userId });

  return newToken;
}

// ============================================================================
// SEARCH EXPERIENCE: DELETE
// ============================================================================

/**
 * Delete a search experience
 */
export async function deleteSearchExperience(
  id: string,
  userId: string
): Promise<void> {
  // Check experience exists
  const existing = await repository.getSearchExperienceById(id);
  if (!existing) {
    throw new NotFoundError('Search experience', id);
  }

  const deleted = await repository.deleteSearchExperience(id);
  if (!deleted) {
    throw new SearchExperienceError('Failed to delete search experience', 'INTERNAL_ERROR', 500);
  }

  // Invalidate cache
  await cache.invalidateExperience(id, existing.accessToken);

  logger.info('Deleted search experience', { id, userId });
}

// ============================================================================
// SEARCH EXPERIENCE INDEXES
// ============================================================================

/**
 * Add an index to a search experience
 */
export async function addIndex(
  searchExperienceId: string,
  input: AddIndexDTO,
  userId: string
): Promise<SearchExperienceWithIndexes> {
  // Validate input
  const validated = addIndexSchema.parse(input);

  // Check experience exists
  const experience = await repository.getSearchExperienceById(searchExperienceId);
  if (!experience) {
    throw new NotFoundError('Search experience', searchExperienceId);
  }

  // Check search index exists
  const indexExists = await repository.searchIndexExists(validated.searchIndexId);
  if (!indexExists) {
    throw new ValidationError(`Search index not found: ${validated.searchIndexId}`);
  }

  // Check not already added
  const existingIndexes = await repository.getSearchExperienceIndexes(searchExperienceId);
  const alreadyAdded = existingIndexes.some((idx) => idx.searchIndexId === validated.searchIndexId);
  if (alreadyAdded) {
    throw new ValidationError('This index is already added to the search experience');
  }

  // Map to required input type
  const indexInput: AddSearchExperienceIndexInput = {
    searchIndexId: validated.searchIndexId,
    role: validated.role,
    weight: validated.weight,
    sortOrder: validated.sortOrder,
    aiDescription: validated.aiDescription,
  };

  await repository.addSearchExperienceIndex(searchExperienceId, indexInput);

  // Update experience timestamp
  await repository.updateSearchExperience(searchExperienceId, { updatedBy: userId });

  // Invalidate cache (indexes changed)
  await cache.invalidateExperience(searchExperienceId, experience.accessToken);

  logger.info('Added index to search experience', {
    searchExperienceId,
    searchIndexId: validated.searchIndexId,
    userId,
  });

  // Return updated experience
  const updated = await repository.getSearchExperienceWithIndexes(searchExperienceId);
  if (!updated) {
    throw new NotFoundError('Search experience', searchExperienceId);
  }

  // Cache the updated experience
  cache.set(updated);

  return updated;
}

/**
 * Update an index in a search experience
 */
export async function updateIndex(
  searchExperienceId: string,
  searchIndexId: string,
  input: UpdateIndexDTO,
  userId: string
): Promise<SearchExperienceWithIndexes> {
  // Validate input
  const validated = updateIndexSchema.parse(input);

  // Check experience exists
  const experience = await repository.getSearchExperienceById(searchExperienceId);
  if (!experience) {
    throw new NotFoundError('Search experience', searchExperienceId);
  }

  const updated = await repository.updateSearchExperienceIndex(
    searchExperienceId,
    searchIndexId,
    validated
  );

  if (!updated) {
    throw new NotFoundError('Search experience index', searchIndexId);
  }

  // Update experience timestamp
  await repository.updateSearchExperience(searchExperienceId, { updatedBy: userId });

  // Invalidate cache (index config changed)
  await cache.invalidateExperience(searchExperienceId, experience.accessToken);

  logger.info('Updated index in search experience', {
    searchExperienceId,
    searchIndexId,
    userId,
  });

  // Return updated experience
  const result = await repository.getSearchExperienceWithIndexes(searchExperienceId);
  if (!result) {
    throw new NotFoundError('Search experience', searchExperienceId);
  }

  // Cache the updated experience
  cache.set(result);

  return result;
}

/**
 * Remove an index from a search experience
 */
export async function removeIndex(
  searchExperienceId: string,
  searchIndexId: string,
  userId: string
): Promise<SearchExperienceWithIndexes> {
  // Check experience exists
  const experience = await repository.getSearchExperienceWithIndexes(searchExperienceId);
  if (!experience) {
    throw new NotFoundError('Search experience', searchExperienceId);
  }

  // Ensure at least one index remains
  if (experience.indexes.length <= 1) {
    throw new ValidationError('Cannot remove the last index from a search experience');
  }

  const removed = await repository.removeSearchExperienceIndex(searchExperienceId, searchIndexId);
  if (!removed) {
    throw new NotFoundError('Search experience index', searchIndexId);
  }

  // Update experience timestamp
  await repository.updateSearchExperience(searchExperienceId, { updatedBy: userId });

  // Invalidate cache (indexes changed)
  await cache.invalidateExperience(searchExperienceId, experience.accessToken);

  logger.info('Removed index from search experience', {
    searchExperienceId,
    searchIndexId,
    userId,
  });

  // Return updated experience
  const updated = await repository.getSearchExperienceWithIndexes(searchExperienceId);
  if (!updated) {
    throw new NotFoundError('Search experience', searchExperienceId);
  }

  // Cache the updated experience
  cache.set(updated);

  return updated;
}

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Validate CORS origin
 */
export function validateOrigin(
  experience: SearchExperienceWithIndexes,
  origin: string | null
): boolean {
  // If no origins configured, allow all
  if (!experience.allowedOrigins || experience.allowedOrigins.length === 0) {
    return true;
  }

  // If origin is null, only allow if explicitly configured
  if (!origin) {
    return false;
  }

  // Check if origin is in allowed list
  return experience.allowedOrigins.includes(origin);
}

// ============================================================================
// AI-POWERED CUSTOM INSTRUCTIONS GENERATION
// ============================================================================

export interface GenerateCustomInstructionsInput {
  experienceName: string;
  experienceDescription?: string;
  indexIds: string[];
  additionalContext?: string;
  type: 'summary';
}

/**
 * Generate custom instructions using AI based on index information.
 */
export async function generateCustomInstructions(
  input: GenerateCustomInstructionsInput,
): Promise<string> {
  const { experienceName, experienceDescription, indexIds, additionalContext, type } = input;

  logger.info('Generating custom instructions', { experienceName, indexCount: indexIds.length, type });

  const searchIndexService = await import('@/features/search-index/search-index.service');
  const aiService = await import('@/features/ai-service/ai-service.service');
  const { getGenerateCustomInstructionsPrompt } = await import('@/features/chat/prompts');

  const indexInfos = await Promise.all(
    indexIds.map(async (indexId) => {
      const index = await searchIndexService.getSearchIndexById(indexId);
      return index ?? null;
    }),
  );
  const validIndexes = indexInfos.filter((idx) => idx !== null);

  if (validIndexes.length === 0) {
    throw new Error('No valid indexes found for generating instructions');
  }

  let prompt = getGenerateCustomInstructionsPrompt()
    .replace('{{experienceName}}', experienceName || 'Unnamed Experience')
    .replace('{{experienceDescription}}', experienceDescription || 'No description provided');

  const indexInfoSection = validIndexes.map((index) => {
    const fieldsInfo = (index.fields || [])
      .filter((f) => !f.isSystemField)
      .slice(0, 20)
      .map((f) => `- **${f.displayName || f.fieldName}** (${f.fieldName}): ${f.fieldType}`)
      .join('\n');

    return `### Index: ${index.name}\nFields:\n${fieldsInfo}`;
  }).join('\n\n');

  prompt = prompt.replace(/\{\{#each indexes\}\}[\s\S]*?\{\{\/each\}\}/g, indexInfoSection);

  if (additionalContext) {
    prompt = prompt.replace(/\{\{#if additionalContext\}\}[\s\S]*?\{\{\/if\}\}/g, `<user_context>\n${additionalContext}\n</user_context>`);
  } else {
    prompt = prompt.replace(/\{\{#if additionalContext\}\}[\s\S]*?\{\{\/if\}\}/g, '');
  }

  prompt += '\n\nNote: These instructions are for SUMMARY generation. Focus on how to summarize and present information concisely.';

  const response = await aiService.chat(
    [
      { role: 'system', content: prompt },
      { role: 'user', content: 'Generate custom instructions for this search experience.' },
    ],
    { maxTokens: 1500, temperature: 0.7, feature: 'custom_instructions_generation' },
  );

  const content = response.message.content;
  if (typeof content === 'string') return content;

  return content
    .filter((block): block is { type: 'text'; text: string } => block.type === 'text')
    .map((block) => block.text)
    .join('\n');
}
