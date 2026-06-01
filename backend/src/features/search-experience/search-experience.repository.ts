// src/features/search-experience/search-experience.repository.ts

/**
 * Search Experience Repository
 *
 * Database operations for search experiences and indexes.
 */

import 'server-only';

import { eq, desc, asc, ilike, or, and, sql, count } from 'drizzle-orm';
import { db } from '@/db/index';
import {
  searchExperiences,
  searchExperienceIndexes,
  searchIndex,
} from '@/db/schema';
import type {
  SearchExperience,
  NewSearchExperience,
  SearchExperienceIndex,
  NewSearchExperienceIndex,
} from '@/db/schema/search-experience.schema';
import type {
  SearchExperienceWithIndexes,
  SearchExperienceSummary,
  AddSearchExperienceIndexInput,
  UpdateSearchExperienceIndexInput,
} from './search-experience.types';
import { createLogger } from '@/shared/logger/logger';

const logger = createLogger('search-experience-repository');

// ============================================================================
// SEARCH EXPERIENCE: CREATE
// ============================================================================

/**
 * Create a new search experience
 */
export async function createSearchExperience(
  data: Omit<NewSearchExperience, 'id' | 'accessToken' | 'createdAt' | 'updatedAt'>
): Promise<SearchExperience> {
  try {
    const [created] = await db
      .insert(searchExperiences)
      .values(data)
      .returning();

    logger.info('Created search experience', {
      id: created.id,
      name: created.name,
      slug: created.slug,
    });

    return created;
  } catch (error) {
    logger.error('Failed to create search experience', error as Error);
    throw error;
  }
}

/**
 * Create search experience with indexes in a transaction
 */
export async function createSearchExperienceWithIndexes(
  experienceData: Omit<NewSearchExperience, 'id' | 'accessToken' | 'createdAt' | 'updatedAt'>,
  indexesData: AddSearchExperienceIndexInput[]
): Promise<SearchExperienceWithIndexes> {
  try {
    return await db.transaction(async (tx) => {
      // Create the experience
      const [experience] = await tx
        .insert(searchExperiences)
        .values(experienceData)
        .returning();

      // Create the index associations
      const indexRecords: NewSearchExperienceIndex[] = indexesData.map((idx, i) => ({
        searchExperienceId: experience.id,
        searchIndexId: idx.searchIndexId,
        role: idx.role || 'primary',
        weight: idx.weight || 1.0,
        sortOrder: idx.sortOrder ?? i,
        aiDescription: idx.aiDescription,
      }));

      const createdIndexes = await tx
        .insert(searchExperienceIndexes)
        .values(indexRecords)
        .returning();

      // Fetch the full index details
      const indexesWithDetails = await Promise.all(
        createdIndexes.map(async (sei) => {
          const [idx] = await tx
            .select({
              id: searchIndex.id,
              name: searchIndex.name,
              displayName: searchIndex.displayName,
              description: searchIndex.description,
              searchType: searchIndex.searchType,
              searchProvider: searchIndex.searchProvider,
              isActive: searchIndex.isActive,
            })
            .from(searchIndex)
            .where(eq(searchIndex.id, sei.searchIndexId));

          return {
            ...sei,
            searchIndex: idx,
          };
        })
      );

      logger.info('Created search experience with indexes', {
        id: experience.id,
        name: experience.name,
        indexCount: createdIndexes.length,
      });

      return {
        ...experience,
        indexes: indexesWithDetails,
      };
    });
  } catch (error) {
    logger.error('Failed to create search experience with indexes', error as Error);
    throw error;
  }
}

// ============================================================================
// SEARCH EXPERIENCE: READ
// ============================================================================

/**
 * Get search experience by ID
 */
export async function getSearchExperienceById(
  id: string
): Promise<SearchExperience | null> {
  try {
    const [experience] = await db
      .select()
      .from(searchExperiences)
      .where(eq(searchExperiences.id, id));

    return experience || null;
  } catch (error) {
    logger.error('Failed to get search experience by ID', error as Error);
    throw error;
  }
}

/**
 * Get search experience by ID with indexes
 */
