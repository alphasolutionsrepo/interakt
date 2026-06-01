// src/features/data-source/data-source.api.handlers.ts

import { NextRequest } from 'next/server';
import { apiResponse } from '@/shared/api/response';
import { createLogger } from '@/shared/logger/logger';
import { getCurrentUserId } from '@/shared/utils/auth-utils';
import * as service from './data-source.service';
import {
  createDataSourceSchema,
  updateDataSourceSchema,
  listDataSourcesQuerySchema,
  updateHealthSchema,
} from './data-source.validation';

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
    logger.error('Failed to list data sources', err);
    return apiResponse.error(err);
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

    const dataSource = await service.createDataSource(validation.data, userId);
    logger.info('Created data source', { dataSourceId: dataSource.id, slug: dataSource.slug, userId });
    return apiResponse.success(dataSource, 201);
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to create data source', err);
    if (err.message.includes('already exists')) {
      return apiResponse.badRequest(err.message);
    }
    return apiResponse.error(err);
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
    logger.error('Failed to get data source', err);
    return apiResponse.error(err);
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

    const updated = await service.updateDataSource(id, validation.data, userId);
    return apiResponse.success(updated);
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to update data source', err);
    if (err.message.includes('not found')) {
      return apiResponse.notFound(err.message);
    }
    return apiResponse.error(err);
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
    logger.error('Failed to delete data source', err);
    if (err.message.includes('not found')) {
      return apiResponse.notFound(err.message);
    }
    return apiResponse.error(err);
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
    logger.error('Failed to check slug', err);
    return apiResponse.error(err);
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
    logger.error('Failed to update data source health', err);
    if (err.message.includes('not found')) {
      return apiResponse.notFound(err.message);
    }
    return apiResponse.error(err);
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
    logger.error('Failed to perform health check', err);
    if (err.message.includes('not found')) {
      return apiResponse.notFound(err.message);
    }
    return apiResponse.error(err);
  }
}
