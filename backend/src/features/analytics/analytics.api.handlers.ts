// src/features/analytics/analytics.api.handlers.ts

/**
 * Analytics API Handlers
 *
 * HTTP handlers for analytics dashboard endpoints.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createLogger } from '@/shared/logger/logger';
import { getCurrentUserId } from '@/shared/utils/auth-utils';
import { apiResponse } from '@/shared/api/response';
import {
  getOverviewMetrics,
  getSearchTrends,
  getPopularQueries,
  getZeroResultQueries,
  getSearchTypeBreakdown,
  getPerformanceMetrics,
  getAIUsageMetrics,
  getToolUsageMetrics,
  getRecentSearchEvents,
  getDateRange,
  getQueueStats,
  getAnalyticsStatus,
  updateAnalyticsConfig,
  enableUserTracking,
  disableUserTracking,
  disableAllAnalytics,
  enableAllAnalytics,
  setExperienceOverride,
  clearExperienceOverride,
  type TimeRange,
  type AnalyticsFeatureFlags,
} from './index';
import { READABLE_INSIGHT_TYPES, getProactiveInsights, getStoredInsight, hideFinding, unhideFinding } from './analytics-insights.service';
import { PeriodError, readRequestedPeriod, readTimeZone } from './analytics-period';

const logger = createLogger('analytics-api');

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const timeRangeSchema = z.enum(['1h', '24h', '7d', '30d', '90d', 'custom']);

const analyticsQuerySchema = z.object({
  timeRange: timeRangeSchema.default('24h'),
  experienceId: z.string().uuid().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check if user is authenticated
 * Returns error response if not authenticated, null if authenticated
 */
async function checkAuth() {
  const userId = await getCurrentUserId();
  if (!userId) {
    return apiResponse.unauthorized('You must be logged in to access analytics');
  }
  return null;
}

function parseQueryParams(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  return {
    timeRange: searchParams.get('timeRange') ?? '24h',
    experienceId: searchParams.get('experienceId') ?? undefined,
    from: searchParams.get('from') ?? undefined,
    to: searchParams.get('to') ?? undefined,
    limit: searchParams.get('limit') ?? '20',
  };
}

function successResponse<T>(data: T) {
  return NextResponse.json({ success: true, data });
}

function errorResponse(message: string, status: number = 400) {
  return NextResponse.json({ success: false, error: message }, { status });
}

// ============================================================================
// HANDLERS
// ============================================================================

/**
 * GET /api/analytics/overview
 * Returns overview metrics for the dashboard
 */
export async function handleGetOverview(request: NextRequest) {
  try {
    const authError = await checkAuth();
    if (authError) return authError;

    const rawParams = parseQueryParams(request);
    const params = analyticsQuerySchema.parse(rawParams);

    const customRange =
      params.timeRange === 'custom' && params.from && params.to
        ? { from: new Date(params.from), to: new Date(params.to) }
        : undefined;

    const metrics = await getOverviewMetrics(
      params.timeRange as TimeRange,
      params.experienceId,
      customRange
    );

    return successResponse(metrics);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(`Invalid parameters: ${error.message}`);
    }
    logger.error('Failed to get overview metrics', error as Error);
    return errorResponse('Failed to get overview metrics', 500);
  }
}

/**
 * GET /api/analytics/search/trends
 * Returns search trend data over time
 */
export async function handleGetSearchTrends(request: NextRequest) {
  try {
    const authError = await checkAuth();
    if (authError) return authError;

    const rawParams = parseQueryParams(request);
    const params = analyticsQuerySchema.parse(rawParams);

    const customRange =
      params.timeRange === 'custom' && params.from && params.to
        ? { from: new Date(params.from), to: new Date(params.to) }
        : undefined;

    const trends = await getSearchTrends(
      params.timeRange as TimeRange,
      params.experienceId,
      customRange
    );

    return successResponse(trends);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(`Invalid parameters: ${error.message}`);
    }
    logger.error('Failed to get search trends', error as Error);
    return errorResponse('Failed to get search trends', 500);
  }
}

/**
 * GET /api/analytics/search/popular
 * Returns popular search queries
 */
