// src/features/telemetry/telemetry.api.handlers.ts

/**
 * Telemetry API Handlers
 *
 * HTTP handlers for telemetry configuration endpoints.
 * Mirrors the analytics config handler pattern.
 */

import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { createLogger } from '@/shared/logger/logger';
import { getCurrentUserId } from '@/shared/utils/auth-utils';
import { apiResponse } from '@/shared/api/response';
import {
  getTelemetryStatus,
  setExperienceTelemetryOverride,
  clearExperienceTelemetryOverride,
  clearAllTelemetryOverrides,
} from './telemetry.config';
import {
  getRecentSpans,
  getSpanById,
  getTraceSpans,
  getSpanMetrics,
  deleteSpan,
  deleteAllSpans,
  type TimeRange,
} from './telemetry-query.service';

const logger = createLogger('telemetry-api');

// ============================================================================
// VALIDATION
// ============================================================================

const experienceOverrideSchema = z.object({
  experienceId: z.string().uuid(),
  level: z.enum(['off', 'metadata', 'full']),
});

const timeRangeSchema = z.enum(['1h', '24h', '7d', '30d', '90d']);

const spanQuerySchema = z.object({
  timeRange: timeRangeSchema.default('24h'),
  operationName: z.string().max(255).optional(),
  statusCode: z.string().max(50).optional(),
  experienceId: z.string().uuid().optional(),
  experienceType: z.string().optional(),
  pipelineType: z.string().optional(),
  minDurationMs: z.coerce.number().int().optional(),
  search: z.string().max(255).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
  rootOnly: z.coerce.boolean().optional(),
});

// ============================================================================
// AUTH HELPER
// ============================================================================

async function checkAuth() {
  const userId = await getCurrentUserId();
  if (!userId) {
    return apiResponse.unauthorized('You must be logged in to manage telemetry config');
  }
  return null;
}

// ============================================================================
// HANDLERS
// ============================================================================

/**
 * GET /api/telemetry/config
 * Return current telemetry configuration and status
 */
export async function handleGetTelemetryConfig() {
  try {
    const authError = await checkAuth();
    if (authError) return authError;

    const status = getTelemetryStatus();
    return apiResponse.success(status);
  } catch (error) {
    logger.error('Failed to get telemetry config', error as Error);
    return apiResponse.error('Failed to get telemetry config', 500);
  }
}

/**
 * PUT /api/telemetry/config/experience
 * Set per-experience telemetry override
 */
