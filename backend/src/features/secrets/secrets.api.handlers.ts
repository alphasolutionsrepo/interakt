// src/features/secrets/secrets.api.handlers.ts

import { NextRequest } from 'next/server';
import { apiResponse } from '@/shared/api/response';
import { createLogger } from '@/shared/logger/logger';
import { getCurrentUserId } from '@/shared/utils/auth-utils';
import * as service from './secrets.service';
import { createSecretSchema, updateSecretSchema, listSecretsQuerySchema } from './secrets.validation';

const logger = createLogger('secrets-handlers');

// ============================================================================
// LIST
// ============================================================================

export async function handleListSecrets(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return apiResponse.unauthorized();

    const searchParams = Object.fromEntries(request.nextUrl.searchParams);
    const validation = listSecretsQuerySchema.safeParse(searchParams);
    if (!validation.success) {
      return apiResponse.validationError(validation.error);
    }

    const secrets = await service.listSecrets(validation.data.search);
    return apiResponse.success(secrets);
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to list secrets', err);
    return apiResponse.error(err);
  }
}

// ============================================================================
// CREATE
// ============================================================================

export async function handleCreateSecret(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return apiResponse.unauthorized();

    const body = await request.json();
    const validation = createSecretSchema.safeParse(body);
    if (!validation.success) {
      return apiResponse.validationError(validation.error);
    }

    const secret = await service.createSecret(validation.data, userId);
    return apiResponse.success(secret, 201);
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to create secret', err);
    if (err.message.includes('already exists')) {
      return apiResponse.badRequest(err.message);
    }
    return apiResponse.error(err);
  }
}

// ============================================================================
// GET BY ID
// ============================================================================

export async function handleGetSecret(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return apiResponse.unauthorized();

    const { id } = await context.params;
    const secret = await service.getSecretMetadata(id);
    if (!secret) {
      return apiResponse.notFound('Secret not found');
    }

    return apiResponse.success(secret);
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to get secret', err);
    return apiResponse.error(err);
  }
}

// ============================================================================
// UPDATE
// ============================================================================

export async function handleUpdateSecret(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return apiResponse.unauthorized();

    const { id } = await context.params;
    const body = await request.json();
    const validation = updateSecretSchema.safeParse(body);
    if (!validation.success) {
      return apiResponse.validationError(validation.error);
    }

    const updated = await service.updateSecret(id, validation.data, userId);
    if (!updated) {
      return apiResponse.notFound('Secret not found');
    }

    return apiResponse.success(updated);
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to update secret', err);
    return apiResponse.error(err);
  }
}

// ============================================================================
// DELETE
// ============================================================================

export async function handleDeleteSecret(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return apiResponse.unauthorized();

    const { id } = await context.params;
    const deleted = await service.deleteSecret(id, userId);
    if (!deleted) {
      return apiResponse.notFound('Secret not found');
    }

    return apiResponse.success({ deleted: true });
  } catch (error) {
    if (error instanceof service.SecretInUseError) {
      return apiResponse.conflict(error.message);
    }
    const err = error as Error;
    logger.error('Failed to delete secret', err);
    return apiResponse.error(err);
  }
}