export async function handleGetPopularQueries(request: NextRequest) {
  try {
    const authError = await checkAuth();
    if (authError) return authError;

    const rawParams = parseQueryParams(request);
    const params = analyticsQuerySchema.parse(rawParams);

    const customRange =
      params.timeRange === 'custom' && params.from && params.to
        ? { from: new Date(params.from), to: new Date(params.to) }
        : undefined;

    const queries = await getPopularQueries(
      params.timeRange as TimeRange,
      params.experienceId,
      params.limit,
      customRange
    );

    return successResponse(queries);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(`Invalid parameters: ${error.message}`);
    }
    logger.error('Failed to get popular queries', error as Error);
    return errorResponse('Failed to get popular queries', 500);
  }
}

/**
 * GET /api/analytics/search/zero-results
 * Returns queries with zero results (content gaps)
 */
export async function handleGetZeroResultQueries(request: NextRequest) {
  try {
    const authError = await checkAuth();
    if (authError) return authError;

    const rawParams = parseQueryParams(request);
    const params = analyticsQuerySchema.parse(rawParams);

    const customRange =
      params.timeRange === 'custom' && params.from && params.to
        ? { from: new Date(params.from), to: new Date(params.to) }
        : undefined;

    const queries = await getZeroResultQueries(
      params.timeRange as TimeRange,
      params.experienceId,
      params.limit,
      customRange
    );

    return successResponse(queries);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(`Invalid parameters: ${error.message}`);
    }
    logger.error('Failed to get zero result queries', error as Error);
    return errorResponse('Failed to get zero result queries', 500);
  }
}

/**
 * GET /api/analytics/search/types
 * Returns search type breakdown (lexical/semantic/hybrid)
 */
export async function handleGetSearchTypeBreakdown(request: NextRequest) {
  try {
    const authError = await checkAuth();
    if (authError) return authError;

    const rawParams = parseQueryParams(request);
    const params = analyticsQuerySchema.parse(rawParams);

    const customRange =
      params.timeRange === 'custom' && params.from && params.to
        ? { from: new Date(params.from), to: new Date(params.to) }
        : undefined;

    const breakdown = await getSearchTypeBreakdown(
      params.timeRange as TimeRange,
      params.experienceId,
      customRange
    );

    return successResponse(breakdown);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(`Invalid parameters: ${error.message}`);
    }
    logger.error('Failed to get search type breakdown', error as Error);
    return errorResponse('Failed to get search type breakdown', 500);
  }
}

/**
 * GET /api/analytics/search/performance
 * Returns search performance metrics (latency percentiles)
 */
export async function handleGetPerformanceMetrics(request: NextRequest) {
  try {
    const authError = await checkAuth();
    if (authError) return authError;

    const rawParams = parseQueryParams(request);
    const params = analyticsQuerySchema.parse(rawParams);

    const customRange =
      params.timeRange === 'custom' && params.from && params.to
        ? { from: new Date(params.from), to: new Date(params.to) }
        : undefined;

    const metrics = await getPerformanceMetrics(
      params.timeRange as TimeRange,
      params.experienceId,
      customRange
    );

    return successResponse(metrics);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(`Invalid parameters: ${error.message}`);
    }
    logger.error('Failed to get performance metrics', error as Error);
    return errorResponse('Failed to get performance metrics', 500);
  }
}

/**
 * GET /api/analytics/ai/usage
 * Returns AI usage metrics (tokens, costs)
 */
export async function handleGetAIUsage(request: NextRequest) {
  try {
    const authError = await checkAuth();
    if (authError) return authError;

    const rawParams = parseQueryParams(request);
    const params = analyticsQuerySchema.parse(rawParams);

    const customRange =
      params.timeRange === 'custom' && params.from && params.to
        ? { from: new Date(params.from), to: new Date(params.to) }
        : undefined;

    const metrics = await getAIUsageMetrics(params.timeRange as TimeRange, params.experienceId, customRange);

    return successResponse(metrics);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(`Invalid parameters: ${error.message}`);
    }
    logger.error('Failed to get AI usage metrics', error as Error);
    return errorResponse('Failed to get AI usage metrics', 500);
  }
}

/**
 * GET /api/analytics/ai/tools
 * Returns AI tool usage metrics
 */
