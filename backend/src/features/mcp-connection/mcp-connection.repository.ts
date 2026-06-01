// src/features/mcp-connection/mcp-connection.repository.ts

import { eq, and, like, desc, asc, count, type SQL } from 'drizzle-orm';
import { mcpConnections, aiExperienceMcpConnections } from '@/db/schema';
import { db } from '@/db/index';
import { createLogger } from '@/shared/logger/logger';
import type { ListMcpConnectionsQuery } from './mcp-connection.validation';
import type { NewMcpConnection, NewAIExperienceMcpConnection } from '@/db/schema/mcp-connections.schema';

const logger = createLogger('mcp-connection-repository');

// ============================================================================
// CONNECTION CRUD
// ============================================================================

export async function getById(id: string) {
  try {
    const result = await db.query.mcpConnections.findFirst({ where: eq(mcpConnections.id, id) });
    return result ?? null;
  } catch (error) {
    logger.error('getById failed', error as Error, { id });
    throw error;
  }
}

export async function getBySlug(slug: string) {
  const result = await db.query.mcpConnections.findFirst({ where: eq(mcpConnections.slug, slug) });
  return result ?? null;
}

export async function list(query: ListMcpConnectionsQuery) {
  const conditions: SQL[] = [];
  if (query.isActive !== undefined) conditions.push(eq(mcpConnections.isActive, query.isActive));
  if (query.status) conditions.push(eq(mcpConnections.status, query.status));
  if (query.search) conditions.push(like(mcpConnections.name, `%${query.search}%`));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const sortColumn = query.sortBy === 'name' ? mcpConnections.name : mcpConnections.createdAt;
  const orderBy = query.sortOrder === 'asc' ? asc(sortColumn) : desc(sortColumn);
  const offset = (query.page - 1) * query.pageSize;

  const [items, [{ total }]] = await Promise.all([
    db.query.mcpConnections.findMany({ where, orderBy, limit: query.pageSize, offset }),
    db.select({ total: count() }).from(mcpConnections).where(where),
  ]);

  return {
    items,
    total,
    page: query.page,
    pageSize: query.pageSize,
    totalPages: Math.ceil(total / query.pageSize),
  };
}

export async function create(data: NewMcpConnection) {
  const [row] = await db.insert(mcpConnections).values(data).returning();
  return row;
}

export async function update(id: string, data: Partial<NewMcpConnection>) {
  const [row] = await db
    .update(mcpConnections)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(mcpConnections.id, id))
    .returning();
  return row;
}

export async function remove(id: string) {
  await db.delete(mcpConnections).where(eq(mcpConnections.id, id));
}

export async function isSlugAvailable(slug: string, excludeId?: string) {
  const existing = await db.query.mcpConnections.findFirst({ where: eq(mcpConnections.slug, slug) });
  if (!existing) return true;
  if (excludeId && existing.id === excludeId) return true;
  return false;
}

// ============================================================================
// EXPERIENCE ATTACHMENTS
// ============================================================================

export async function listAttachmentsForExperience(experienceId: string) {
  return db.query.aiExperienceMcpConnections.findMany({
    where: eq(aiExperienceMcpConnections.aiExperienceId, experienceId),
    with: { mcpConnection: true },
    orderBy: asc(aiExperienceMcpConnections.sortOrder),
  });
}

export async function getAttachment(experienceId: string, connectionId: string) {
  const result = await db.query.aiExperienceMcpConnections.findFirst({
    where: and(
      eq(aiExperienceMcpConnections.aiExperienceId, experienceId),
      eq(aiExperienceMcpConnections.mcpConnectionId, connectionId),
    ),
    with: { mcpConnection: true },
  });
  return result ?? null;
}

export async function createAttachment(data: NewAIExperienceMcpConnection) {
  const [row] = await db.insert(aiExperienceMcpConnections).values(data).returning();
  return row;
}

export async function updateAttachment(
  experienceId: string,
  connectionId: string,
  data: Partial<NewAIExperienceMcpConnection>,
) {
  const [row] = await db
    .update(aiExperienceMcpConnections)
    .set({ ...data, updatedAt: new Date() })
    .where(and(
      eq(aiExperienceMcpConnections.aiExperienceId, experienceId),
      eq(aiExperienceMcpConnections.mcpConnectionId, connectionId),
    ))
    .returning();
  return row;
}

export async function deleteAttachment(experienceId: string, connectionId: string) {
  await db.delete(aiExperienceMcpConnections).where(and(
    eq(aiExperienceMcpConnections.aiExperienceId, experienceId),
    eq(aiExperienceMcpConnections.mcpConnectionId, connectionId),
  ));
}
