// src/features/tools/tools.service.ts

import { CacheManager } from '@/shared/cache/cache-manager';
import { cacheConfig } from '@/config/cache.config';
import { createLogger } from '@/shared/logger/logger';
import * as repository from './tools.repository';
import { aiExperienceCache } from '../ai-experience/ai-experience.cache';
import { generateToolDescription } from './tools.description-generator';
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

export async function createTool(input: CreateToolDTO, userId?: string) {
  const slugAvailable = await repository.isSlugAvailable(input.slug);
  if (!slugAvailable) {
    throw new Error(`Tool with slug "${input.slug}" already exists`);
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

    const tool = await repository.createTool({
      name,
      slug: finalSlug,
      description: capability.description,
      executorType: 'data_source',
      operation: capability.operation,
      executorConfig: capability.defaultConfig as any,
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
