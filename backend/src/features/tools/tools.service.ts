// src/features/tools/tools.service.ts

import { CacheManager } from '@/shared/cache/cache-manager';
import { cacheConfig } from '@/config/cache.config';
import { createLogger } from '@/shared/logger/logger';
import * as repository from './tools.repository';
import { aiExperienceCache } from '../ai-experience/ai-experience.cache';
import { generateToolDescription } from './tools.description-generator';
import { checkLookupFieldsForSave, lookupFieldsContext, suggestLookupFieldsFor } from './lookup-fields.service';
import { hasChosenLookupFields } from './executors/data-source/lookup-field-rules';
import { dataSourceConfigProblem } from './tools.validation';
import {
  getOperationsForDataSource,
  generateToolSlug,
  generateToolName,
  type DataSourceType,
  type DataSourceOperation,
} from './tools.registry';
import type {
  CreateToolDTO,
  UpdateToolDTO,
  ListToolsQuery,
  ToolWithUsage,
  ToolListResponse,
  Tool,
} from './tools.types';
import type { DataSourceSchema } from '@/db/schema/data-sources.schema';

const logger = createLogger('tools-service');
const cache = new CacheManager('tools', {
  defaultTTL: cacheConfig.ttl.medium,
});

// ============================================================================
// HELPERS
// ============================================================================

async function clearListCache() {
  await cache.clear();
}

// ============================================================================
// CRUD OPERATIONS
// ============================================================================

/**
 * Check a tool's executor config against its operation before it is stored: the config's shape,
 * and a Find Record tool's name and code fields against its data source (only the fields this
 * save adds). Throws "Invalid config: ..." (a 400).
 */
async function checkExecutorConfig(
  operation: string | null | undefined,
  dataSourceId: string | null | undefined,
  config: Record<string, unknown> | undefined,
  previous?: Record<string, unknown> | null,
): Promise<void> {
  const problem = dataSourceConfigProblem(operation, config);
  if (problem) throw new Error(`Invalid config: ${problem}`);
  if (operation === 'lookup') await checkLookupFieldsForSave(dataSourceId, config, previous ?? undefined);
}

export async function createTool(input: CreateToolDTO, userId?: string) {
  const slugAvailable = await repository.isSlugAvailable(input.slug);
  if (!slugAvailable) {
    throw new Error(`Tool with slug "${input.slug}" already exists`);
  }
  if (input.executorType === 'data_source') {
    await checkExecutorConfig(input.operation, input.dataSourceId, input.executorConfig as Record<string, unknown> | undefined);
  }

  const created = await repository.createTool({
    name: input.name,
    slug: input.slug,
    description: input.description,
    executorType: input.executorType,
    operation: input.operation ?? undefined,
    executorConfig: input.executorConfig as any,
    aiDescription: input.aiDescription,
    inputSchema: input.inputSchema as Record<string, unknown>,
    outputSchema: input.outputSchema as Record<string, unknown>,
    timeout: input.timeout,
    retryConfig: input.retryConfig as any,
    fallbackConfig: input.fallbackConfig as any,
    healthCheckConfig: input.healthCheckConfig as any,
    dataSourceId: input.dataSourceId ?? undefined,
    isSystem: input.isSystem,
    createdBy: userId,
  });

  await clearListCache();
  logger.info('Created tool', {
    toolId: created.id,
    slug: created.slug,
    executorType: created.executorType,
    operation: created.operation,
    userId,
  });

  return created;
}

/**
 * Scaffold standard tools for a data source based on its type.
 * Creates one tool per supported operation. Skips operations that already have a tool.
 */
