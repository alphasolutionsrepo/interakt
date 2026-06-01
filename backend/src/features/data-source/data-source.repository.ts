import { eq, desc, asc, like, and, count, type SQL } from 'drizzle-orm';
import { dataSources } from '@/db/schema';
import { db } from '@/db/index';
import { createLogger } from '@/shared/logger/logger';
import type { ListDataSourcesQuery } from './data-source.validation';
import type { NewDataSource } from '@/db/schema/data-sources.schema';

const logger = createLogger('data-source-repository');

// ============================================================================
// DATA SOURCE CRUD
// ============================================================================

export async function getDataSourceById(id: string) {
  try {
    const result = await db.query.dataSources.findFirst({
      where: eq(dataSources.id, id),
    });
    return result ?? null;
  } catch (error) {
    logger.error('Failed to get data source by id', error as Error, { id });
    throw error;
  }
}

export async function getDataSourceBySlug(slug: string) {
  try {
    const result = await db.query.dataSources.findFirst({
      where: eq(dataSources.slug, slug),
    });
    return result ?? null;
  } catch (error) {
    logger.error('Failed to get data source by slug', error as Error, { slug });
    throw error;
  }
}

export async function listDataSources(query: ListDataSourcesQuery) {
  try {
    const conditions: SQL[] = [];

    if (query.isActive !== undefined) {
      conditions.push(eq(dataSources.isActive, query.isActive));
    }
    if (query.type) {
      conditions.push(eq(dataSources.type, query.type));
    }
    if (query.status) {
      conditions.push(eq(dataSources.status, query.status));
    }
    if (query.search) {
      conditions.push(like(dataSources.name, `%${query.search}%`));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const sortColumn = query.sortBy === 'name'
      ? dataSources.name
      : query.sortBy === 'type'
        ? dataSources.type
        : dataSources.createdAt;

    const orderBy = query.sortOrder === 'asc' ? asc(sortColumn) : desc(sortColumn);

    const offset = (query.page - 1) * query.pageSize;

    const [items, [{ total }]] = await Promise.all([
      db.query.dataSources.findMany({
        where,
        orderBy,
        limit: query.pageSize,
        offset,
      }),
      db.select({ total: count() }).from(dataSources).where(where),
    ]);

    return {
      items,
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.ceil(total / query.pageSize),
    };
  } catch (error) {
    logger.error('Failed to list data sources', error as Error);
    throw error;
  }
}

export async function createDataSource(data: NewDataSource) {
  try {
    const [created] = await db.insert(dataSources).values(data).returning();
    return created;
  } catch (error) {
    logger.error('Failed to create data source', error as Error);
    throw error;
  }
}

export async function updateDataSource(id: string, data: Partial<NewDataSource>) {
  try {
    const [updated] = await db
      .update(dataSources)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(dataSources.id, id))
      .returning();
    return updated ?? null;
  } catch (error) {
    logger.error('Failed to update data source', error as Error, { id });
    throw error;
  }
}

export async function deleteDataSource(id: string) {
  try {
    const [deleted] = await db
      .delete(dataSources)
      .where(eq(dataSources.id, id))
      .returning();
    return deleted ?? null;
  } catch (error) {
    logger.error('Failed to delete data source', error as Error, { id });
    throw error;
  }
}

export async function isSlugAvailable(slug: string, excludeId?: string) {
  try {
    const existing = await db.query.dataSources.findFirst({
      where: eq(dataSources.slug, slug),
      columns: { id: true },
    });
    if (!existing) return true;
    return excludeId ? existing.id === excludeId : false;
  } catch (error) {
    logger.error('Failed to check slug availability', error as Error, { slug });
    throw error;
  }
}
