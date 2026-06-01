// src/features/tools/tools.api.handlers.ts

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { apiResponse } from '@/shared/api/response';
import { createLogger } from '@/shared/logger/logger';
import { getCurrentUserId } from '@/shared/utils/auth-utils';
import * as service from './tools.service';
import * as dataSourceService from '@/features/data-source/data-source.service';
import { executeTool } from './tools.executor';
import {
  createToolSchema,
  updateToolSchema,
  listToolsQuerySchema,
  DATA_SOURCE_OPERATIONS,
} from './tools.validation';
import {
  getOperationsForDataSource,
  getAllExecutorTypes,
  type DataSourceType,
} from './tools.registry';
import type { DataSourceSchema } from '@/db/schema/data-sources.schema';

const logger = createLogger('tools-handlers');

// ============================================================================
// LIST
// ============================================================================

export async function handleListTools(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return apiResponse.unauthorized();

    const searchParams = Object.fromEntries(request.nextUrl.searchParams);
    const validation = listToolsQuerySchema.safeParse(searchParams);
    if (!validation.success) {
      return apiResponse.validationError(validation.error);
    }

    const result = await service.listTools(validation.data);
    return apiResponse.successWithPagination(result.tools, result.pagination);
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to list tools', err);
    return apiResponse.error(err);
  }
}

// ============================================================================
// GET ALL (for dropdowns)
// ============================================================================

export async function handleGetAllActiveTools() {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return apiResponse.unauthorized();

    const tools = await service.getAllActiveTools();
    return apiResponse.success(tools);
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to get all active tools', err);
    return apiResponse.error(err);
  }
}

// ============================================================================
// CREATE
// ============================================================================

export async function handleCreateTool(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return apiResponse.unauthorized();

    const body = await request.json();
    const validation = createToolSchema.safeParse(body);
    if (!validation.success) {
      return apiResponse.validationError(validation.error);
    }

    const tool = await service.createTool(validation.data, userId);
    logger.info('Created tool', {
      toolId: tool.id,
      slug: tool.slug,
      executorType: tool.executorType,
      operation: tool.operation,
      userId,
    });
    return apiResponse.success(tool, 201);
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to create tool', err);
    // Slug uniqueness constraint
    if (err.message.includes('already exists') || err.message.includes('duplicate key') || err.message.includes('unique')) {
      return apiResponse.conflict('A tool with this slug already exists. Please choose a different name.');
    }
    // Known application-level validation failures
    if (err.message.includes('Invalid config') || err.message.includes('not found')) {
      return apiResponse.badRequest(err.message);
    }
    return apiResponse.error(err);
  }
}

// ============================================================================
// GET BY ID
// ============================================================================

export async function handleGetTool(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return apiResponse.unauthorized();

    const { id } = await context.params;
    const tool = await service.getToolById(id);
    if (!tool) {
      return apiResponse.notFound('Tool not found');
    }

    return apiResponse.success(tool);
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to get tool', err);
    return apiResponse.error(err);
  }
}

// ============================================================================
// UPDATE
// ============================================================================

export async function handleUpdateTool(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return apiResponse.unauthorized();

    const { id } = await context.params;
    const body = await request.json();
    const validation = updateToolSchema.safeParse(body);
    if (!validation.success) {
      return apiResponse.validationError(validation.error);
    }

    const updated = await service.updateTool(id, validation.data, userId);
    if (!updated) {
      return apiResponse.notFound('Tool not found');
    }

    return apiResponse.success(updated);
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to update tool', err);
    if (err.message.includes('Invalid config')) {
      return apiResponse.badRequest(err.message);
    }
    return apiResponse.error(err);
  }
}

// ============================================================================
// DELETE
// ============================================================================

export async function handleDeleteTool(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return apiResponse.unauthorized();

    const { id } = await context.params;
    const deleted = await service.deleteTool(id, userId);
    if (!deleted) {
      return apiResponse.notFound('Tool not found');
    }

    return apiResponse.success({ deleted: true });
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to delete tool', err);
    if (err.message.includes('Cannot delete')) {
      return apiResponse.badRequest(err.message);
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
// GET EXPERIENCES USING TOOL
// ============================================================================

export async function handleGetToolExperiences(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return apiResponse.unauthorized();

    const { id } = await context.params;
    const tool = await service.getToolById(id);
    if (!tool) {
      return apiResponse.notFound('Tool not found');
    }

    const count = await service.getToolExperienceCount(id);
    return apiResponse.success({ toolId: id, experienceCount: count });
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to get tool experiences', err);
    return apiResponse.error(err);
  }
}

// ============================================================================
// TEST / EXECUTE
// ============================================================================

export async function handleTestTool(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return apiResponse.unauthorized();

    const { id } = await context.params;

    let body: { input?: Record<string, unknown> };
    try {
      body = await request.json();
    } catch {
      return apiResponse.validationError({ message: 'Request body must be valid JSON' } as never);
    }

    if (!body.input || typeof body.input !== 'object' || Array.isArray(body.input)) {
      return apiResponse.validationError({ message: 'Request body must contain an "input" object' } as never);
    }

    const result = await executeTool(id, body.input);
    return apiResponse.success(result, result.success ? 200 : 422);
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to test tool', err);
    return apiResponse.error(err);
  }
}

