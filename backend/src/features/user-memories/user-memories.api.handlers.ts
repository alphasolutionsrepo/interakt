// src/features/user-memories/user-memories.api.handlers.ts

/**
 * User Memories API Handlers — Episodic Memory (Sprint 5 / Phase D)
 *
 * Admin/user-facing endpoints:
 *   GET  /api/user-memories?userId=&experienceId=   — list all memories for a user
 *   DELETE /api/user-memories/:id                   — delete a specific memory
 *   DELETE /api/user-memories?userId=&experienceId= — delete all memories for a user
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { apiResponse } from '@/shared/api/response';
import { createLogger } from '@/shared/logger/logger';
import { getCurrentUserId } from '@/shared/utils/auth-utils';
import * as repository from './user-memories.repository';

const logger = createLogger('user-memories-handlers');

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const listQuerySchema = z.object({
  userId: z.string().min(1, 'userId is required'),
  experienceId: z.string().uuid('experienceId must be a valid UUID'),
});

const deleteAllQuerySchema = z.object({
  userId: z.string().min(1, 'userId is required'),
  experienceId: z.string().uuid('experienceId must be a valid UUID'),
});

// ============================================================================
// LIST — GET /api/user-memories?userId=&experienceId=
// ============================================================================

export async function handleListMemories(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return apiResponse.unauthorized();

    const params = Object.fromEntries(request.nextUrl.searchParams);
    const validation = listQuerySchema.safeParse(params);
    if (!validation.success) return apiResponse.validationError(validation.error);

    const { userId: targetUserId, experienceId } = validation.data;
    const memories = await repository.listMemories(targetUserId, experienceId);

    return apiResponse.success({
      memories,
      total: memories.length,
    });
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to list user memories', err);
    return apiResponse.error(err);
  }
}

// ============================================================================
// DELETE ALL — DELETE /api/user-memories?userId=&experienceId=
// ============================================================================

export async function handleDeleteAllMemories(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return apiResponse.unauthorized();

    const params = Object.fromEntries(request.nextUrl.searchParams);
    const validation = deleteAllQuerySchema.safeParse(params);
    if (!validation.success) return apiResponse.validationError(validation.error);

    const { userId: targetUserId, experienceId } = validation.data;
    await repository.deleteAllMemories(targetUserId, experienceId);

    logger.info('Deleted all memories for user', { targetUserId, experienceId, deletedBy: userId });
    return apiResponse.success({ deleted: true });
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to delete all user memories', err);
    return apiResponse.error(err);
  }
}

// ============================================================================
// DELETE ONE — DELETE /api/user-memories/:id
// ============================================================================

export async function handleDeleteMemory(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return apiResponse.unauthorized();

    const { id } = await params;
    if (!z.string().uuid().safeParse(id).success) {
      return apiResponse.badRequest('Invalid memory ID');
    }

    await repository.deleteMemory(id);

    logger.info('Deleted user memory', { memoryId: id, deletedBy: userId });
    return apiResponse.success({ deleted: true });
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to delete user memory', err);
    return apiResponse.error(err);
  }
}