export async function createToolsForDataSource(
  dataSourceId: string,
  dataSourceName: string,
  dataSourceSlug: string,
  dataSourceType: DataSourceType,
  schema?: DataSourceSchema | null,
  userId?: string,
): Promise<Tool[]> {
  const operations = getOperationsForDataSource(dataSourceType);
  const existingTools = await repository.getToolsByDataSourceId(dataSourceId);
  const existingOperations = new Set(existingTools.map(t => t.operation));

  const createdTools: Tool[] = [];

  for (const capability of operations) {
    // Skip if a tool already exists for this operation
    if (existingOperations.has(capability.operation)) {
      logger.info('Skipping tool creation — already exists', {
        dataSourceId,
        operation: capability.operation,
      });
      continue;
    }

    const slug = generateToolSlug(dataSourceSlug, capability.operation);
    const name = generateToolName(dataSourceName, capability.operation);

    // Check slug availability, append suffix if needed
    let finalSlug = slug;
    let slugAvailable = await repository.isSlugAvailable(finalSlug);
    if (!slugAvailable) {
      finalSlug = `${slug}-${Date.now().toString(36)}`;
      slugAvailable = await repository.isSlugAvailable(finalSlug);
      if (!slugAvailable) {
        logger.warn('Slug collision for scaffolded tool, skipping', { slug, dataSourceId });
        continue;
      }
    }

    const { aiDescription, inputSchema } = generateToolDescription(
      dataSourceName,
      dataSourceType,
      capability.operation,
      schema,
    );

    // Find Record starts with the name and code fields the data source's fields suggest; the
    // admin reviews them on the tool. Nothing found, or the fields can't be read: the tool needs
    // them before it is used, and the other tools are still created.
    const executorConfig = capability.operation === 'lookup' && dataSourceType !== 'file_store'
      ? { ...capability.defaultConfig, ...nonEmpty(await suggestLookupFieldsFor(dataSourceId).catch(() => NO_SUGGESTION)) }
      : capability.defaultConfig;

    const tool = await repository.createTool({
      name,
      slug: finalSlug,
      description: capability.description,
      executorType: 'data_source',
      operation: capability.operation,
      executorConfig: executorConfig as any,
      aiDescription,
      inputSchema,
      dataSourceId,
      isSystem: true,
      createdBy: userId,
    });

    createdTools.push(tool);
  }

  if (createdTools.length > 0) {
    await clearListCache();
  }

  logger.info('Scaffolded tools for data source', {
    dataSourceId,
    dataSourceType,
    created: createdTools.length,
    operations: createdTools.map(t => t.operation),
  });

  return createdTools;
}

/**
 * Rebuild the generated schemas of a data source's scaffolded tools.
 *
 * A tool's inputSchema is generated once, at scaffold time — including the
 * `filters[].field` enum, which is the only list of filterable fields the model
 * ever sees. Making a field filterable afterwards therefore had no effect: the
 * field never entered the enum, so the model could not filter on it and the user
 * saw the filter silently ignored.
 *
 * Only `isSystem` tools are touched. A hand-created or hand-edited tool has an
 * aiDescription someone wrote deliberately, and regenerating would discard it.
 *
 * Best-effort by design: this runs as a side effect of a field-config change,
 * and a stale enum must not fail that change.
 *
 * @returns how many tools were updated
 */
