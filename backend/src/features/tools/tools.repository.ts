// src/features/tools/tools.repository.ts

import { eq, desc, asc, like, and, sql, count, getTableColumns } from 'drizzle-orm';
import { tools, aiExperienceTools } from '@/db/schema';
import { db } from '@/db/index';
import { createLogger } from '@/shared/logger/logger';
import type { ListToolsQuery } from './tools.types';

const logger = createLogger('tools-repository');

export async function getToolById(id: string) {
  try {
    const result = await db.query.tools.findFirst({
      where: eq(tools.id, id),
    });
    return result || null;
  } catch (error) {
    logger.error('Failed to get tool by id', error as Error, { id });
    throw error;
  }
}

export async function getToolBySlug(slug: string) {
  try {
    const result = await db.query.tools.findFirst({
      where: eq(tools.slug, slug),
    });
    return result || null;
  } catch (error) {
    logger.error('Failed to get tool by slug', error as Error, { slug });
    throw error;
  }
}

export async function listTools(query: ListToolsQuery) {
  try {
    const conditions = [];

    if (query.executorType) {
      conditions.push(eq(tools.executorType, query.executorType));
    }
    if (query.operation) {
      conditions.push(eq(tools.operation, query.operation));
    }
    if (query.isActive !== undefined) {
      conditions.push(eq(tools.isActive, query.isActive));
    }
    if (query.isSystem !== undefined) {
      conditions.push(eq(tools.isSystem, query.isSystem));
    }
    if (query.dataSourceId) {
      conditions.push(eq(tools.dataSourceId, query.dataSourceId));
    }
    if (query.search) {
      conditions.push(like(tools.name, `%${query.search}%`));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Get total count
    const [countResult] = await db
      .select({ total: count() })
      .from(tools)
      .where(whereClause);
    const totalItems = countResult?.total || 0;

    // Sort
    const sortColumn = query.sortBy === 'name' ? tools.name
      : query.sortBy === 'executorType' ? tools.executorType
      : tools.createdAt;
    const sortFn = query.sortOrder === 'asc' ? asc : desc;

    // Get paginated results (with experience count via correlated subquery)
    const offset = (query.page - 1) * query.pageSize;
    const results = await db.select({
      ...getTableColumns(tools),
      experienceCount: sql<number>`(SELECT COUNT(*)::int FROM "ai_experience_tools" WHERE "ai_experience_tools"."tool_id" = "tools"."id")`.mapWith(Number),
    })
      .from(tools)
      .where(whereClause)
      .orderBy(sortFn(sortColumn))
      .limit(query.pageSize)
      .offset(offset);

    return {
      tools: results,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        totalItems,
        totalPages: Math.ceil(totalItems / query.pageSize),
      },
    };
  } catch (error) {
    logger.error('Failed to list tools', error as Error);
    throw error;
  }
}

export async function getAllActiveTools() {
  try {
    return await db.select()
      .from(tools)
      .where(eq(tools.isActive, true))
      .orderBy(asc(tools.name));
  } catch (error) {
    logger.error('Failed to get all active tools', error as Error);
    throw error;
  }
}

export async function getToolsByDataSourceId(dataSourceId: string) {
  try {
    return await db.select()
      .from(tools)
      .where(and(
        eq(tools.dataSourceId, dataSourceId),
        eq(tools.isActive, true),
      ))
      .orderBy(asc(tools.name));
  } catch (error) {
    logger.error('Failed to get tools by data source id', error as Error, { dataSourceId });
    throw error;
  }
}

export async function createTool(data: typeof tools.$inferInsert) {
  try {
    const [created] = await db.insert(tools).values(data).returning();
    return created;
  } catch (error) {
    logger.error('Failed to create tool', error as Error, { slug: data.slug });
    throw error;
  }
}

export async function updateTool(id: string, data: Partial<typeof tools.$inferInsert>) {
  try {
    const [updated] = await db.update(tools)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(tools.id, id))
      .returning();
    return updated || null;
  } catch (error) {
    logger.error('Failed to update tool', error as Error, { id });
    throw error;
  }
}

export async function deleteTool(id: string) {
  try {
    const [deleted] = await db.delete(tools)
      .where(eq(tools.id, id))
      .returning();
    return deleted || null;
  } catch (error) {
    logger.error('Failed to delete tool', error as Error, { id });
    throw error;
  }
}

export async function isSlugAvailable(slug: string, excludeId?: string) {
  try {
    const existing = await db.query.tools.findFirst({
      where: eq(tools.slug, slug),
    });
    if (!existing) return true;
    if (excludeId && existing.id === excludeId) return true;
    return false;
  } catch (error) {
    logger.error('Failed to check slug availability', error as Error, { slug });
    throw error;
  }
}

export async function getToolExperienceCount(toolId: string): Promise<number> {
  try {
    const [result] = await db
      .select({ total: count() })
      .from(aiExperienceTools)
      .where(eq(aiExperienceTools.toolId, toolId));
    return result?.total || 0;
  } catch (error) {
    logger.error('Failed to get tool experience count', error as Error, { toolId });
    throw error;
  }
}
