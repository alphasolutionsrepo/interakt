// src/features/mcp-connection/mcp-connection.service.ts

import { createLogger } from '@/shared/logger/logger';
import * as repository from './mcp-connection.repository';
import { probeAndDiscover } from './mcp-client';
import type {
  CreateMcpConnectionDTO,
  UpdateMcpConnectionDTO,
  ListMcpConnectionsQuery,
  AttachConnectionDTO,
  UpdateAttachmentDTO,
} from './mcp-connection.validation';
import type { McpConnection, DiscoveredToolCatalog, McpAuthConfig } from '@/db/schema/mcp-connections.schema';

const logger = createLogger('mcp-connection-service');

// ============================================================================
// CRUD
// ============================================================================

export async function create(input: CreateMcpConnectionDTO, userId: string) {
  if (!(await repository.isSlugAvailable(input.slug))) {
    throw new Error(`MCP connection with slug "${input.slug}" already exists`);
  }

  const created = await repository.create({
    name: input.name,
    slug: input.slug,
    description: input.description,
    serverUrl: input.serverUrl,
    transport: input.transport,
    authConfig: (input.authConfig ?? { type: 'none' }) as McpAuthConfig,
    createdBy: userId,
  });

  logger.info('Created MCP connection', { id: created.id, slug: created.slug, userId });
  return created;
}

export async function getById(id: string) {
  return repository.getById(id);
}

export async function getBySlug(slug: string) {
  return repository.getBySlug(slug);
}

export async function list(query: ListMcpConnectionsQuery) {
  return repository.list(query);
}

export async function update(id: string, input: UpdateMcpConnectionDTO, userId: string) {
  const existing = await repository.getById(id);
  if (!existing) throw new Error(`MCP connection with ID "${id}" not found`);

  const updates: Partial<McpConnection> = { updatedBy: userId };
  if (input.name !== undefined) updates.name = input.name;
  if (input.description !== undefined) updates.description = input.description;
  if (input.serverUrl !== undefined) updates.serverUrl = input.serverUrl;
  if (input.transport !== undefined) updates.transport = input.transport;
  if (input.authConfig !== undefined) updates.authConfig = input.authConfig as McpAuthConfig;
  if (input.isActive !== undefined) updates.isActive = input.isActive;

  return repository.update(id, updates);
}

export async function remove(id: string, userId: string) {
  const existing = await repository.getById(id);
  if (!existing) throw new Error(`MCP connection with ID "${id}" not found`);
  await repository.remove(id);
  logger.info('Deleted MCP connection', { id, slug: existing.slug, userId });
}

export async function isSlugAvailable(slug: string, excludeId?: string) {
  return repository.isSlugAvailable(slug, excludeId);
}

// ============================================================================
// SYNC / DISCOVERY
// ============================================================================

export interface SyncResult {
  status: 'healthy' | 'degraded' | 'error';
  message: string;
  catalog?: DiscoveredToolCatalog;
  toolCount: number;
  checkedAt: string;
}

/**
 * Probe the MCP server, discover its tool catalog, and persist the result.
 * This is also what the "Test connection" endpoint runs — it just doesn't
 * write the result when invoked in dry-run mode.
 */
export async function syncConnection(id: string, options: { persist?: boolean } = { persist: true }): Promise<SyncResult> {
  const conn = await repository.getById(id);
  if (!conn) throw new Error(`MCP connection with ID "${id}" not found`);

  const now = new Date();
  let result: SyncResult;

  try {
    const catalog = await probeAndDiscover({
      serverUrl: conn.serverUrl,
      transport: conn.transport as 'streamable-http' | 'sse',
      authConfig: conn.authConfig,
    });
    result = {
      status: 'healthy',
      message: `Discovered ${catalog.tools.length} tool(s) from ${catalog.serverInfo?.name ?? 'server'}`,
      catalog,
      toolCount: catalog.tools.length,
      checkedAt: now.toISOString(),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'MCP probe failed';
    logger.warn('MCP sync failed', { connectionId: id, message });
    result = { status: 'error', message, toolCount: 0, checkedAt: now.toISOString() };
  }

  if (options.persist) {
    await repository.update(id, {
      status: result.status,
      lastHealthMessage: result.message,
      lastHealthCheckAt: now,
      ...(result.catalog && {
        discoveredTools: result.catalog,
        lastDiscoveredAt: now,
      }),
    });
  }

  return result;
}

// ============================================================================
// EXPERIENCE ATTACHMENTS
// ============================================================================

export async function listAttachmentsForExperience(experienceId: string) {
  return repository.listAttachmentsForExperience(experienceId);
}

export async function attachToExperience(experienceId: string, input: AttachConnectionDTO) {
  const existing = await repository.getAttachment(experienceId, input.mcpConnectionId);
  if (existing) {
    throw new Error('Connection is already attached to this experience');
  }
  const conn = await repository.getById(input.mcpConnectionId);
  if (!conn) throw new Error(`MCP connection with ID "${input.mcpConnectionId}" not found`);

  return repository.createAttachment({
    aiExperienceId: experienceId,
    mcpConnectionId: input.mcpConnectionId,
    enabledToolNames: input.enabledToolNames ?? null,
    isEnabled: input.isEnabled ?? true,
    sortOrder: input.sortOrder ?? 0,
  });
}

export async function updateAttachment(
  experienceId: string,
  connectionId: string,
  input: UpdateAttachmentDTO,
) {
  const existing = await repository.getAttachment(experienceId, connectionId);
  if (!existing) throw new Error('Attachment not found');

  return repository.updateAttachment(experienceId, connectionId, {
    ...(input.enabledToolNames !== undefined && { enabledToolNames: input.enabledToolNames }),
    ...(input.isEnabled !== undefined && { isEnabled: input.isEnabled }),
    ...(input.sortOrder !== undefined && { sortOrder: input.sortOrder }),
  });
}

export async function detachFromExperience(experienceId: string, connectionId: string) {
  const existing = await repository.getAttachment(experienceId, connectionId);
  if (!existing) throw new Error('Attachment not found');
  await repository.deleteAttachment(experienceId, connectionId);
}
