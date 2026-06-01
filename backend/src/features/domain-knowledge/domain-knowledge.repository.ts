// src/features/domain-knowledge/domain-knowledge.repository.ts

/**
 * Domain Knowledge - Repository Layer
 *
 * Database operations for domain_knowledge table.
 * Handles CRUD operations for knowledge entries.
 */

import { db } from '@/db/index';
import { domainKnowledge } from '@/db/schema/domain-knowledge.schema';
import type { DomainKnowledge, NewDomainKnowledge } from '@/db/schema/domain-knowledge.schema';
import { eq, and, count, asc, desc } from 'drizzle-orm';
import { createLogger } from '@/shared/logger/logger';

const logger = createLogger('domain-knowledge-repository');

// ============================================================================
// CREATE OPERATIONS
// ============================================================================

/**
 * Create a single knowledge entry
 */
export async function createEntry(
  data: Omit<NewDomainKnowledge, 'id' | 'createdAt' | 'updatedAt'>
): Promise<DomainKnowledge> {
  try {
    const [created] = await db
      .insert(domainKnowledge)
      .values({
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    logger.info('Created knowledge entry', {
      entryId: created.id,
      searchIndexId: created.searchIndexId,
    });

    return created;
  } catch (error) {
    logger.error('Failed to create knowledge entry', error as Error, {
      searchIndexId: data.searchIndexId,
    });
    throw error;
  }
}

/**
 * Bulk create knowledge entries
 */
export async function createEntries(
  entries: Array<Omit<NewDomainKnowledge, 'id' | 'createdAt' | 'updatedAt'>>
): Promise<DomainKnowledge[]> {
  if (entries.length === 0) {
    return [];
  }

  try {
    const now = new Date();
    const entriesWithTimestamps = entries.map(e => ({
      ...e,
      createdAt: now,
      updatedAt: now,
    }));

    const created = await db
      .insert(domainKnowledge)
      .values(entriesWithTimestamps)
      .returning();

    logger.info('Bulk created knowledge entries', {
      count: created.length,
      searchIndexId: entries[0].searchIndexId,
    });

    return created;
  } catch (error) {
    logger.error('Failed to bulk create knowledge entries', error as Error);
    throw error;
  }
}

// ============================================================================
// READ OPERATIONS
// ============================================================================

/**
 * Get a knowledge entry by ID
 */
export async function getEntryById(id: string): Promise<DomainKnowledge | null> {
  try {
    const entry = await db.query.domainKnowledge.findFirst({
      where: eq(domainKnowledge.id, id),
    });

    return entry ?? null;
  } catch (error) {
    logger.error('Failed to get knowledge entry by ID', error as Error, { id });
    throw error;
  }
}

/**
 * Get all entries for a search index
 */
export async function getEntriesBySearchIndexId(
  searchIndexId: string,
  options?: {
    activeOnly?: boolean;
  }
): Promise<DomainKnowledge[]> {
  try {
    const conditions = [eq(domainKnowledge.searchIndexId, searchIndexId)];

    if (options?.activeOnly) {
      conditions.push(eq(domainKnowledge.isActive, true));
    }

    const entries = await db
      .select()
      .from(domainKnowledge)
      .where(and(...conditions))
      .orderBy(desc(domainKnowledge.priority), asc(domainKnowledge.createdAt));

    return entries;
  } catch (error) {
    logger.error('Failed to get knowledge entries', error as Error, { searchIndexId });
    throw error;
  }
}

/**
 * Get active entries for a search index
 */
export async function getActiveEntries(
  searchIndexId: string
): Promise<DomainKnowledge[]> {
  return getEntriesBySearchIndexId(searchIndexId, { activeOnly: true });
}

/**
 * Count entries for a search index
 */
export async function countEntriesBySearchIndexId(
  searchIndexId: string
): Promise<number> {
  try {
    const [result] = await db
      .select({ count: count() })
      .from(domainKnowledge)
      .where(eq(domainKnowledge.searchIndexId, searchIndexId));

    return Number(result.count);
  } catch (error) {
    logger.error('Failed to count knowledge entries', error as Error, { searchIndexId });
    throw error;
  }
}

// ============================================================================
// UPDATE OPERATIONS
// ============================================================================

/**
 * Update a knowledge entry
 */
export async function updateEntry(
  id: string,
  data: Partial<Omit<DomainKnowledge, 'id' | 'searchIndexId' | 'createdAt'>>
): Promise<DomainKnowledge> {
  try {
    const [updated] = await db
      .update(domainKnowledge)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(domainKnowledge.id, id))
      .returning();

    if (!updated) {
      throw new Error(`Knowledge entry not found: ${id}`);
    }

    logger.info('Updated knowledge entry', { entryId: id });

    return updated;
  } catch (error) {
    logger.error('Failed to update knowledge entry', error as Error, { id });
    throw error;
  }
}

/**
 * Toggle entry active status
 */
export async function toggleEntryStatus(
  id: string,
  isActive: boolean,
  updatedBy?: string
): Promise<DomainKnowledge> {
  return updateEntry(id, { isActive, updatedBy });
}

// ============================================================================
// DELETE OPERATIONS
// ============================================================================

/**
 * Delete a knowledge entry
 */
export async function deleteEntry(id: string): Promise<void> {
  try {
    await db
      .delete(domainKnowledge)
      .where(eq(domainKnowledge.id, id));

    logger.info('Deleted knowledge entry', { entryId: id });
  } catch (error) {
    logger.error('Failed to delete knowledge entry', error as Error, { id });
    throw error;
  }
}

/**
 * Delete all entries for a search index
 */
export async function deleteEntriesBySearchIndexId(searchIndexId: string): Promise<number> {
  try {
    const result = await db
      .delete(domainKnowledge)
      .where(eq(domainKnowledge.searchIndexId, searchIndexId))
      .returning({ id: domainKnowledge.id });

    logger.info('Deleted all knowledge entries for search index', {
      searchIndexId,
      deletedCount: result.length,
    });

    return result.length;
  } catch (error) {
    logger.error('Failed to delete knowledge entries', error as Error, { searchIndexId });
    throw error;
  }
}

// ============================================================================
// UTILITY OPERATIONS
// ============================================================================

/**
 * Check if an entry exists
 */
export async function entryExists(id: string): Promise<boolean> {
  try {
    const [result] = await db
      .select({ count: count() })
      .from(domainKnowledge)
      .where(eq(domainKnowledge.id, id));

    return Number(result.count) > 0;
  } catch (error) {
    logger.error('Failed to check entry existence', error as Error, { id });
    throw error;
  }
}
