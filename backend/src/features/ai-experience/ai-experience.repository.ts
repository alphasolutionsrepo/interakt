// src/features/ai-experience/ai-experience.repository.ts

import { eq, desc, asc, and, count, sql } from 'drizzle-orm';
import { aiExperiences, aiExperienceTools } from '@/db/schema';
import { db } from '@/db/index';
import { createLogger } from '@/shared/logger/logger';
import { matchesExperienceSearch } from '@/shared/utils/experience-search';
import type { ListAIExperiencesQuery } from './ai-experience.types';

const logger = createLogger('ai-experience-repository');

// ============================================================================
// AI EXPERIENCE CRUD
// ============================================================================

export async function getAIExperienceById(id: string) {
  try {
    const result = await db.query.aiExperiences.findFirst({
      where: eq(aiExperiences.id, id),
      with: {
        tools: {
          with: {
            tool: true,
          },
          orderBy: asc(aiExperienceTools.sortOrder),
        },
        mcpConnections: {
          with: {
            mcpConnection: true,
          },
        },
      },
    });
    return result || null;
  } catch (error) {
    logger.error('Failed to get AI experience by id', error as Error, { id });
    throw error;
  }
}

export async function getAIExperienceBySlug(slug: string) {
  try {
    const result = await db.query.aiExperiences.findFirst({
      where: eq(aiExperiences.slug, slug),
      with: {
        tools: {
          with: {
            tool: true,
          },
          orderBy: asc(aiExperienceTools.sortOrder),
        },
        mcpConnections: {
          with: {
            mcpConnection: true,
          },
        },
      },
    });
    return result || null;
  } catch (error) {
    logger.error('Failed to get AI experience by slug', error as Error, { slug });
    throw error;
  }
}

export async function getAIExperienceByAccessToken(accessToken: string) {
  try {
    const result = await db.query.aiExperiences.findFirst({
      where: eq(aiExperiences.accessToken, accessToken),
      with: {
        tools: {
          with: {
            tool: true,
          },
          orderBy: asc(aiExperienceTools.sortOrder),
        },
        mcpConnections: {
          with: {
            mcpConnection: true,
          },
        },
      },
    });
    return result || null;
  } catch (error) {
    logger.error('Failed to get AI experience by access token', error as Error);
    throw error;
  }
}

function listConditions(query: Pick<ListAIExperiencesQuery, 'isActive' | 'pipelineMode' | 'search'>) {
  const conditions = [];
  if (query.isActive !== undefined) {
    conditions.push(eq(aiExperiences.isActive, query.isActive));
  }
  if (query.pipelineMode) {
    conditions.push(eq(aiExperiences.pipelineMode, query.pipelineMode));
  }
  if (query.search) {
    conditions.push(matchesExperienceSearch(aiExperiences, query.search));
  }
  return conditions.length > 0 ? and(...conditions) : undefined;
}

/** How many chat experiences match the filters, and how many of those are active: the whole set, not one page. */
export async function countAIExperiences(query: Pick<ListAIExperiencesQuery, 'isActive' | 'pipelineMode' | 'search'>) {
  const [row] = await db
    .select({ total: count(), active: sql<number>`count(*) filter (where ${aiExperiences.isActive})::int` })
    .from(aiExperiences)
    .where(listConditions(query));
  return { total: row?.total ?? 0, active: row?.active ?? 0 };
}

export async function listAIExperiences(query: ListAIExperiencesQuery) {
  try {
    const whereClause = listConditions(query);

    // Get total count
    const [countResult] = await db
      .select({ total: count() })
      .from(aiExperiences)
      .where(whereClause);
    const totalItems = countResult?.total || 0;

    // Sort
    const sortColumn = query.sortBy === 'name' ? aiExperiences.name : aiExperiences.createdAt;
    const sortFn = query.sortOrder === 'asc' ? asc : desc;

    // Get paginated results with tools
    const offset = (query.page - 1) * query.pageSize;
    const results = await db.query.aiExperiences.findMany({
      where: whereClause,
      with: {
        tools: {
          with: {
            tool: true,
          },
          orderBy: asc(aiExperienceTools.sortOrder),
        },
        mcpConnections: {
          with: {
            mcpConnection: true,
          },
        },
      },
      orderBy: sortFn(sortColumn),
      limit: query.pageSize,
      offset,
    });

    return {
      experiences: results,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        totalItems,
        totalPages: Math.ceil(totalItems / query.pageSize),
      },
    };
  } catch (error) {
    logger.error('Failed to list AI experiences', error as Error);
    throw error;
  }
}

