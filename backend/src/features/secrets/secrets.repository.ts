// src/features/secrets/secrets.repository.ts

import { eq, like, desc, sql } from 'drizzle-orm';
import { secrets, tools, dataSources, mcpConnections } from '@/db/schema';
import { db } from '@/db/index';
import { createLogger } from '@/shared/logger/logger';

const logger = createLogger('secrets-repository');

export interface SecretReference {
  type: 'tool' | 'data_source' | 'mcp_connection';
  id: string;
  name: string;
}

/**
 * Find every config that references a secret by name, across tools, data
 * sources, and MCP connections. Matches the two canonical reference forms in
 * the serialized JSON config: the `{{secret:name}}` template (tools) and a
 * `"secretRef"|"valueRef"|"secretName": "name"` field (data sources, MCP,
 * HTTP-API auth). Secret names are constrained to `[a-z][a-z0-9_]*`, so the
 * name needs no regex escaping. Whitespace is tolerated for hand-edited rows.
 */
export async function findSecretReferences(name: string): Promise<SecretReference[]> {
  const pattern = `(\\{\\{\\s*secret\\s*:\\s*${name}\\s*\\}\\}|"(secretRef|valueRef|secretName)"\\s*:\\s*"${name}")`;

  try {
    const [toolRows, dataSourceRows, mcpRows] = await Promise.all([
      db.select({ id: tools.id, name: tools.name }).from(tools)
        .where(sql`${tools.executorConfig}::text ~ ${pattern}`),
      db.select({ id: dataSources.id, name: dataSources.name }).from(dataSources)
        .where(sql`${dataSources.config}::text ~ ${pattern}`),
      db.select({ id: mcpConnections.id, name: mcpConnections.name }).from(mcpConnections)
        .where(sql`${mcpConnections.authConfig}::text ~ ${pattern}`),
    ]);

    return [
      ...toolRows.map((r) => ({ type: 'tool' as const, id: r.id, name: r.name })),
      ...dataSourceRows.map((r) => ({ type: 'data_source' as const, id: r.id, name: r.name })),
      ...mcpRows.map((r) => ({ type: 'mcp_connection' as const, id: r.id, name: r.name })),
    ];
  } catch (error) {
    logger.error('Failed to find secret references', error as Error, { name });
    throw error;
  }
}

export async function getSecretById(id: string) {
  try {
    const result = await db.query.secrets.findFirst({
      where: eq(secrets.id, id),
    });
    return result || null;
  } catch (error) {
    logger.error('Failed to get secret by id', error as Error, { id });
    throw error;
  }
}

export async function getSecretByName(name: string) {
  try {
    const result = await db.query.secrets.findFirst({
      where: eq(secrets.name, name),
    });
    return result || null;
  } catch (error) {
    logger.error('Failed to get secret by name', error as Error, { name });
    throw error;
  }
}

export async function listSecrets(search?: string) {
  try {
    let query = db.select({
      id: secrets.id,
      name: secrets.name,
      description: secrets.description,
      createdAt: secrets.createdAt,
      updatedAt: secrets.updatedAt,
    }).from(secrets);

    if (search) {
      query = query.where(like(secrets.name, `%${search}%`)) as typeof query;
    }

    return await query.orderBy(desc(secrets.createdAt));
  } catch (error) {
    logger.error('Failed to list secrets', error as Error);
    throw error;
  }
}

export async function createSecret(data: {
  name: string;
  encryptedValue: string;
  description?: string;
  createdBy?: string;
}) {
  try {
    const [created] = await db.insert(secrets).values({
      name: data.name,
      encryptedValue: data.encryptedValue,
      description: data.description,
      createdBy: data.createdBy,
    }).returning();
    return created;
  } catch (error) {
    logger.error('Failed to create secret', error as Error, { name: data.name });
    throw error;
  }
}

export async function updateSecret(id: string, data: {
  encryptedValue?: string;
  description?: string;
  updatedBy?: string;
}) {
  try {
    const [updated] = await db.update(secrets)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(secrets.id, id))
      .returning();
    return updated || null;
  } catch (error) {
    logger.error('Failed to update secret', error as Error, { id });
    throw error;
  }
}

export async function deleteSecret(id: string) {
  try {
    const [deleted] = await db.delete(secrets)
      .where(eq(secrets.id, id))
      .returning();
    return deleted || null;
  } catch (error) {
    logger.error('Failed to delete secret', error as Error, { id });
    throw error;
  }
}
