// src/features/mcp-connection/mcp-connection.api.handlers.ts

import { NextRequest } from 'next/server';
import { apiResponse } from '@/shared/api/response';
import { createLogger } from '@/shared/logger/logger';
import { getCurrentUserId } from '@/shared/utils/auth-utils';
import * as service from './mcp-connection.service';
import {
  createMcpConnectionSchema,
  updateMcpConnectionSchema,
  listMcpConnectionsQuerySchema,
  attachConnectionSchema,
  updateAttachmentSchema,
} from './mcp-connection.validation';

const logger = createLogger('mcp-connection-handlers');

// ============================================================================
// LIST
// ============================================================================

export async function handleList(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return apiResponse.unauthorized();

    const params = Object.fromEntries(request.nextUrl.searchParams);
    const validation = listMcpConnectionsQuerySchema.safeParse(params);
    if (!validation.success) return apiResponse.validationError(validation.error);

    const result = await service.list(validation.data);
    return apiResponse.successWithPagination(result.items, {
      page: result.page,
      pageSize: result.pageSize,
      totalPages: result.totalPages,
      totalItems: result.total,
    });
  } catch (error) {
    return apiResponse.error(error as Error, undefined, { operation: 'listMcpConnections' });
  }
}

// ============================================================================
// CREATE
// ============================================================================

export async function handleCreate(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return apiResponse.unauthorized();

    const body = await request.json();
    const validation = createMcpConnectionSchema.safeParse(body);
    if (!validation.success) return apiResponse.validationError(validation.error);

    const created = await service.create(validation.data, userId);

    // Best-effort initial discovery — failure does not block creation
    try {
      await service.syncConnection(created.id, { persist: true });
    } catch (err) {
      logger.warn('Initial sync failed', { id: created.id, error: (err as Error).message });
    }

    const final = await service.getById(created.id);
    return apiResponse.success(final, 201);
  } catch (error) {
    const err = error as Error;
    if (err.message.includes('already exists')) return apiResponse.refused(error, 'BAD_REQUEST', { operation: 'createMcpConnection' });
    return apiResponse.error(err, undefined, { operation: 'createMcpConnection' });
  }
}

// ============================================================================
// GET / UPDATE / DELETE BY ID
// ============================================================================

export async function handleGet(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return apiResponse.unauthorized();

    const { id } = await context.params;
    const conn = await service.getById(id);
    if (!conn) return apiResponse.notFound('MCP connection not found');
    return apiResponse.success(conn);
  } catch (error) {
    return apiResponse.error(error as Error, undefined, { operation: 'getMcpConnection' });
  }
}

export async function handleUpdate(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return apiResponse.unauthorized();

    const { id } = await context.params;
    const body = await request.json();
    const validation = updateMcpConnectionSchema.safeParse(body);
    if (!validation.success) return apiResponse.validationError(validation.error);

    const updated = await service.update(id, validation.data, userId);
    return apiResponse.success(updated);
  } catch (error) {
    const err = error as Error;
    if (err.message.includes('not found')) return apiResponse.refused(error, 'NOT_FOUND', { operation: 'updateMcpConnection' });
    return apiResponse.error(err, undefined, { operation: 'updateMcpConnection' });
  }
}

export async function handleDelete(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return apiResponse.unauthorized();

    const { id } = await context.params;
    await service.remove(id, userId);
    return apiResponse.success({ id });
  } catch (error) {
    const err = error as Error;
    if (err.message.includes('not found')) return apiResponse.refused(error, 'NOT_FOUND', { operation: 'deleteMcpConnection' });
    return apiResponse.error(err, undefined, { operation: 'deleteMcpConnection' });
  }
}

// ============================================================================
// SYNC + TEST
// ============================================================================

export async function handleSync(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return apiResponse.unauthorized();

    const { id } = await context.params;
    const result = await service.syncConnection(id, { persist: true });
    return apiResponse.success(result);
  } catch (error) {
    const err = error as Error;
    if (err.message.includes('not found')) return apiResponse.refused(error, 'NOT_FOUND', { operation: 'syncMcpConnection' });
    return apiResponse.error(err, undefined, { operation: 'syncMcpConnection' });
  }
}

export async function handleTest(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return apiResponse.unauthorized();

    const { id } = await context.params;
    const result = await service.syncConnection(id, { persist: false });
    return apiResponse.success(result);
  } catch (error) {
    const err = error as Error;
    if (err.message.includes('not found')) return apiResponse.refused(error, 'NOT_FOUND', { operation: 'testMcpConnection' });
    return apiResponse.error(err, undefined, { operation: 'testMcpConnection' });
  }
}

// ============================================================================
// EXPERIENCE ATTACHMENTS
// ============================================================================

export async function handleListAttachments(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return apiResponse.unauthorized();

    const { id } = await context.params;
    const items = await service.listAttachmentsForExperience(id);
    return apiResponse.success(items);
  } catch (error) {
    return apiResponse.error(error as Error, undefined, { operation: 'listMcpConnectionAttachments' });
  }
}

export async function handleAttach(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return apiResponse.unauthorized();

    const { id } = await context.params;
    const body = await request.json();
    const validation = attachConnectionSchema.safeParse(body);
    if (!validation.success) return apiResponse.validationError(validation.error);

    const attachment = await service.attachToExperience(id, validation.data);
    return apiResponse.success(attachment, 201);
  } catch (error) {
    const err = error as Error;
    if (err.message.includes('already attached')) return apiResponse.refused(error, 'BAD_REQUEST', { operation: 'attachMcpConnection' });
    if (err.message.includes('not found')) return apiResponse.refused(error, 'NOT_FOUND', { operation: 'attachMcpConnection' });
    return apiResponse.error(err, undefined, { operation: 'attachMcpConnection' });
  }
}

export async function handleUpdateAttachment(
  request: NextRequest,
  context: { params: Promise<{ id: string; connectionId: string }> },
) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return apiResponse.unauthorized();

    const { id, connectionId } = await context.params;
    const body = await request.json();
    const validation = updateAttachmentSchema.safeParse(body);
    if (!validation.success) return apiResponse.validationError(validation.error);

    const updated = await service.updateAttachment(id, connectionId, validation.data);
    return apiResponse.success(updated);
  } catch (error) {
    const err = error as Error;
    if (err.message.includes('not found')) return apiResponse.refused(error, 'NOT_FOUND', { operation: 'updateMcpConnectionAttachment' });
    return apiResponse.error(err, undefined, { operation: 'updateMcpConnectionAttachment' });
  }
}

export async function handleDetach(
  _request: NextRequest,
  context: { params: Promise<{ id: string; connectionId: string }> },
) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return apiResponse.unauthorized();

    const { id, connectionId } = await context.params;
    await service.detachFromExperience(id, connectionId);
    return apiResponse.success({ aiExperienceId: id, mcpConnectionId: connectionId });
  } catch (error) {
    const err = error as Error;
    if (err.message.includes('not found')) return apiResponse.refused(error, 'NOT_FOUND', { operation: 'detachMcpConnection' });
    return apiResponse.error(err, undefined, { operation: 'detachMcpConnection' });
  }
}