// ============================================================================
// GENERATE DESCRIPTION (for UI pre-fill)
// POST /api/tools/generate-description
// ============================================================================

const generateDescriptionSchema = z.object({
  dataSourceName: z.string().min(1),
  dataSourceType: z.enum(['search_index', 'search_index_external', 'file_store', 'database']),
  operation: z.enum(DATA_SOURCE_OPERATIONS),
  schema: z.object({
    fields: z.array(z.object({
      name: z.string(),
      displayName: z.string(),
      type: z.string(),
      role: z.string().nullable().optional(),
      isSearchable: z.boolean(),
      isFacetable: z.boolean(),
      isFilterable: z.boolean(),
      description: z.string().optional(),
    })),
    lastDiscoveredAt: z.string().optional(),
  }).optional(),
});

export async function handleGenerateDescription(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return apiResponse.unauthorized();

    const body = await request.json();
    const validation = generateDescriptionSchema.safeParse(body);
    if (!validation.success) {
      return apiResponse.validationError(validation.error);
    }

    const { dataSourceName, dataSourceType, operation, schema } = validation.data;
    const result = service.generateDescription(
      dataSourceName,
      dataSourceType as DataSourceType,
      operation,
      schema as DataSourceSchema | undefined,
    );

    return apiResponse.success(result);
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to generate description', err);
    return apiResponse.error(err);
  }
}

// ============================================================================
// CREATE TOOLS FOR DATA SOURCE (scaffold)
// POST /api/tools/scaffold
// ============================================================================

const scaffoldToolsSchema = z.object({
  dataSourceId: z.string().uuid(),
});

export async function handleScaffoldTools(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return apiResponse.unauthorized();

    const body = await request.json();
    const validation = scaffoldToolsSchema.safeParse(body);
    if (!validation.success) {
      return apiResponse.validationError(validation.error);
    }

    const { dataSourceId } = validation.data;

    // Look up the data source to get name, slug, type, and schema
    const dataSource = await dataSourceService.getDataSourceById(dataSourceId);
    if (!dataSource) {
      return apiResponse.notFound('Data source not found');
    }

    // Get all supported operations so we can report skipped ones
    const supportedOps = getOperationsForDataSource(dataSource.type as DataSourceType);

    const tools = await service.createToolsForDataSource(
      dataSource.id,
      dataSource.name,
      dataSource.slug,
      dataSource.type as DataSourceType,
      dataSource.schema ?? undefined,
      userId,
    );

    // Build created list
    const created = tools.map(t => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      operation: t.operation ?? '',
    }));

    // Build skipped list — any supported operation not in the created tools
    const createdOps = new Set(tools.map(t => t.operation));
    const skipped = supportedOps
      .filter(op => !createdOps.has(op.operation))
      .map(op => ({
        slug: `${dataSource.slug}-${op.operation}`,
        operation: op.operation,
        reason: 'Tool already exists',
      }));

    return apiResponse.success({ created, skipped }, 201);
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to scaffold tools', err);
    if (err.message.includes('already exists')) {
      return apiResponse.badRequest(err.message);
    }
    return apiResponse.error(err);
  }
}

// ============================================================================
// GET CAPABILITIES (for UI — what can be created)
// GET /api/tools/capabilities
// ============================================================================

export async function handleGetCapabilities(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return apiResponse.unauthorized();

    const dataSourceType = request.nextUrl.searchParams.get('dataSourceType') as DataSourceType | null;

    const executorTypes = getAllExecutorTypes();
    const operations = dataSourceType
      ? getOperationsForDataSource(dataSourceType)
      : [];

    return apiResponse.success({
      executorTypes,
      operations,
    });
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to get capabilities', err);
    return apiResponse.error(err);
  }
}

// ============================================================================
// GET TOOLS BY DATA SOURCE
// GET /api/tools/by-data-source/[dataSourceId]
// ============================================================================

export async function handleGetToolsByDataSource(
  _request: NextRequest,
  context: { params: Promise<{ dataSourceId: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return apiResponse.unauthorized();

    const { dataSourceId } = await context.params;
    const tools = await service.getToolsByDataSourceId(dataSourceId);
    return apiResponse.success(tools);
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to get tools by data source', err);
    return apiResponse.error(err);
  }
}