export async function getSearchExperienceWithIndexes(
  id: string
): Promise<SearchExperienceWithIndexes | null> {
  try {
    const [experience] = await db
      .select()
      .from(searchExperiences)
      .where(eq(searchExperiences.id, id));

    if (!experience) {
      return null;
    }

    // Get indexes with search index details
    const indexes = await db
      .select({
        id: searchExperienceIndexes.id,
        searchExperienceId: searchExperienceIndexes.searchExperienceId,
        searchIndexId: searchExperienceIndexes.searchIndexId,
        role: searchExperienceIndexes.role,
        weight: searchExperienceIndexes.weight,
        sortOrder: searchExperienceIndexes.sortOrder,
        aiDescription: searchExperienceIndexes.aiDescription,
        createdAt: searchExperienceIndexes.createdAt,
        // Search index fields
        searchIndex: {
          id: searchIndex.id,
          name: searchIndex.name,
          displayName: searchIndex.displayName,
          description: searchIndex.description,
          searchType: searchIndex.searchType,
          searchProvider: searchIndex.searchProvider,
          isActive: searchIndex.isActive,
        },
      })
      .from(searchExperienceIndexes)
      .innerJoin(searchIndex, eq(searchExperienceIndexes.searchIndexId, searchIndex.id))
      .where(eq(searchExperienceIndexes.searchExperienceId, id))
      .orderBy(asc(searchExperienceIndexes.sortOrder));

    return {
      ...experience,
      indexes,
    };
  } catch (error) {
    logger.error('Failed to get search experience with indexes', error as Error);
    throw error;
  }
}

/**
 * Get search experience by slug
 */
export async function getSearchExperienceBySlug(
  slug: string
): Promise<SearchExperience | null> {
  try {
    const [experience] = await db
      .select()
      .from(searchExperiences)
      .where(eq(searchExperiences.slug, slug));

    return experience || null;
  } catch (error) {
    logger.error('Failed to get search experience by slug', error as Error);
    throw error;
  }
}

/**
 * Get search experience by access token
 */
export async function getSearchExperienceByAccessToken(
  accessToken: string
): Promise<SearchExperienceWithIndexes | null> {
  try {
    const [experience] = await db
      .select()
      .from(searchExperiences)
      .where(eq(searchExperiences.accessToken, accessToken));

    if (!experience) {
      return null;
    }

    // Get indexes with search index details
    const indexes = await db
      .select({
        id: searchExperienceIndexes.id,
        searchExperienceId: searchExperienceIndexes.searchExperienceId,
        searchIndexId: searchExperienceIndexes.searchIndexId,
        role: searchExperienceIndexes.role,
        weight: searchExperienceIndexes.weight,
        sortOrder: searchExperienceIndexes.sortOrder,
        aiDescription: searchExperienceIndexes.aiDescription,
        createdAt: searchExperienceIndexes.createdAt,
        searchIndex: {
          id: searchIndex.id,
          name: searchIndex.name,
          displayName: searchIndex.displayName,
          description: searchIndex.description,
          searchType: searchIndex.searchType,
          searchProvider: searchIndex.searchProvider,
          isActive: searchIndex.isActive,
        },
      })
      .from(searchExperienceIndexes)
      .innerJoin(searchIndex, eq(searchExperienceIndexes.searchIndexId, searchIndex.id))
      .where(eq(searchExperienceIndexes.searchExperienceId, experience.id))
      .orderBy(asc(searchExperienceIndexes.sortOrder));

    return {
      ...experience,
      indexes,
    };
  } catch (error) {
    logger.error('Failed to get search experience by access token', error as Error);
    throw error;
  }
}

/**
 * List search experiences with pagination and filtering
 */