export async function createAIExperience(
  data: typeof aiExperiences.$inferInsert,
  toolIds: string[]
) {
  try {
    return await db.transaction(async (tx) => {
      // Create the experience
      const [created] = await tx.insert(aiExperiences).values(data).returning();

      // Assign tools if any
      let assignedTools: (typeof aiExperienceTools.$inferSelect)[] = [];
      if (toolIds.length > 0) {
        assignedTools = await tx.insert(aiExperienceTools)
          .values(toolIds.map((toolId, index) => ({
            aiExperienceId: created.id,
            toolId,
            sortOrder: index,
          })))
          .returning();
      }

      return { ...created, tools: assignedTools };
    });
  } catch (error) {
    logger.error('Failed to create AI experience', error as Error, { slug: data.slug });
    throw error;
  }
}

export async function updateAIExperience(
  id: string,
  data: Partial<typeof aiExperiences.$inferInsert>
) {
  try {
    const [updated] = await db.update(aiExperiences)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(aiExperiences.id, id))
      .returning();
    return updated || null;
  } catch (error) {
    logger.error('Failed to update AI experience', error as Error, { id });
    throw error;
  }
}

export async function deleteAIExperience(id: string) {
  try {
    const [deleted] = await db.delete(aiExperiences)
      .where(eq(aiExperiences.id, id))
      .returning();
    return deleted || null;
  } catch (error) {
    logger.error('Failed to delete AI experience', error as Error, { id });
    throw error;
  }
}

export async function isSlugAvailable(slug: string, excludeId?: string) {
  try {
    const existing = await db.query.aiExperiences.findFirst({
      where: eq(aiExperiences.slug, slug),
    });
    if (!existing) return true;
    if (excludeId && existing.id === excludeId) return true;
    return false;
  } catch (error) {
    logger.error('Failed to check slug availability', error as Error, { slug });
    throw error;
  }
}

// ============================================================================
// TOOL ASSIGNMENT
// ============================================================================

export async function assignTool(
  experienceId: string,
  data: typeof aiExperienceTools.$inferInsert
) {
  try {
    const [created] = await db.insert(aiExperienceTools)
      .values({ ...data, aiExperienceId: experienceId })
      .returning();
    return created;
  } catch (error) {
    logger.error('Failed to assign tool', error as Error, { experienceId, toolId: data.toolId });
    throw error;
  }
}

export async function updateToolAssignment(
  experienceId: string,
  toolId: string,
  data: Partial<typeof aiExperienceTools.$inferInsert>
) {
  try {
    const [updated] = await db.update(aiExperienceTools)
      .set({ ...data, updatedAt: new Date() })
      .where(
        and(
          eq(aiExperienceTools.aiExperienceId, experienceId),
          eq(aiExperienceTools.toolId, toolId),
        )
      )
      .returning();
    return updated || null;
  } catch (error) {
    logger.error('Failed to update tool assignment', error as Error, { experienceId, toolId });
    throw error;
  }
}

export async function removeToolAssignment(experienceId: string, toolId: string) {
  try {
    const [deleted] = await db.delete(aiExperienceTools)
      .where(
        and(
          eq(aiExperienceTools.aiExperienceId, experienceId),
          eq(aiExperienceTools.toolId, toolId),
        )
      )
      .returning();
    return deleted || null;
  } catch (error) {
    logger.error('Failed to remove tool assignment', error as Error, { experienceId, toolId });
    throw error;
  }
}

export async function getToolAssignment(experienceId: string, toolId: string) {
  try {
    const result = await db.query.aiExperienceTools.findFirst({
      where: and(
        eq(aiExperienceTools.aiExperienceId, experienceId),
        eq(aiExperienceTools.toolId, toolId),
      ),
      with: {
        tool: true,
      },
    });
    return result || null;
  } catch (error) {
    logger.error('Failed to get tool assignment', error as Error, { experienceId, toolId });
    throw error;
  }
}
