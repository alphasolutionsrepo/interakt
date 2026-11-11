// src/features/tools/tools.api.handlers.ts

import { NextRequest } from 'next/server';
import { z } from 'zod';

import type { LookupFieldsConfig } from './executors/data-source/lookup-field-rules';
import { lookupFieldsStatus } from './lookup-fields.service';
import { executeTool } from './tools.executor';
import {
  getOperationsForDataSource,
  getAllExecutorTypes,
  type DataSourceType,
} from './tools.registry';
import * as service from './tools.service';
import {
  createToolSchema,
  updateToolSchema,
  listToolsQuerySchema,
  DATA_SOURCE_OPERATIONS,
} from './tools.validation';

import type { DataSourceSchema } from '@/db/schema/data-sources.schema';
import { assertMayWriteSecretConfig } from '@/features/access/secret-references';
import { withAnalyticsSource } from '@/features/analytics/analytics-source-context';
import * as dataSourceService from '@/features/data-source/data-source.service';
import { readJsonBody } from '@/shared/api/read-json-body';
import { assertMayChange, withBuiltInFlag } from '@/features/access/built-in';
import { apiResponse } from '@/shared/api/response';
import { createLogger } from '@/shared/logger/logger';
import { getCurrentUserId } from '@/shared/utils/auth-utils';


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
    return apiResponse.successWithPagination(await withBuiltInFlag('tool', result.tools), result.pagination);
  } catch (error) {
    const err = error as Error;
    return apiResponse.error(err, undefined, { operation: 'listTools' });
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
    return apiResponse.error(err, undefined, { operation: 'getAllActiveTools' });
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

    await assertMayWriteSecretConfig(validation.data);
    // A tool on the docs data source can end up in the built-in help: only an Admin adds one
    const dataSourceId = (validation.data as { dataSourceId?: string | null }).dataSourceId;
    if (dataSourceId) await assertMayChange('data-source', dataSourceId);
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
    // Slug uniqueness constraint
    if (err.message.includes('already exists') || err.message.includes('duplicate key') || err.message.includes('unique')) {
      return apiResponse.refused(error, { code: 'CONFLICT', message: 'A tool with this slug already exists. Please choose a different name.' }, { operation: 'createTool' });
    }
    // Known application-level validation failures
    if (err.message.includes('Invalid config') || err.message.includes('not found')) {
      return apiResponse.refused(error, 'BAD_REQUEST', { operation: 'createTool' });
    }
    return apiResponse.error(err, undefined, { operation: 'createTool' });
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

    const [flagged] = await withBuiltInFlag('tool', [tool]);
    return apiResponse.success(flagged);
  } catch (error) {
    const err = error as Error;
    return apiResponse.error(err, undefined, { operation: 'getTool' });
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

    // The stored config too: changing only the host of a tool that sends a secret redirects it
    await assertMayWriteSecretConfig(await service.getToolById(id), validation.data);
    const updated = await service.updateTool(id, validation.data, userId);
    if (!updated) {
      return apiResponse.notFound('Tool not found');
    }

    return apiResponse.success(updated);
  } catch (error) {
    const err = error as Error;
    if (err.message.includes('Invalid config')) {
      return apiResponse.refused(error, 'BAD_REQUEST', { operation: 'updateTool' });
    }
    return apiResponse.error(err, undefined, { operation: 'updateTool' });
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
    if (err.message.includes('Cannot delete')) {
      return apiResponse.refused(error, 'BAD_REQUEST', { operation: 'deleteTool' });
    }
    return apiResponse.error(err, undefined, { operation: 'deleteTool' });
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
    return apiResponse.error(err, undefined, { operation: 'checkToolSlug' });
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
    return apiResponse.error(err, undefined, { operation: 'getToolExperiences' });
  }
}

/**
 * GET /api/tools/:id/lookup-fields — a Find Record tool's name and code fields against its data
 * source: the fields it can choose from, chosen fields gone from the index, warnings and a
 * suggestion. `data: null` for tools that don't take them (not Find Record, or uploaded files).
 */
export async function handleGetLookupFields(
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
    if (tool.operation !== 'lookup') return apiResponse.success(null);

    return apiResponse.success(await lookupFieldsStatus(tool.dataSourceId, tool.executorConfig as LookupFieldsConfig | null ?? undefined));
  } catch (error) {
    const err = error as Error;
    return apiResponse.error(err, undefined, { operation: 'getLookupFields' });
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

    // A body that isn't JSON is refused as 400 by apiResponse.error below
    const body = (await readJsonBody(request)) as { input?: unknown } | null;
    const input = body?.input;
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return apiResponse.badRequest('Request body must contain an "input" object');
    }

    // A test run isn't live traffic
    const result = await withAnalyticsSource('admin_test', () => executeTool(id, input as Record<string, unknown>));
    return apiResponse.success(result, result.success ? 200 : 422);
  } catch (error) {
    const err = error as Error;
    return apiResponse.error(err, undefined, { operation: 'testTool' });
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
    return apiResponse.error(err, undefined, { operation: 'generateDescription' });
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
    await assertMayChange('data-source', dataSourceId);

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
    if (err.message.includes('already exists')) {
      return apiResponse.refused(error, 'BAD_REQUEST', { operation: 'scaffoldTools' });
    }
    return apiResponse.error(err, undefined, { operation: 'scaffoldTools' });
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
    return apiResponse.error(err, undefined, { operation: 'getCapabilities' });
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
    return apiResponse.error(err, undefined, { operation: 'getToolsByDataSource' });
  }
}