export async function listSearchExperiences(options: {
  page: number;
  pageSize: number;
  search?: string;
  isActive?: boolean;
  sortBy?: 'name' | 'createdAt' | 'updatedAt';
  sortOrder?: 'asc' | 'desc';
  createdBy?: string;
}): Promise<{ items: SearchExperienceSummary[]; total: number }> {
  try {
    const { page, pageSize, search, isActive, sortBy = 'createdAt', sortOrder = 'desc', createdBy } = options;
    const offset = (page - 1) * pageSize;

    // Build where conditions
    const conditions = [];
    if (search) {
      conditions.push(
        or(
          ilike(searchExperiences.name, `%${search}%`),
          ilike(searchExperiences.slug, `%${search}%`),
          ilike(searchExperiences.description, `%${search}%`)
        )
      );
    }
    if (isActive !== undefined) {
      conditions.push(eq(searchExperiences.isActive, isActive));
    }
    if (createdBy) {
      conditions.push(eq(searchExperiences.createdBy, createdBy));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Get sort column
    const sortColumn = {
      name: searchExperiences.name,
      createdAt: searchExperiences.createdAt,
      updatedAt: searchExperiences.updatedAt,
    }[sortBy];

    const orderFn = sortOrder === 'asc' ? asc : desc;

    // Get total count
    const [{ total }] = await db
      .select({ total: count() })
      .from(searchExperiences)
      .where(whereClause);

    // Get items with index count
    const items = await db
      .select({
        id: searchExperiences.id,
        name: searchExperiences.name,
        slug: searchExperiences.slug,
        description: searchExperiences.description,
        isActive: searchExperiences.isActive,
        aiConfig: searchExperiences.aiConfig,
        createdAt: searchExperiences.createdAt,
        updatedAt: searchExperiences.updatedAt,
        indexCount: sql<number>`(
          SELECT COUNT(*)::int
          FROM "search_experience_indexes" sei
          WHERE sei."search_experience_id" = "search_experiences"."id"
        )`,
      })
      .from(searchExperiences)
      .where(whereClause)
      .orderBy(orderFn(sortColumn))
      .limit(pageSize)
      .offset(offset);

    const summaries: SearchExperienceSummary[] = items.map((item) => ({
      id: item.id,
      name: item.name,
      slug: item.slug,
      description: item.description,
      isActive: item.isActive,
      indexCount: item.indexCount,
      aiEnabled: item.aiConfig?.enabled ?? false,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    }));

    return { items: summaries, total };
  } catch (error) {
    logger.error('Failed to list search experiences', error as Error);
    throw error;
  }
}

// ============================================================================
// SEARCH EXPERIENCE: UPDATE
// ============================================================================

/**
 * Update a search experience
 */
export async function updateSearchExperience(
  id: string,
  data: Partial<Omit<NewSearchExperience, 'id' | 'accessToken' | 'createdAt' | 'createdBy'>>
): Promise<SearchExperience | null> {
  try {
    const [updated] = await db
      .update(searchExperiences)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(searchExperiences.id, id))
      .returning();

    if (updated) {
      logger.info('Updated search experience', { id, fields: Object.keys(data) });
    }

    return updated || null;
  } catch (error) {
    logger.error('Failed to update search experience', error as Error);
    throw error;
  }
}

/**
 * Regenerate access token for a search experience
 */
export async function regenerateAccessToken(id: string): Promise<string | null> {
  try {
    const [updated] = await db
      .update(searchExperiences)
      .set({
        accessToken: sql`gen_random_uuid()`,
        updatedAt: new Date(),
      })
      .where(eq(searchExperiences.id, id))
      .returning({ accessToken: searchExperiences.accessToken });

    if (updated) {
      logger.info('Regenerated access token', { id });
      return updated.accessToken;
    }

    return null;
  } catch (error) {
    logger.error('Failed to regenerate access token', error as Error);
    throw error;
  }
}

// ============================================================================
// SEARCH EXPERIENCE: DELETE
// ============================================================================

/**
 * Delete a search experience (cascades to indexes)
 */
export async function deleteSearchExperience(id: string): Promise<boolean> {
  try {
    const result = await db
      .delete(searchExperiences)
      .where(eq(searchExperiences.id, id))
      .returning({ id: searchExperiences.id });

    const deleted = result.length > 0;
    if (deleted) {
      logger.info('Deleted search experience', { id });
    }

    return deleted;
  } catch (error) {
    logger.error('Failed to delete search experience', error as Error);
    throw error;
  }
}

// ============================================================================
// SEARCH EXPERIENCE INDEXES
// ============================================================================

/**
 * Add an index to a search experience
 */
export async function addSearchExperienceIndex(
  searchExperienceId: string,
  data: AddSearchExperienceIndexInput
): Promise<SearchExperienceIndex> {
  try {
    // Get max sort order
    const [maxOrder] = await db
      .select({ max: sql<number>`COALESCE(MAX(${searchExperienceIndexes.sortOrder}), -1)` })
      .from(searchExperienceIndexes)
      .where(eq(searchExperienceIndexes.searchExperienceId, searchExperienceId));

    const [created] = await db
      .insert(searchExperienceIndexes)
      .values({
        searchExperienceId,
        searchIndexId: data.searchIndexId,
        role: data.role || 'primary',
        weight: data.weight || 1.0,
        sortOrder: data.sortOrder ?? (maxOrder.max + 1),
        aiDescription: data.aiDescription,
      })
      .returning();

    logger.info('Added index to search experience', {
      searchExperienceId,
      searchIndexId: data.searchIndexId,
    });

    return created;
  } catch (error) {
    logger.error('Failed to add index to search experience', error as Error);
    throw error;
  }
}