export async function handleGetToolUsage(request: NextRequest) {
  try {
    const authError = await checkAuth();
    if (authError) return authError;

    const rawParams = parseQueryParams(request);
    const params = analyticsQuerySchema.parse(rawParams);

    const customRange =
      params.timeRange === 'custom' && params.from && params.to
        ? { from: new Date(params.from), to: new Date(params.to) }
        : undefined;

    const metrics = await getToolUsageMetrics(params.timeRange as TimeRange, params.experienceId, customRange);

    return successResponse(metrics);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(`Invalid parameters: ${error.message}`);
    }
    logger.error('Failed to get tool usage metrics', error as Error);
    return errorResponse('Failed to get tool usage metrics', 500);
  }
}

/**
 * GET /api/analytics/search/recent
 * Returns recent search events (live feed)
 */
export async function handleGetRecentSearches(request: NextRequest) {
  try {
    const authError = await checkAuth();
    if (authError) return authError;

    const rawParams = parseQueryParams(request);
    const params = analyticsQuerySchema.parse(rawParams);

    const events = await getRecentSearchEvents(params.limit, params.experienceId);

    return successResponse(events);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(`Invalid parameters: ${error.message}`);
    }
    logger.error('Failed to get recent search events', error as Error);
    return errorResponse('Failed to get recent search events', 500);
  }
}

/**
 * GET /api/analytics/status
 * Returns analytics collector status (queue stats)
 */
export async function handleGetStatus() {
  try {
    const authError = await checkAuth();
    if (authError) return authError;

    const stats = getQueueStats();
    return successResponse(stats);
  } catch (error) {
    logger.error('Failed to get analytics status', error as Error);
    return errorResponse('Failed to get analytics status', 500);
  }
}

const insightsQuerySchema = z.object({
  type: z.enum(READABLE_INSIGHT_TYPES).default('proactive_insights'),
  // Insights are only computed for these periods
  timeRange: z.enum(['24h', '7d', '30d']).default('7d'),
  experienceId: z.string().uuid().optional(),
});

/**
 * GET /api/analytics/insights
 * Returns a stored insight for an experience, or all experiences combined, with
 * when it was computed. The default type, proactive_insights, is "what needs
 * attention" and returns its list as `insights`; other types return `data`.
 */
export async function handleGetInsights(request: NextRequest) {
  try {
    const authError = await checkAuth();
    if (authError) return authError;

    const searchParams = request.nextUrl.searchParams;
    const params = insightsQuerySchema.parse({
      type: searchParams.get('type') ?? undefined,
      timeRange: searchParams.get('timeRange') ?? undefined,
      experienceId: searchParams.get('experienceId') ?? undefined,
    });

    if (params.type === 'proactive_insights') {
      return successResponse(await getProactiveInsights(params.timeRange, params.experienceId));
    }
    return successResponse(await getStoredInsight(params.type, params.timeRange, params.experienceId));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(`Invalid parameters: ${error.message}`);
    }
    logger.error('Failed to get insights', error as Error);
    return errorResponse('Failed to get insights', 500);
  }
}

const hiddenFindingSchema = z.object({
  findingId: z.string().regex(/^[a-z0-9_]{1,100}$/),
  experienceId: z.string().uuid().optional(),
});
const hideFindingSchema = hiddenFindingSchema.extend({
  days: z.number().int().min(1).max(90).default(7),
});

/**
 * POST /api/analytics/insights/hidden — hide a finding for some days
 * DELETE /api/analytics/insights/hidden?findingId=…&experienceId=… — show it again
 * Hides are shared by every admin.
 */
export async function handleHideFinding(request: NextRequest) {
  try {
    const authError = await checkAuth();
    if (authError) return authError;
    const body = hideFindingSchema.parse(await request.json().catch(() => ({})));
    const hiddenUntil = await hideFinding(body.findingId, body.experienceId, body.days);
    return successResponse({ findingId: body.findingId, hiddenUntil: hiddenUntil.toISOString() });
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse(`Invalid request: ${error.message}`);
    logger.error('Failed to hide finding', error as Error);
    return errorResponse('Failed to hide finding', 500);
  }
}

export async function handleUnhideFinding(request: NextRequest) {
  try {
    const authError = await checkAuth();
    if (authError) return authError;
    const sp = request.nextUrl.searchParams;
    const params = hiddenFindingSchema.parse({
      findingId: sp.get('findingId') ?? undefined,
      experienceId: sp.get('experienceId') ?? undefined,
    });
    await unhideFinding(params.findingId, params.experienceId);
    return successResponse({ findingId: params.findingId });
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse(`Invalid request: ${error.message}`);
    logger.error('Failed to show finding again', error as Error);
    return errorResponse('Failed to show finding again', 500);
  }
}

