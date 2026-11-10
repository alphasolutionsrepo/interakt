// src/features/data-source/data-source.api.handlers.ts

import { NextRequest } from 'next/server';

import * as service from './data-source.service';
import {
  createDataSourceSchema,
  updateDataSourceSchema,
  configSchemaForType,
  listDataSourcesQuerySchema,
  updateHealthSchema,
} from './data-source.validation';

import { assertMayWriteSecretConfig } from '@/features/access/secret-references';
import { apiResponse } from '@/shared/api/response';
import { createLogger } from '@/shared/logger/logger';
import { getCurrentUserId } from '@/shared/utils/auth-utils';


const logger = createLogger('data-source-handlers');

// ============================================================================
// LIST
// ============================================================================

export async function handleListDataSources(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return apiResponse.unauthorized();

    const searchParams = Object.fromEntries(request.nextUrl.searchParams);
    const validation = listDataSourcesQuerySchema.safeParse(searchParams);
    if (!validation.success) {
      return apiResponse.validationError(validation.error);
    }

    const result = await service.listDataSources(validation.data);
    return apiResponse.successWithPagination(result.items, {
      page: result.page,
      pageSize: result.pageSize,
      totalPages: result.totalPages,
      totalItems: result.total,
    });
  } catch (error) {
    const err = error as Error;
    return apiResponse.error(err, undefined, { operation: 'listDataSources' });
  }
}

// ============================================================================
// CREATE
// ============================================================================

export async function handleCreateDataSource(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return apiResponse.unauthorized();

    const body = await request.json();
    const validation = createDataSourceSchema.safeParse(body);
    if (!validation.success) {
      return apiResponse.validationError(validation.error);
    }

    await assertMayWriteSecretConfig(validation.data);
    const dataSource = await service.createDataSource(validation.data, userId);
    logger.info('Created data source', { dataSourceId: dataSource.id, slug: dataSource.slug, userId });
    return apiResponse.success(dataSource, 201);
  } catch (error) {
    const err = error as Error;
    if (err.message.includes('already exists')) {
      return apiResponse.refused(error, 'BAD_REQUEST', { operation: 'createDataSource' });
    }
    return apiResponse.error(err, undefined, { operation: 'createDataSource' });
  }
}

// ============================================================================
// GET BY ID
// ============================================================================

export async function handleGetDataSource(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return apiResponse.unauthorized();

    const { id } = await context.params;
    const dataSource = await service.getDataSourceById(id);
    if (!dataSource) {
      return apiResponse.notFound('Data source not found');
    }

    return apiResponse.success(dataSource);
  } catch (error) {
    const err = error as Error;
    return apiResponse.error(err, undefined, { operation: 'getDataSource' });
  }
}

// ============================================================================
// UPDATE
// ============================================================================

export async function handleUpdateDataSource(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return apiResponse.unauthorized();

    const { id } = await context.params;
    const body = await request.json();
    const validation = updateDataSourceSchema.safeParse(body);
    if (!validation.success) {
      return apiResponse.validationError(validation.error);
    }

    // The stored config too: changing only the host of a source that sends a secret redirects it
    await assertMayWriteSecretConfig(await service.getDataSourceById(id), validation.data);

    // The update schema accepts any object as config; hold it to the type's own schema
    // so an edit can't store a config the executors can't read.
    let input = validation.data;
    if (input.config) {
      const existing = await service.getDataSourceById(id);
      if (!existing) return apiResponse.notFound(`Data source with ID "${id}" not found`);
      const configSchema = configSchemaForType(existing.type);
      if (configSchema) {
        const parsed = configSchema.safeParse(input.config);
        if (!parsed.success) return apiResponse.validationError(parsed.error);
        input = { ...input, config: parsed.data as Record<string, unknown> };
      }
    }

    const updated = await service.updateDataSource(id, input, userId);
    return apiResponse.success(updated);
  } catch (error) {
    const err = error as Error;
    if (err.message.includes('not found')) {
      return apiResponse.refused(error, 'NOT_FOUND', { operation: 'updateDataSource' });
    }
    return apiResponse.error(err, undefined, { operation: 'updateDataSource' });
  }
}

// ============================================================================
// DELETE
// ============================================================================

export async function handleDeleteDataSource(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return apiResponse.unauthorized();

    const { id } = await context.params;
    await service.deleteDataSource(id, userId);
    return apiResponse.success({ deleted: true });
  } catch (error) {
    const err = error as Error;
    if (err.message.includes('not found')) {
      return apiResponse.refused(error, 'NOT_FOUND', { operation: 'deleteDataSource' });
    }
    return apiResponse.error(err, undefined, { operation: 'deleteDataSource' });
  }
}

// ============================================================================
// CHECK SLUG
// ============================================================================

export async function handleCheckSlug(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return apiResponse.unauthorized();

    const slug = request.nextUrl.searchParams.get('slug');
    const excludeId = request.nextUrl.searchParams.get('excludeId') ?? undefined;

    if (!slug) {
      return apiResponse.badRequest('Slug parameter is required');
    }

    const available = await service.isSlugAvailable(slug, excludeId);
    return apiResponse.success({ slug, available });
  } catch (error) {
    const err = error as Error;
    return apiResponse.error(err, undefined, { operation: 'checkDataSourceSlug' });
  }
}

// ============================================================================
// UPDATE HEALTH (manual status set)
// ============================================================================

export async function handleUpdateHealth(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return apiResponse.unauthorized();

    const { id } = await context.params;
    const body = await request.json();
    const validation = updateHealthSchema.safeParse(body);
    if (!validation.success) {
      return apiResponse.validationError(validation.error);
    }

    const updated = await service.updateHealth(id, validation.data);
    return apiResponse.success(updated);
  } catch (error) {
    const err = error as Error;
    if (err.message.includes('not found')) {
      return apiResponse.refused(error, 'NOT_FOUND', { operation: 'updateHealth' });
    }
    return apiResponse.error(err, undefined, { operation: 'updateHealth' });
  }
}

// ============================================================================
// PERFORM HEALTH CHECK (active probe)
// ============================================================================

export async function handlePerformHealthCheck(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return apiResponse.unauthorized();

    const { id } = await context.params;
    const result = await service.performHealthCheck(id);
    return apiResponse.success(result);
  } catch (error) {
    const err = error as Error;
    if (err.message.includes('not found')) {
      return apiResponse.refused(error, 'NOT_FOUND', { operation: 'performHealthCheck' });
    }
    return apiResponse.error(err, undefined, { operation: 'performHealthCheck' });
  }
}
