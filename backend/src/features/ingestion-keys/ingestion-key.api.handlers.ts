// src/features/ingestion-keys/ingestion-key.api.handlers.ts

/**
 * Ingestion Key API Handlers
 *
 * Managing keys is **session-only**. An ingestion key must never be able to mint
 * or revoke another key — that would turn a leaked write credential into a
 * self-perpetuating one.
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { apiResponse } from '@/shared/api/response';
import { createLogger } from '@/shared/logger/logger';
import { getCurrentUserId } from '@/shared/utils/auth-utils';

import {
    createIngestionKey,
    listIngestionKeys,
    revokeIngestionKey,
} from './ingestion-key.service';
import {
    createIngestionKeyRequestSchema,
    ingestionKeyIdParamSchema,
} from './ingestion-key.validation';

const logger = createLogger('ingestion-key-handlers');

const searchIndexIdSchema = z.object({
    id: z.string().uuid(),
});

/**
 * GET /api/search-indexes/:id/ingestion-keys
 * List the keys granting access to this index
 */
export async function handleListIngestionKeys(
    _request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const userId = await getCurrentUserId();
        if (!userId) {
            return apiResponse.unauthorized();
        }

        const params = await context.params;
        const paramValidation = searchIndexIdSchema.safeParse(params);
        if (!paramValidation.success) {
            return apiResponse.validationError(paramValidation.error);
        }

        const keys = await listIngestionKeys(paramValidation.data.id);

        return apiResponse.success({ keys });
    } catch (error) {
        const err = error as Error;
        logger.error('Failed to list ingestion keys', err);
        return apiResponse.error(err);
    }
}

/**
 * POST /api/search-indexes/:id/ingestion-keys
 * Create a key. The plaintext key is returned once and never stored.
 */
export async function handleCreateIngestionKey(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const userId = await getCurrentUserId();
        if (!userId) {
            return apiResponse.unauthorized();
        }

        const params = await context.params;
        const paramValidation = searchIndexIdSchema.safeParse(params);
        if (!paramValidation.success) {
            return apiResponse.validationError(paramValidation.error);
        }

        let body: unknown;
        try {
            body = await request.json();
        } catch {
            return apiResponse.badRequest('Invalid JSON body');
        }

        const validation = createIngestionKeyRequestSchema.safeParse(body);
        if (!validation.success) {
            return apiResponse.validationError(validation.error);
        }

        const { name, operations, additionalSearchIndexIds, expiresAt } = validation.data;

        // The index in the route is always granted; extras are additive and
        // de-duplicated so a repeated id can't violate the unique grant.
        const searchIndexIds = [
            ...new Set([paramValidation.data.id, ...(additionalSearchIndexIds ?? [])]),
        ];

        const created = await createIngestionKey({
            name,
            operations,
            searchIndexIds,
            expiresAt: expiresAt ? new Date(expiresAt) : null,
            createdBy: userId,
        });

        logger.info('Created ingestion key via API', {
            keyId: created.key.id,
            keyPrefix: created.key.keyPrefix,
            operations,
            indexCount: searchIndexIds.length,
            createdBy: userId,
        });

        // 201 with the plaintext — the only time it exists outside the caller
        return apiResponse.success(created, 201);
    } catch (error) {
        const err = error as Error;
        logger.error('Failed to create ingestion key', err);
        return apiResponse.error(err);
    }
}

/**
 * DELETE /api/search-indexes/:id/ingestion-keys/:keyId
 * Revoke a key. Takes effect immediately, no redeploy needed.
 */
export async function handleRevokeIngestionKey(
    _request: NextRequest,
    context: { params: Promise<{ id: string; keyId: string }> }
) {
    try {
        const userId = await getCurrentUserId();
        if (!userId) {
            return apiResponse.unauthorized();
        }

        const params = await context.params;

        const idValidation = searchIndexIdSchema.safeParse({ id: params.id });
        if (!idValidation.success) {
            return apiResponse.validationError(idValidation.error);
        }

        const keyValidation = ingestionKeyIdParamSchema.safeParse({ keyId: params.keyId });
        if (!keyValidation.success) {
            return apiResponse.validationError(keyValidation.error);
        }

        // Scoped by index: a key granted on another index must not be revocable
        // through this one's URL.
        const revoked = await revokeIngestionKey(
            keyValidation.data.keyId,
            idValidation.data.id
        );

        if (!revoked) {
            return apiResponse.notFound('Ingestion key not found for this index');
        }

        logger.info('Revoked ingestion key via API', {
            keyId: revoked.id,
            keyPrefix: revoked.keyPrefix,
            revokedBy: userId,
        });

        return apiResponse.success({ key: revoked });
    } catch (error) {
        const err = error as Error;
        logger.error('Failed to revoke ingestion key', err);
        return apiResponse.error(err);
    }
}