/**
 * GET /api/analytics/dashboard
 * Returns all dashboard data in a single request
 */
export async function handleGetDashboard(request: NextRequest) {
  try {
    const authError = await checkAuth();
    if (authError) return authError;

    const rawParams = parseQueryParams(request);
    const params = analyticsQuerySchema.parse(rawParams);

    // The analytics pages send an explicit period and the viewer's time zone
    const searchParams = request.nextUrl.searchParams;
    const customRange = params.timeRange === 'custom' ? readRequestedPeriod(searchParams) : undefined;
    if (params.timeRange === 'custom' && !customRange) {
      return errorResponse('A custom period needs from and to');
    }
    const timeZone = readTimeZone(searchParams);

    const timeRange = params.timeRange as TimeRange;
    const experienceId = params.experienceId;

    // ?view=totals: just the headline totals, for comparing with the previous period
    // without the trend and query-list aggregations
    if (searchParams.get('view') === 'totals') {
      const [overview, aiUsage, toolUsage] = await Promise.all([
        getOverviewMetrics(timeRange, experienceId, customRange),
        getAIUsageMetrics(timeRange, experienceId, customRange),
        getToolUsageMetrics(timeRange, experienceId, customRange),
      ]);
      return successResponse({ overview, aiUsage, toolUsage });
    }

    // Fetch all data in parallel
    const [
      overview,
      trends,
      popularQueries,
      zeroResults,
      searchTypes,
      performance,
      aiUsage,
      toolUsage,
      recentSearches,
    ] = await Promise.all([
      getOverviewMetrics(timeRange, experienceId, customRange),
      getSearchTrends(timeRange, experienceId, customRange, timeZone),
      getPopularQueries(timeRange, experienceId, 10, customRange),
      getZeroResultQueries(timeRange, experienceId, 10, customRange),
      getSearchTypeBreakdown(timeRange, experienceId, customRange),
      getPerformanceMetrics(timeRange, experienceId, customRange),
      getAIUsageMetrics(timeRange, experienceId, customRange),
      getToolUsageMetrics(timeRange, experienceId, customRange),
      getRecentSearchEvents(10, experienceId, getDateRange(timeRange, customRange)),
    ]);

    return successResponse({
      overview,
      trends,
      popularQueries,
      zeroResults,
      searchTypes,
      performance,
      aiUsage,
      toolUsage,
      recentSearches,
      meta: {
        timeRange: params.timeRange,
        experienceId: experienceId ?? null,
        timeZone,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(`Invalid parameters: ${error.message}`);
    }
    if (error instanceof PeriodError) {
      return errorResponse(error.message);
    }
    logger.error('Failed to get dashboard data', error as Error);
    return errorResponse('Failed to get dashboard data', 500);
  }
}

// ============================================================================
// CONFIG HANDLERS (Feature Flags)
// ============================================================================

const configUpdateSchema = z.object({
  enabled: z.boolean().optional(),
  trackSearchEvents: z.boolean().optional(),
  trackAIUsage: z.boolean().optional(),
  trackToolExecutions: z.boolean().optional(),
  trackErrors: z.boolean().optional(),
  trackSessions: z.boolean().optional(),
  trackClicks: z.boolean().optional(),
  trackUserAgent: z.boolean().optional(),
  trackIPHash: z.boolean().optional(),
  enableRealTimeFeed: z.boolean().optional(),
  enableAggregationJobs: z.boolean().optional(),
  enableAnalyticsChat: z.boolean().optional(),
});

const experienceOverrideSchema = z.object({
  experienceId: z.string().uuid(),
  overrides: configUpdateSchema,
});

/**
 * GET /api/analytics/config
 * Returns current analytics configuration and feature flags
 */
export async function handleGetConfig() {
  try {
    const authError = await checkAuth();
    if (authError) return authError;

    const status = getAnalyticsStatus();
    return successResponse(status);
  } catch (error) {
    logger.error('Failed to get analytics config', error as Error);
    return errorResponse('Failed to get analytics config', 500);
  }
}

/**
 * PUT /api/analytics/config
 * Update analytics configuration (runtime overrides)
 */
export async function handleUpdateConfig(request: NextRequest) {
  try {
    const authError = await checkAuth();
    if (authError) return authError;

    const body = await request.json();
    const updates = configUpdateSchema.parse(body);

    updateAnalyticsConfig(updates as Partial<AnalyticsFeatureFlags>);

    const status = getAnalyticsStatus();
    return successResponse({
      message: 'Analytics configuration updated',
      config: status,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(`Invalid configuration: ${error.message}`);
    }
    logger.error('Failed to update analytics config', error as Error);
    return errorResponse('Failed to update analytics config', 500);
  }
}

/**
 * POST /api/analytics/config/enable-user-tracking
 * Enable all user-facing tracking features
 */
export async function handleEnableUserTracking() {
  try {
    const authError = await checkAuth();
    if (authError) return authError;

    enableUserTracking();
    const status = getAnalyticsStatus();
    return successResponse({
      message: 'User tracking enabled',
      config: status,
    });
  } catch (error) {
    logger.error('Failed to enable user tracking', error as Error);
    return errorResponse('Failed to enable user tracking', 500);
  }
}

/**
 * POST /api/analytics/config/disable-user-tracking
 * Disable all user-facing tracking features
 */
export async function handleDisableUserTracking() {
  try {
    const authError = await checkAuth();
    if (authError) return authError;

    disableUserTracking();
    const status = getAnalyticsStatus();
    return successResponse({
      message: 'User tracking disabled',
      config: status,
    });
  } catch (error) {
    logger.error('Failed to disable user tracking', error as Error);
    return errorResponse('Failed to disable user tracking', 500);
  }
}

/**
 * POST /api/analytics/config/disable-all
 * Emergency kill switch - disable all analytics
 */
export async function handleDisableAllAnalytics() {
  try {
    const authError = await checkAuth();
    if (authError) return authError;

    disableAllAnalytics();
    const status = getAnalyticsStatus();
    return successResponse({
      message: 'All analytics disabled',
      config: status,
    });
  } catch (error) {
    logger.error('Failed to disable all analytics', error as Error);
    return errorResponse('Failed to disable all analytics', 500);
  }
}

/**
 * POST /api/analytics/config/enable-all
 * Re-enable analytics after kill switch
 */
export async function handleEnableAllAnalytics() {
  try {
    const authError = await checkAuth();
    if (authError) return authError;

    enableAllAnalytics();
    const status = getAnalyticsStatus();
    return successResponse({
      message: 'All analytics enabled',
      config: status,
    });
  } catch (error) {
    logger.error('Failed to enable all analytics', error as Error);
    return errorResponse('Failed to enable all analytics', 500);
  }
}

/**
 * PUT /api/analytics/config/experience/:experienceId
 * Set experience-specific overrides
 */
export async function handleSetExperienceOverride(request: NextRequest) {
  try {
    const authError = await checkAuth();
    if (authError) return authError;

    const body = await request.json();
    const { experienceId, overrides } = experienceOverrideSchema.parse(body);

    setExperienceOverride(experienceId, overrides as Partial<AnalyticsFeatureFlags>);

    const status = getAnalyticsStatus();
    return successResponse({
      message: `Experience override set for ${experienceId}`,
      config: status,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(`Invalid request: ${error.message}`);
    }
    logger.error('Failed to set experience override', error as Error);
    return errorResponse('Failed to set experience override', 500);
  }
}

/**
 * DELETE /api/analytics/config/experience/:experienceId
 * Clear experience-specific overrides
 */
export async function handleClearExperienceOverride(
  _request: NextRequest,
  experienceId: string
) {
  try {
    const authError = await checkAuth();
    if (authError) return authError;

    // Validate experience ID
    const parseResult = z.string().uuid().safeParse(experienceId);
    if (!parseResult.success) {
      return errorResponse('Invalid experience ID');
    }

    clearExperienceOverride(experienceId);

    const status = getAnalyticsStatus();
    return successResponse({
      message: `Experience override cleared for ${experienceId}`,
      config: status,
    });
  } catch (error) {
    logger.error('Failed to clear experience override', error as Error);
    return errorResponse('Failed to clear experience override', 500);
  }
}