/**
 * Update an index in a search experience
 */
export async function updateSearchExperienceIndex(
  searchExperienceId: string,
  searchIndexId: string,
  data: UpdateSearchExperienceIndexInput
): Promise<SearchExperienceIndex | null> {
  try {
    const [updated] = await db
      .update(searchExperienceIndexes)
      .set(data)
      .where(
        and(
          eq(searchExperienceIndexes.searchExperienceId, searchExperienceId),
          eq(searchExperienceIndexes.searchIndexId, searchIndexId)
        )
      )
      .returning();

    if (updated) {
      logger.info('Updated search experience index', {
        searchExperienceId,
        searchIndexId,
      });
    }

    return updated || null;
  } catch (error) {
    logger.error('Failed to update search experience index', error as Error);
    throw error;
  }
}

/**
 * Remove an index from a search experience
 */
export async function removeSearchExperienceIndex(
  searchExperienceId: string,
  searchIndexId: string
): Promise<boolean> {
  try {
    const result = await db
      .delete(searchExperienceIndexes)
      .where(
        and(
          eq(searchExperienceIndexes.searchExperienceId, searchExperienceId),
          eq(searchExperienceIndexes.searchIndexId, searchIndexId)
        )
      )
      .returning({ id: searchExperienceIndexes.id });

    const deleted = result.length > 0;
    if (deleted) {
      logger.info('Removed index from search experience', {
        searchExperienceId,
        searchIndexId,
      });
    }

    return deleted;
  } catch (error) {
    logger.error('Failed to remove index from search experience', error as Error);
    throw error;
  }
}

/**
 * Get indexes for a search experience
 */
export async function getSearchExperienceIndexes(
  searchExperienceId: string
): Promise<Array<SearchExperienceIndex & { searchIndex: { id: string; name: string; displayName: string; description: string | null; searchType: string; searchProvider: string; isActive: boolean } }>> {
  try {
    const indexes = await db
      .select({
        id: searchExperienceIndexes.id,
        searchExperienceId: searchExperienceIndexes.searchExperienceId,
        searchIndexId: searchExperienceIndexes.searchIndexId,
        role: searchExperienceIndexes.role,
        weight: searchExperienceIndexes.weight,
        sortOrder: searchExperienceIndexes.sortOrder,
        aiDescription: searchExperienceIndexes.aiDescription,
        createdAt: searchExperienceIndexes.createdAt,
        searchIndex: {
          id: searchIndex.id,
          name: searchIndex.name,
          displayName: searchIndex.displayName,
          description: searchIndex.description,
          searchType: searchIndex.searchType,
          searchProvider: searchIndex.searchProvider,
          isActive: searchIndex.isActive,
        },
      })
      .from(searchExperienceIndexes)
      .innerJoin(searchIndex, eq(searchExperienceIndexes.searchIndexId, searchIndex.id))
      .where(eq(searchExperienceIndexes.searchExperienceId, searchExperienceId))
      .orderBy(asc(searchExperienceIndexes.sortOrder));

    return indexes;
  } catch (error) {
    logger.error('Failed to get search experience indexes', error as Error);
    throw error;
  }
}

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Check if a slug is unique
 */
export async function isSlugUnique(slug: string, excludeId?: string): Promise<boolean> {
  try {
    const conditions = [eq(searchExperiences.slug, slug)];
    if (excludeId) {
      conditions.push(sql`${searchExperiences.id} != ${excludeId}`);
    }

    const [result] = await db
      .select({ count: count() })
      .from(searchExperiences)
      .where(and(...conditions));

    return result.count === 0;
  } catch (error) {
    logger.error('Failed to check slug uniqueness', error as Error);
    throw error;
  }
}

/**
 * Check if search index exists
 */
export async function searchIndexExists(id: string): Promise<boolean> {
  try {
    const [result] = await db
      .select({ count: count() })
      .from(searchIndex)
      .where(eq(searchIndex.id, id));

    return result.count > 0;
  } catch (error) {
    logger.error('Failed to check search index existence', error as Error);
    throw error;
  }
}