export async function regenerateSchemasForDataSource(
  dataSourceId: string,
  dataSourceName: string,
  dataSourceType: DataSourceType,
  schema?: DataSourceSchema | null,
): Promise<number> {
  const existingTools = await repository.getToolsByDataSourceId(dataSourceId);
  let updated = 0;

  for (const tool of existingTools) {
    if (!tool.isSystem || !tool.operation) {
      continue;
    }

    try {
      const { aiDescription, inputSchema } = generateToolDescription(
        dataSourceName,
        dataSourceType,
        tool.operation as DataSourceOperation,
        schema,
      );
      await repository.updateTool(tool.id, { aiDescription, inputSchema });
      updated++;
    } catch (err) {
      logger.warn('Failed to regenerate tool schema', {
        toolId: tool.id,
        slug: tool.slug,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  if (updated > 0) {
    await clearListCache();
    logger.info('Regenerated tool schemas after schema change', { dataSourceId, updated });
  }

  return updated;
}

// ============================================================================
// DESCRIPTION GENERATION (for UI pre-fill)
// ============================================================================

export function generateDescription(
  dataSourceName: string,
  dataSourceType: DataSourceType,
  operation: DataSourceOperation,
  schema?: DataSourceSchema | null,
) {
  return generateToolDescription(dataSourceName, dataSourceType, operation, schema);
}

// ============================================================================
// READ OPERATIONS
// ============================================================================

export async function getToolById(id: string) {
  const cacheKey = `detail:${id}`;
  const cached = cache.get<Tool>(cacheKey);
  if (cached) return cached;

  const tool = await repository.getToolById(id);
  if (tool) {
    cache.set(cacheKey, tool);
  }
  return tool;
}

export async function getToolBySlug(slug: string) {
  const cacheKey = `slug:${slug}`;
  const cached = cache.get<Tool>(cacheKey);
  if (cached) return cached;

  const tool = await repository.getToolBySlug(slug);
  if (tool) {
    cache.set(cacheKey, tool);
  }
  return tool;
}

export async function listTools(query: ListToolsQuery): Promise<ToolListResponse> {
  const result = await repository.listTools(query);
  return {
    tools: result.tools as ToolWithUsage[],
    pagination: result.pagination,
  };
}

export async function getAllActiveTools() {
  const cacheKey = 'all-active';
  const cached = cache.get<Tool[]>(cacheKey);
  if (cached) return cached;

  const result = await repository.getAllActiveTools();
  cache.set(cacheKey, result);
  return result;
}

export async function getToolsByDataSourceId(dataSourceId: string) {
  return repository.getToolsByDataSourceId(dataSourceId);
}

// ============================================================================
// UPDATE / DELETE
// ============================================================================

export async function updateTool(id: string, input: UpdateToolDTO, userId?: string) {
  const existing = await repository.getToolById(id);
  if (!existing) return null;
  if (input.executorConfig !== undefined && existing.executorType === 'data_source') {
    await checkExecutorConfig(
      existing.operation,
      existing.dataSourceId,
      input.executorConfig as Record<string, unknown>,
      existing.executorConfig as Record<string, unknown> | null,
    );
  }

  const updated = await repository.updateTool(id, {
    ...(input.name !== undefined && { name: input.name }),
    ...(input.description !== undefined && { description: input.description }),
    ...(input.executorConfig !== undefined && { executorConfig: input.executorConfig as any }),
    ...(input.aiDescription !== undefined && { aiDescription: input.aiDescription }),
    ...(input.inputSchema !== undefined && { inputSchema: input.inputSchema as Record<string, unknown> }),
    ...(input.outputSchema !== undefined && { outputSchema: input.outputSchema as Record<string, unknown> }),
    ...(input.timeout !== undefined && { timeout: input.timeout }),
    ...(input.retryConfig !== undefined && { retryConfig: input.retryConfig as any }),
    ...(input.fallbackConfig !== undefined && { fallbackConfig: input.fallbackConfig as any }),
    ...(input.healthCheckConfig !== undefined && { healthCheckConfig: input.healthCheckConfig as any }),
    ...(input.isActive !== undefined && { isActive: input.isActive }),
    ...(input.isSystem !== undefined && { isSystem: input.isSystem }),
    ...(input.displayConfig !== undefined && { displayConfig: input.displayConfig as any }),
    updatedBy: userId,
  });

  if (updated) {
    await cache.delete(`detail:${id}`);
    await cache.delete(`slug:${existing.slug}`);
    await clearListCache();
    await aiExperienceCache.clear();
    logger.info('Updated tool', { toolId: id, slug: existing.slug, userId });
  }

  return updated;
}

export async function deleteTool(id: string, userId?: string) {
  const existing = await repository.getToolById(id);
  if (!existing) return false;

  const experienceCount = await repository.getToolExperienceCount(id);
  if (experienceCount > 0) {
    throw new Error(
      `Cannot delete tool "${existing.name}" — it is used by ${experienceCount} AI experience(s). Remove it from all experiences first.`
    );
  }

  const deleted = await repository.deleteTool(id);
  if (!deleted) return false;

  await cache.delete(`detail:${id}`);
  await cache.delete(`slug:${existing.slug}`);
  await clearListCache();
  logger.info('Deleted tool', { toolId: id, slug: existing.slug, userId });

  return true;
}

export async function isSlugAvailable(slug: string, excludeId?: string) {
  return repository.isSlugAvailable(slug, excludeId);
}

export async function getToolExperienceCount(toolId: string) {
  return repository.getToolExperienceCount(toolId);
}

/** The lists that have something in them, so an empty suggestion stores nothing. */
const NO_SUGGESTION = { nameFields: [], codeFields: [] };

function nonEmpty(lists: { nameFields: string[]; codeFields: string[] }): Record<string, string[]> {
  return Object.fromEntries(Object.entries(lists).filter(([, list]) => list.length > 0));
}

/**
 * Why a tool can't be added to an AI experience yet, or undefined when it can. A Find Record
 * tool on a search index needs its name or code fields (or a hand-set idField) first; one that
 * is already in an experience keeps working there as before.
 */
export async function notReadyToAssign(tool: Pick<Tool, 'name' | 'operation' | 'dataSourceId' | 'executorConfig'>): Promise<string | undefined> {
  if (tool.operation !== 'lookup' || hasChosenLookupFields(tool.executorConfig as Record<string, unknown> | null ?? undefined)) {
    return undefined;
  }
  if (!(await lookupFieldsContext(tool.dataSourceId))) return undefined;
  return `Find Record tool "${tool.name}" isn't set up: choose its name or code fields on the tool first`;
}

/** The tools that can be added to an AI experience, and why each of the others can't. */
export async function splitReadyToAssign<T extends Pick<Tool, 'name' | 'operation' | 'dataSourceId' | 'executorConfig'>>(
  tools: T[],
): Promise<{ ready: T[]; notReady: string[] }> {
  const ready: T[] = [];
  const notReady: string[] = [];
  for (const tool of tools) {
    const reason = await notReadyToAssign(tool);
    if (reason) notReady.push(reason);
    else ready.push(tool);
  }
  return { ready, notReady };
}
