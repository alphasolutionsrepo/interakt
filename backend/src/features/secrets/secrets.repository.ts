// src/features/secrets/secrets.repository.ts

import { SECRET_REFERENCE_FIELDS } from './secret-template';
import { eq, like, desc, sql } from 'drizzle-orm';
import { secrets, tools, dataSources, mcpConnections, aiProviders } from '@/db/schema';
import { db } from '@/db/index';
import type { DbExecutor } from '@/shared/db/executor';
import { createLogger } from '@/shared/logger/logger';

const logger = createLogger('secrets-repository');

export interface SecretReference {
  type: 'tool' | 'data_source' | 'mcp_connection' | 'ai_provider';
  id: string;
  name: string;
}

/**
 * Find every config that references a secret by name, across tools, data
 * sources, MCP connections and AI providers (their api_key_secret column). Matches the two
 * canonical reference forms in
 * the serialized JSON config: the `{{secret:name}}` template (tools) and a
 * field named in SECRET_REFERENCE_FIELDS (data sources, MCP, HTTP-API auth, web search). Secret names are constrained to `[a-z][a-z0-9_]*`, so the
 * name needs no regex escaping. Whitespace is tolerated for hand-edited rows.
 */
export async function findSecretReferences(name: string, executor: DbExecutor = db): Promise<SecretReference[]> {
  const fields = SECRET_REFERENCE_FIELDS.join('|');
  const pattern = `(\\{\\{\\s*secret\\s*:\\s*${name}\\s*\\}\\}|"(${fields})"\\s*:\\s*"${name}")`;

  try {
    const [toolRows, dataSourceRows, mcpRows, providerRows] = await Promise.all([
      executor.select({ id: tools.id, name: tools.name }).from(tools)
        .where(sql`${tools.executorConfig}::text ~ ${pattern}`),
      executor.select({ id: dataSources.id, name: dataSources.name }).from(dataSources)
        .where(sql`${dataSources.config}::text ~ ${pattern}`),
      executor.select({ id: mcpConnections.id, name: mcpConnections.name }).from(mcpConnections)
        .where(sql`${mcpConnections.authConfig}::text ~ ${pattern}`),
      executor.select({ id: aiProviders.id, name: aiProviders.displayName }).from(aiProviders)
        .where(eq(aiProviders.apiKeySecret, name)),
    ]);

    return [
      ...toolRows.map((r) => ({ type: 'tool' as const, id: r.id, name: r.name })),
      ...dataSourceRows.map((r) => ({ type: 'data_source' as const, id: r.id, name: r.name })),
      ...mcpRows.map((r) => ({ type: 'mcp_connection' as const, id: r.id, name: r.name })),
      ...providerRows.map((r) => ({ type: 'ai_provider' as const, id: r.id, name: r.name })),
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

export async function getSecretByName(name: string, executor: DbExecutor = db) {
  try {
    const result = await executor.query.secrets.findFirst({
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
}, executor: DbExecutor = db) {
  try {
    const [created] = await executor.insert(secrets).values({
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
}, executor: DbExecutor = db) {
  try {
    const [updated] = await executor.update(secrets)
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

export async function deleteSecret(id: string, executor: DbExecutor = db) {
  try {
    const [deleted] = await executor.delete(secrets)
      .where(eq(secrets.id, id))
      .returning();
    return deleted || null;
  } catch (error) {
    logger.error('Failed to delete secret', error as Error, { id });
    throw error;
  }
}