export async function handleSetExperienceOverride(request: NextRequest) {
  try {
    const authError = await checkAuth();
    if (authError) return authError;

    const body = await request.json();
    const { experienceId, level } = experienceOverrideSchema.parse(body);

    setExperienceTelemetryOverride(experienceId, level);

    const status = getTelemetryStatus();
    return apiResponse.success({
      message: `Telemetry set to '${level}' for experience ${experienceId}`,
      config: status,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiResponse.badRequest(`Invalid request: ${error.message}`);
    }
    logger.error('Failed to set telemetry experience override', error as Error);
    return apiResponse.error('Failed to set telemetry experience override', 500);
  }
}

/**
 * DELETE /api/telemetry/config/experience/:experienceId
 * Clear per-experience telemetry override
 */
export async function handleClearExperienceOverride(
  _request: NextRequest,
  experienceId: string
) {
  try {
    const authError = await checkAuth();
    if (authError) return authError;

    const parseResult = z.string().uuid().safeParse(experienceId);
    if (!parseResult.success) {
      return apiResponse.badRequest('Invalid experience ID');
    }

    clearExperienceTelemetryOverride(experienceId);

    const status = getTelemetryStatus();
    return apiResponse.success({
      message: `Telemetry override cleared for experience ${experienceId}`,
      config: status,
    });
  } catch (error) {
    logger.error('Failed to clear telemetry experience override', error as Error);
    return apiResponse.error('Failed to clear telemetry experience override', 500);
  }
}

/**
 * POST /api/telemetry/config/clear-all
 * Clear all per-experience overrides
 */
export async function handleClearAllOverrides() {
  try {
    const authError = await checkAuth();
    if (authError) return authError;

    clearAllTelemetryOverrides();

    const status = getTelemetryStatus();
    return apiResponse.success({
      message: 'All telemetry experience overrides cleared',
      config: status,
    });
  } catch (error) {
    logger.error('Failed to clear all telemetry overrides', error as Error);
    return apiResponse.error('Failed to clear all telemetry overrides', 500);
  }
}

// ============================================================================
// TRACE VIEWER HANDLERS
// ============================================================================

function parseSpanQueryParams(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  return {
    timeRange: sp.get('timeRange') ?? '24h',
    operationName: sp.get('operationName') ?? undefined,
    statusCode: sp.get('statusCode') ?? undefined,
    experienceId: sp.get('experienceId') ?? undefined,
    experienceType: sp.get('experienceType') ?? undefined,
    pipelineType: sp.get('pipelineType') ?? undefined,
    minDurationMs: sp.get('minDurationMs') ?? undefined,
    search: sp.get('search') ?? undefined,
    rootOnly: sp.get('rootOnly') ?? undefined,
    limit: sp.get('limit') ?? '100',
    offset: sp.get('offset') ?? '0',
  };
}

/** GET /api/telemetry/traces */
export async function handleGetSpans(request: NextRequest) {
  try {
    const authError = await checkAuth();
    if (authError) return authError;

    const raw = parseSpanQueryParams(request);
    const params = spanQuerySchema.parse(raw);

    const result = await getRecentSpans(
      params.timeRange as TimeRange,
      {
        operationName: params.operationName,
        statusCode: params.statusCode,
        experienceId: params.experienceId,
        experienceType: params.experienceType,
        pipelineType: params.pipelineType,
        minDurationMs: params.minDurationMs,
        search: params.search,
        rootOnly: params.rootOnly,
      },
      params.limit,
      params.offset
    );

    return apiResponse.successWithPagination(result.spans, {
      page: Math.floor(params.offset / params.limit) + 1,
      pageSize: params.limit,
      totalPages: Math.ceil(result.total / params.limit),
      totalItems: result.total,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiResponse.badRequest(`Invalid parameters: ${error.message}`);
    }
    logger.error('Failed to get spans', error as Error);
    return apiResponse.error('Failed to get spans', 500);
  }
}

/** GET /api/telemetry/traces/[spanId] */
export async function handleGetSpanById(_request: NextRequest, spanId: string) {
  try {
    const authError = await checkAuth();
    if (authError) return authError;

    const parseResult = z.string().uuid().safeParse(spanId);
    if (!parseResult.success) {
      return apiResponse.badRequest('Invalid span ID');
    }

    const span = await getSpanById(spanId);
    if (!span) return apiResponse.notFound('Span not found');

    return apiResponse.success(span);
  } catch (error) {
    logger.error('Failed to get span by ID', error as Error);
    return apiResponse.error('Failed to get span', 500);
  }
}

/** GET /api/telemetry/traces/trace/[traceId] */
export async function handleGetTraceSpans(_request: NextRequest, traceId: string) {
  try {
    const authError = await checkAuth();
    if (authError) return authError;

    if (!traceId) return apiResponse.badRequest('Trace ID is required');

    const spans = await getTraceSpans(traceId);
    return apiResponse.success(spans);
  } catch (error) {
    logger.error('Failed to get trace spans', error as Error);
    return apiResponse.error('Failed to get trace spans', 500);
  }
}

/** GET /api/telemetry/traces/metrics */
export async function handleGetSpanMetrics(request: NextRequest) {
  try {
    const authError = await checkAuth();
    if (authError) return authError;

    const timeRange = (request.nextUrl.searchParams.get('timeRange') ?? '24h') as TimeRange;
    const metrics = await getSpanMetrics(timeRange);
    return apiResponse.success(metrics);
  } catch (error) {
    logger.error('Failed to get span metrics', error as Error);
    return apiResponse.error('Failed to get span metrics', 500);
  }
}

/** DELETE /api/telemetry/traces/[spanId] */
export async function handleDeleteSpan(_request: NextRequest, spanId: string) {
  try {
    const authError = await checkAuth();
    if (authError) return authError;

    const parseResult = z.string().uuid().safeParse(spanId);
    if (!parseResult.success) return apiResponse.badRequest('Invalid span ID');

    const deleted = await deleteSpan(spanId);
    if (!deleted) return apiResponse.notFound('Span not found');

    return apiResponse.success({ deleted: true, spanId });
  } catch (error) {
    logger.error('Failed to delete span', error as Error);
    return apiResponse.error('Failed to delete span', 500);
  }
}

/** DELETE /api/telemetry/traces */
export async function handleDeleteAllSpans() {
  try {
    const authError = await checkAuth();
    if (authError) return authError;

    const count = await deleteAllSpans();
    return apiResponse.success({ deleted: true, count });
  } catch (error) {
    logger.error('Failed to delete all spans', error as Error);
    return apiResponse.error('Failed to delete all spans', 500);
  }
}
