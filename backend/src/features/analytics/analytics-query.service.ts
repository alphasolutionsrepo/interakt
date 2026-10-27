// src/features/analytics/analytics-query.service.ts

/**
 * Analytics Query Service
 *
 * Provides dashboard and API queries for analytics data.
 * All queries target the analytics database (separate from main app DB).
 */

import 'server-only';

import { and, count, desc, eq, gte, isNull, lte, ne, or, sql, sum, avg, type SQL } from 'drizzle-orm';
import { createLogger } from '@/shared/logger/logger';
import { ATTR } from '@/features/telemetry/attribute-keys';
import type { AnalyticsSource } from './analytics.types';

const logger = createLogger('analytics-query');

// ============================================================================
// TYPES
// ============================================================================

export type TimeRange = '1h' | '24h' | '7d' | '30d' | '90d' | 'custom';
export type Granularity = 'hour' | 'day' | 'week' | 'month';

export interface DateRange {
  from: Date;
  to: Date;
}

export interface OverviewMetrics {
  totalSearches: number;
  totalAIRequests: number;
  uniqueQueries: number;
  zeroResultRate: number;
  avgSearchDurationMs: number;
  avgAIDurationMs: number;
  /** True when search counts come from AI tool-call spans (the experience searches an external index, so no search events exist) */
  searchesFromToolCalls: boolean;
  searchesByTrigger: {
    user: number;
    ai_tool: number;
    ai_rag: number;
    system: number;
  };
}

export interface SearchTrendPoint {
  timestamp: Date;
  totalSearches: number;
  uniqueQueries: number;
  zeroResults: number;
  avgDurationMs: number;
}

export interface PopularQueryResult {
  query: string;
  searchCount: number;
  zeroResultCount: number;
  avgResults: number;
  clickThroughRate: number | null;
}

export interface ZeroResultQueryResult {
  query: string;
  occurrenceCount: number;
  firstSeen: Date;
  lastSeen: Date;
  status: string;
}

export interface SearchTypeBreakdown {
  lexical: number;
  semantic: number;
  hybrid: number;
}

export interface PerformanceMetrics {
  avgDurationMs: number;
  p50DurationMs: number;
  p95DurationMs: number;
  p99DurationMs: number;
  avgEsDurationMs: number;
  avgEmbeddingDurationMs: number;
}

export interface AIUsageMetrics {
  totalRequests: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  avgDurationMs: number;
  byOperation: {
    text: number;
    chat: number;
    embedding: number;
  };
}

export interface ToolUsageMetrics {
  totalExecutions: number;
  successRate: number;
  avgDurationMs: number;
  byTool: Record<string, number>;
  byCategory: Record<string, number>;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get date range from time range preset
 */
export function getDateRange(timeRange: TimeRange, customRange?: DateRange): DateRange {
  const now = new Date();
  const to = now;
  let from: Date;

  switch (timeRange) {
    case '1h':
      from = new Date(now.getTime() - 60 * 60 * 1000);
      break;
    case '24h':
      from = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      break;
    case '7d':
      from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case '30d':
      from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    case '90d':
      from = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      break;
    case 'custom':
      if (!customRange) {
        throw new Error('Custom range requires from and to dates');
      }
      return customRange;
    default:
      from = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  }

  return { from, to };
}

/**
 * Get appropriate granularity for a time range
 */
export function getGranularityForRange(range: DateRange): Granularity {
  const diffMs = range.to.getTime() - range.from.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);

  if (diffHours <= 24) return 'hour';
  if (diffHours <= 7 * 24) return 'hour';
  if (diffHours <= 30 * 24) return 'day';
  return 'week';
}

// ============================================================================
// SOURCE FILTERING HELPER
// ============================================================================

/**
 * Build base search conditions including source filtering.
 * By default, excludes playground and admin_test data from analytics queries
 * so that dashboard metrics reflect real production usage only.
 *
 * When filtering by experienceId, also matches by the experience's associated
 * index IDs so that historical events (before experienceId was tracked) are included.
 */
export async function buildSearchConditions(
  range: DateRange,
  experienceId?: string,
  sourceFilter: AnalyticsSource | 'all' = 'api',
) {
  const { searchEvents } = await import('@/db/analytics-schema');
  const conditions = [
    gte(searchEvents.timestamp, range.from),
    lte(searchEvents.timestamp, range.to),
  ];
  if (experienceId) {
    conditions.push(await buildExperienceCondition(searchEvents, experienceId));
  }
  if (sourceFilter !== 'all') {
    conditions.push(eq(searchEvents.source, sourceFilter));
  }
  return { searchEvents, conditions };
}

/**
 * Match search events belonging to an experience: by experienceId directly, or by the
 * experience's associated index IDs for historical events where experienceId was not yet
 * tracked. The index fallback only applies to untagged events — events tagged with a
 * different experience that share an index must not be counted.
 */
async function buildExperienceCondition(
  searchEvents: typeof import('@/db/analytics-schema').searchEvents,
  experienceId: string,
) {
  const indexIds = await getExperienceIndexIds(experienceId);
  if (indexIds.length === 0) {
    return eq(searchEvents.experienceId, experienceId);
  }
  return or(
    eq(searchEvents.experienceId, experienceId),
    and(
      isNull(searchEvents.experienceId),
      sql`${searchEvents.indexIds}::jsonb ?| array[${sql.join(indexIds.map(id => sql`${id}`), sql`, `)}]`,
    ),
  )!;
}

/** Cache of experience -> index IDs to avoid repeated DB lookups within a request */
const experienceIndexCache = new Map<string, { ids: string[]; expiry: number }>();

async function getExperienceIndexIds(experienceId: string): Promise<string[]> {
  const cached = experienceIndexCache.get(experienceId);
  if (cached && cached.expiry > Date.now()) return cached.ids;

  try {
    const { db } = await import('@/db/index');
    const { searchExperienceIndexes, aiExperienceTools, tools, dataSources } = await import('@/db/schema');

    // Try search experience → indexes (direct join table)
    const searchExpRows = await db
      .select({ searchIndexId: searchExperienceIndexes.searchIndexId })
      .from(searchExperienceIndexes)
      .where(eq(searchExperienceIndexes.searchExperienceId, experienceId));

    if (searchExpRows.length > 0) {
      const ids = searchExpRows.map(r => r.searchIndexId);
      experienceIndexCache.set(experienceId, { ids, expiry: Date.now() + 60_000 });
      return ids;
    }

    // Try AI experience → tools → data sources → search indexes
    const aiExpRows = await db
      .select({ searchIndexId: dataSources.searchIndexId })
      .from(aiExperienceTools)
      .innerJoin(tools, eq(aiExperienceTools.toolId, tools.id))
      .innerJoin(dataSources, eq(tools.dataSourceId, dataSources.id))
      .where(eq(aiExperienceTools.aiExperienceId, experienceId));

    const ids = aiExpRows
      .map(r => r.searchIndexId)
      .filter((id): id is string => id != null);

    experienceIndexCache.set(experienceId, { ids, expiry: Date.now() + 60_000 });
    return ids;
  } catch {
    return [];
  }
}

// ============================================================================
// SEARCH ANALYTICS QUERIES
// ============================================================================

/**
 * Get overview metrics for dashboard
 */
export async function getOverviewMetrics(
  timeRange: TimeRange,
  experienceId?: string,
  customRange?: DateRange
): Promise<OverviewMetrics> {
  const range = getDateRange(timeRange, customRange);

  try {
    const { analyticsDB } = await import('@/db/index');
    if (!analyticsDB) {
      logger.warn('Analytics DB not configured');
      return getEmptyOverviewMetrics();
    }

    const { aiUsageEvents } = await import('@/db/analytics-schema');
    const { searchEvents, conditions: searchConditions } = await buildSearchConditions(range, experienceId);

    // Search metrics. Internal lookups (facet values, vocabularies) are counted under
    // searchesByTrigger.system only: they aren't searches anyone made.
    const notSystem = sql`${searchEvents.triggerType} <> 'system'`;
    const searchMetrics = await analyticsDB
      .select({
        total: count(sql`CASE WHEN ${notSystem} THEN 1 END`),
        zeroResults: count(sql`CASE WHEN ${searchEvents.isZeroResult} = true AND ${notSystem} THEN 1 END`),
        avgDuration: sql<number | null>`AVG(CASE WHEN ${notSystem} THEN ${searchEvents.durationMs} END)`,
        userSearches: count(sql`CASE WHEN ${searchEvents.triggerType} = 'user' THEN 1 END`),
        aiToolSearches: count(sql`CASE WHEN ${searchEvents.triggerType} = 'ai_tool' THEN 1 END`),
        aiRagSearches: count(sql`CASE WHEN ${searchEvents.triggerType} = 'ai_rag' THEN 1 END`),
        systemSearches: count(sql`CASE WHEN ${searchEvents.triggerType} = 'system' THEN 1 END`),
      })
      .from(searchEvents)
      .where(and(...searchConditions));

    // Unique queries count
    const uniqueQueriesResult = await analyticsDB
      .select({
        uniqueQueries: count(sql`DISTINCT ${searchEvents.queryNormalized}`),
      })
      .from(searchEvents)
      .where(and(...searchConditions, ne(searchEvents.triggerType, 'system')));

    // AI metrics — use otelSpans when filtering by experience (aiUsageEvents has no experienceId)
    let aiData: { total: number; avgDuration: number };
    if (experienceId) {
      const { otelSpans } = await import('@/db/analytics-schema');
      const aiSpanRows = await analyticsDB
        .select({
          total: count(),
          avgDuration: sql<number>`COALESCE(AVG(${otelSpans.durationMs}), 0)`,
        })
        .from(otelSpans)
        .where(and(
          eq(otelSpans.experienceId, experienceId),
          eq(otelSpans.operationName, 'pipeline.v2.turn'),
          gte(otelSpans.startTime, range.from),
          lte(otelSpans.startTime, range.to),
          notTestTraffic(otelSpans),
        ));
      aiData = { total: Number(aiSpanRows[0]?.total ?? 0), avgDuration: Number(aiSpanRows[0]?.avgDuration ?? 0) };
    } else {
      const aiConditions = [
        gte(aiUsageEvents.timestamp, range.from),
        lte(aiUsageEvents.timestamp, range.to),
        eq(aiUsageEvents.source, 'api'),
      ];
      const aiMetrics = await analyticsDB
        .select({
          total: count(),
          avgDuration: avg(aiUsageEvents.durationMs),
        })
        .from(aiUsageEvents)
        .where(and(...aiConditions));
      aiData = { total: Number(aiMetrics[0]?.total ?? 0), avgDuration: Number(aiMetrics[0]?.avgDuration ?? 0) };
    }

    const metrics = searchMetrics[0];
    const uniqueQueries = uniqueQueriesResult[0]?.uniqueQueries ?? 0;
    let totalSearches = Number(metrics?.total ?? 0);
    let zeroResults = Number(metrics?.zeroResults ?? 0);
    let avgSearchDurationMs = Number(metrics?.avgDuration ?? 0);
    let searchesFromToolCalls = false;

    // Fallback: for AI experiences with external search (no searchEvents), use OTel tool execution spans.
    // Any stored search event (a test chat's, or an internal lookup's) means searches are tracked, so no fallback.
    if (totalSearches === 0 && experienceId && !(await hasAnySearchEvents(range, experienceId))) {
      const { otelSpans } = await import('@/db/analytics-schema');
      const toolSpanRows = await analyticsDB
        .select({
          total: count(),
          zeroResults: sql<number>`COUNT(CASE WHEN (${otelSpans.attributes}->>'alpha.v2.step.result_count')::int = 0 THEN 1 END)::int`,
          avgDuration: sql<number>`COALESCE(AVG((${otelSpans.attributes}->>'alpha.v2.action_step.duration_ms')::int), 0)`,
        })
        .from(otelSpans)
        .where(and(
          eq(otelSpans.experienceId, experienceId),
          eq(otelSpans.operationName, 'pipeline.v2.action.tool_execution'),
          gte(otelSpans.startTime, range.from),
          lte(otelSpans.startTime, range.to),
          notTestTraffic(otelSpans),
        ));
      const otelSearch = toolSpanRows[0];
      if (otelSearch && Number(otelSearch.total) > 0) {
        totalSearches = Number(otelSearch.total);
        zeroResults = Number(otelSearch.zeroResults);
        avgSearchDurationMs = Number(otelSearch.avgDuration);
        searchesFromToolCalls = true;
      }
    }

    return {
      totalSearches,
      totalAIRequests: aiData.total,
      uniqueQueries: Number(uniqueQueries),
      zeroResultRate: totalSearches > 0 ? zeroResults / totalSearches : 0,
      avgSearchDurationMs,
      avgAIDurationMs: aiData.avgDuration,
      searchesFromToolCalls,
      searchesByTrigger: {
        user: Number(metrics?.userSearches ?? 0),
        ai_tool: Number(metrics?.aiToolSearches ?? 0),
        ai_rag: Number(metrics?.aiRagSearches ?? 0),
        system: Number(metrics?.systemSearches ?? 0),
      },
    };
  } catch (error) {
    logger.error('Failed to get overview metrics', error as Error);
    return getEmptyOverviewMetrics();
  }
}

/**
 * Leaves out spans from admin test chats and the playground. The chat pipeline records the
 * source on the trace's chat.ai_experience.turn span only, so this checks the whole trace.
 */
export function notTestTraffic(otelSpans: typeof import('@/db/analytics-schema').otelSpans): SQL {
  return sql`NOT EXISTS (SELECT 1 FROM otel_spans AS source_span WHERE source_span.trace_id = ${otelSpans.traceId} AND source_span.attributes->>${ATTR.ANALYTICS_SOURCE} IN ('admin_test', 'playground'))`;
}

/** Whether an experience has any search event in the range, of any source or trigger. */
async function hasAnySearchEvents(range: DateRange, experienceId: string): Promise<boolean> {
  const { analyticsDB } = await import('@/db/index');
  if (!analyticsDB) return false;
  const { searchEvents, conditions } = await buildSearchConditions(range, experienceId, 'all');
  const rows = await analyticsDB.select({ id: searchEvents.id }).from(searchEvents).where(and(...conditions)).limit(1);
  return rows.length > 0;
}

function getEmptyOverviewMetrics(): OverviewMetrics {
  return {
    totalSearches: 0,
    totalAIRequests: 0,
    uniqueQueries: 0,
    zeroResultRate: 0,
    avgSearchDurationMs: 0,
    avgAIDurationMs: 0,
    searchesFromToolCalls: false,
    searchesByTrigger: { user: 0, ai_tool: 0, ai_rag: 0, system: 0 },
  };
}

/**
 * Get search trends over time
 */
export async function getSearchTrends(
  timeRange: TimeRange,
  experienceId?: string,
  customRange?: DateRange
): Promise<SearchTrendPoint[]> {
  const range = getDateRange(timeRange, customRange);
  const granularity = getGranularityForRange(range);

  try {
    const { analyticsDB } = await import('@/db/index');
    if (!analyticsDB) {
      return [];
    }

    const { searchEvents, conditions } = await buildSearchConditions(range, experienceId);
    // Match the overview totals: internal lookups aren't searches anyone made
    conditions.push(ne(searchEvents.triggerType, 'system'));

    // Determine time bucket expression based on granularity
    let timeBucketExpr;
    switch (granularity) {
      case 'hour':
        timeBucketExpr = sql`date_trunc('hour', ${searchEvents.timestamp})`;
        break;
      case 'day':
        timeBucketExpr = sql`date_trunc('day', ${searchEvents.timestamp})`;
        break;
      case 'week':
        timeBucketExpr = sql`date_trunc('week', ${searchEvents.timestamp})`;
        break;
      default:
        timeBucketExpr = sql`date_trunc('day', ${searchEvents.timestamp})`;
    }

    const results = await analyticsDB
      .select({
        timeBucket: timeBucketExpr.as('time_bucket'),
        totalSearches: count(),
        uniqueQueries: count(sql`DISTINCT ${searchEvents.queryNormalized}`),
        zeroResults: count(sql`CASE WHEN ${searchEvents.isZeroResult} = true THEN 1 END`),
        avgDurationMs: avg(searchEvents.durationMs),
      })
      .from(searchEvents)
      .where(and(...conditions))
      .groupBy(timeBucketExpr)
      .orderBy(timeBucketExpr);

    return results.map((row) => ({
      timestamp: new Date(row.timeBucket as string),
      totalSearches: Number(row.totalSearches),
      uniqueQueries: Number(row.uniqueQueries),
      zeroResults: Number(row.zeroResults),
      avgDurationMs: Number(row.avgDurationMs ?? 0),
    }));
  } catch (error) {
    logger.error('Failed to get search trends', error as Error);
    return [];
  }
}

/**
 * Who made a search: a visitor typing it, an AI assistant searching to answer one, or either
 * ('all'). Internal lookups (facet values, vocabularies) are none of them.
 */
export const SEARCH_ORIGINS = ['visitor', 'assistant', 'all'] as const;
export type SearchOrigin = (typeof SEARCH_ORIGINS)[number];

function searchOriginCondition(
  searchEvents: typeof import('@/db/analytics-schema').searchEvents,
  origin: SearchOrigin,
) {
  if (origin === 'all') return ne(searchEvents.triggerType, 'system');
  return origin === 'visitor'
    ? eq(searchEvents.triggerType, 'user')
    : or(eq(searchEvents.triggerType, 'ai_tool'), eq(searchEvents.triggerType, 'ai_rag'))!;
}

/**
 * Get popular queries
 */
export async function getPopularQueries(
  timeRange: TimeRange,
  experienceId?: string,
  limit: number = 20,
  customRange?: DateRange,
  origin: SearchOrigin = 'all',
): Promise<PopularQueryResult[]> {
  const range = getDateRange(timeRange, customRange);

  try {
    const { analyticsDB } = await import('@/db/index');
    if (!analyticsDB) {
      return [];
    }

    const { searchEvents, conditions } = await buildSearchConditions(range, experienceId);
    conditions.push(searchOriginCondition(searchEvents, origin));

    const results = await analyticsDB
      .select({
        query: searchEvents.queryNormalized,
        searchCount: count(),
        zeroResultCount: count(sql`CASE WHEN ${searchEvents.isZeroResult} = true THEN 1 END`),
        avgResults: avg(searchEvents.totalResults),
      })
      .from(searchEvents)
      .where(and(...conditions))
      .groupBy(searchEvents.queryNormalized)
      .orderBy(desc(count()))
      .limit(limit);

    return results.map((row) => ({
      query: row.query,
      searchCount: Number(row.searchCount),
      zeroResultCount: Number(row.zeroResultCount),
      avgResults: Number(row.avgResults ?? 0),
      clickThroughRate: null, // Would need click data
    }));
  } catch (error) {
    logger.error('Failed to get popular queries', error as Error);
    return [];
  }
}

/**
 * Get zero result queries for content gap analysis
 */
export async function getZeroResultQueries(
  timeRange: TimeRange,
  experienceId?: string,
  limit: number = 50,
  customRange?: DateRange,
  origin: SearchOrigin = 'all',
): Promise<ZeroResultQueryResult[]> {
  const range = getDateRange(timeRange, customRange);

  try {
    const { analyticsDB } = await import('@/db/index');
    if (!analyticsDB) {
      return [];
    }

    const { searchEvents, conditions } = await buildSearchConditions(range, experienceId);
    conditions.push(eq(searchEvents.isZeroResult, true));
    conditions.push(searchOriginCondition(searchEvents, origin));

    const results = await analyticsDB
      .select({
        query: searchEvents.queryNormalized,
        occurrenceCount: count(),
        firstSeen: sql<Date>`MIN(${searchEvents.timestamp})`,
        lastSeen: sql<Date>`MAX(${searchEvents.timestamp})`,
      })
      .from(searchEvents)
      .where(and(...conditions))
      .groupBy(searchEvents.queryNormalized)
      .orderBy(desc(count()))
      .limit(limit);

    return results.map((row) => ({
      query: row.query,
      occurrenceCount: row.occurrenceCount,
      firstSeen: row.firstSeen,
      lastSeen: row.lastSeen,
      status: 'unreviewed',
    }));
  } catch (error) {
    logger.error('Failed to get zero result queries', error as Error);
    return [];
  }
}

/**
 * Get search type breakdown
 */
export async function getSearchTypeBreakdown(
  timeRange: TimeRange,
  experienceId?: string,
  customRange?: DateRange
): Promise<SearchTypeBreakdown> {
  const range = getDateRange(timeRange, customRange);

  try {
    const { analyticsDB } = await import('@/db/index');
    if (!analyticsDB) {
      return { lexical: 0, semantic: 0, hybrid: 0 };
    }

    const { searchEvents, conditions } = await buildSearchConditions(range, experienceId);
    // Match the overview totals: internal lookups aren't searches anyone made
    conditions.push(ne(searchEvents.triggerType, 'system'));

    const results = await analyticsDB
      .select({
        searchType: searchEvents.searchType,
        count: count(),
      })
      .from(searchEvents)
      .where(and(...conditions))
      .groupBy(searchEvents.searchType);

    const breakdown: SearchTypeBreakdown = { lexical: 0, semantic: 0, hybrid: 0 };
    for (const row of results) {
      if (row.searchType === 'lexical') breakdown.lexical = Number(row.count);
      if (row.searchType === 'semantic') breakdown.semantic = Number(row.count);
      if (row.searchType === 'hybrid') breakdown.hybrid = Number(row.count);
    }

    return breakdown;
  } catch (error) {
    logger.error('Failed to get search type breakdown', error as Error);
    return { lexical: 0, semantic: 0, hybrid: 0 };
  }
}

/**
 * Get performance metrics
 */
export async function getPerformanceMetrics(
  timeRange: TimeRange,
  experienceId?: string,
  customRange?: DateRange
): Promise<PerformanceMetrics> {
  const range = getDateRange(timeRange, customRange);

  try {
    const { analyticsDB } = await import('@/db/index');
    if (!analyticsDB) {
      return getEmptyPerformanceMetrics();
    }

    const { searchEvents, conditions } = await buildSearchConditions(range, experienceId);
    // Match the overview totals: internal lookups aren't searches anyone made
    conditions.push(ne(searchEvents.triggerType, 'system'));

    const results = await analyticsDB
      .select({
        avgDuration: avg(searchEvents.durationMs),
        p50Duration: sql<number>`percentile_cont(0.5) WITHIN GROUP (ORDER BY ${searchEvents.durationMs})`,
        p95Duration: sql<number>`percentile_cont(0.95) WITHIN GROUP (ORDER BY ${searchEvents.durationMs})`,
        p99Duration: sql<number>`percentile_cont(0.99) WITHIN GROUP (ORDER BY ${searchEvents.durationMs})`,
        avgEsDuration: avg(searchEvents.esTookMs),
        avgEmbeddingDuration: avg(searchEvents.embeddingDurationMs),
      })
      .from(searchEvents)
      .where(and(...conditions));

    const row = results[0];
    return {
      avgDurationMs: Number(row?.avgDuration ?? 0),
      p50DurationMs: Number(row?.p50Duration ?? 0),
      p95DurationMs: Number(row?.p95Duration ?? 0),
      p99DurationMs: Number(row?.p99Duration ?? 0),
      avgEsDurationMs: Number(row?.avgEsDuration ?? 0),
      avgEmbeddingDurationMs: Number(row?.avgEmbeddingDuration ?? 0),
    };
  } catch (error) {
    logger.error('Failed to get performance metrics', error as Error);
    return getEmptyPerformanceMetrics();
  }
}

function getEmptyPerformanceMetrics(): PerformanceMetrics {
  return {
    avgDurationMs: 0,
    p50DurationMs: 0,
    p95DurationMs: 0,
    p99DurationMs: 0,
    avgEsDurationMs: 0,
    avgEmbeddingDurationMs: 0,
  };
}

// ============================================================================
// AI ANALYTICS QUERIES
// ============================================================================

/**
 * Get AI usage metrics
 */
export async function getAIUsageMetrics(
  timeRange: TimeRange,
  experienceId?: string,
  customRange?: DateRange
): Promise<AIUsageMetrics> {
  const range = getDateRange(timeRange, customRange);

  try {
    const { analyticsDB } = await import('@/db/index');
    if (!analyticsDB) {
      return getEmptyAIMetrics();
    }

    // aiUsageEvents has no experienceId — use the ai.* spans in the experience's traces
    if (experienceId) {
      const { otelSpans } = await import('@/db/analytics-schema');
      const tokens = (key: string) => sql<number>`COALESCE(SUM((${otelSpans.attributes}->>${key})::int), 0)`;
      const results = await analyticsDB
        .select({
          totalRequests: count(),
          totalTokens: tokens('alpha.ai.total_tokens'),
          inputTokens: tokens('alpha.ai.input_tokens'),
          outputTokens: tokens('alpha.ai.output_tokens'),
          avgDuration: avg(otelSpans.durationMs),
          chatOps: count(sql`CASE WHEN ${otelSpans.attributes}->>'alpha.ai.operation' = 'chat' THEN 1 END`),
          embeddingOps: count(sql`CASE WHEN ${otelSpans.attributes}->>'alpha.ai.operation' = 'embedding' THEN 1 END`),
        })
        .from(otelSpans)
        .where(and(
          sql`${otelSpans.operationName} LIKE 'ai.%'`,
          gte(otelSpans.startTime, range.from),
          lte(otelSpans.startTime, range.to),
          inExperienceTrace(otelSpans, experienceId, range),
          notTestTraffic(otelSpans),
        ));

      const row = results[0];
      return {
        totalRequests: Number(row?.totalRequests ?? 0),
        totalTokens: Number(row?.totalTokens ?? 0),
        inputTokens: Number(row?.inputTokens ?? 0),
        outputTokens: Number(row?.outputTokens ?? 0),
        estimatedCostUsd: 0, // cost is not recorded on spans
        avgDurationMs: Number(row?.avgDuration ?? 0),
        byOperation: {
          text: 0,
          chat: Number(row?.chatOps ?? 0),
          embedding: Number(row?.embeddingOps ?? 0),
        },
      };
    }

    const { aiUsageEvents } = await import('@/db/analytics-schema');

    const conditions = [
      gte(aiUsageEvents.timestamp, range.from),
      lte(aiUsageEvents.timestamp, range.to),
      eq(aiUsageEvents.source, 'api'),
    ];

    const results = await analyticsDB
      .select({
        totalRequests: count(),
        totalTokens: sum(aiUsageEvents.totalTokens),
        inputTokens: sum(aiUsageEvents.inputTokens),
        outputTokens: sum(aiUsageEvents.outputTokens),
        estimatedCost: sum(aiUsageEvents.estimatedCostUsd),
        avgDuration: avg(aiUsageEvents.durationMs),
        textOps: count(sql`CASE WHEN ${aiUsageEvents.operation} = 'text' THEN 1 END`),
        chatOps: count(sql`CASE WHEN ${aiUsageEvents.operation} = 'chat' THEN 1 END`),
        embeddingOps: count(sql`CASE WHEN ${aiUsageEvents.operation} = 'embedding' THEN 1 END`),
      })
      .from(aiUsageEvents)
      .where(and(...conditions));

    const row = results[0];
    return {
      totalRequests: Number(row?.totalRequests ?? 0),
      totalTokens: Number(row?.totalTokens ?? 0),
      inputTokens: Number(row?.inputTokens ?? 0),
      outputTokens: Number(row?.outputTokens ?? 0),
      estimatedCostUsd: Number(row?.estimatedCost ?? 0),
      avgDurationMs: Number(row?.avgDuration ?? 0),
      byOperation: {
        text: Number(row?.textOps ?? 0),
        chat: Number(row?.chatOps ?? 0),
        embedding: Number(row?.embeddingOps ?? 0),
      },
    };
  } catch (error) {
    logger.error('Failed to get AI usage metrics', error as Error);
    return getEmptyAIMetrics();
  }
}

/**
 * Restrict spans to traces that belong to an experience. Only pipeline spans carry
 * experienceId; the ai.* and tool.execute spans inside the same trace do not.
 */
export function inExperienceTrace(
  otelSpans: typeof import('@/db/analytics-schema').otelSpans,
  experienceId: string,
  range: DateRange,
) {
  return sql`${otelSpans.traceId} IN (
    SELECT exp.trace_id FROM otel_spans exp
    WHERE exp.experience_id = ${experienceId}
      AND exp.start_time >= ${range.from.toISOString()}
      AND exp.start_time <= ${range.to.toISOString()}
  )`;
}

function getEmptyAIMetrics(): AIUsageMetrics {
  return {
    totalRequests: 0,
    totalTokens: 0,
    inputTokens: 0,
    outputTokens: 0,
    estimatedCostUsd: 0,
    avgDurationMs: 0,
    byOperation: { text: 0, chat: 0, embedding: 0 },
  };
}

/**
 * Get tool usage metrics
 */
export async function getToolUsageMetrics(
  timeRange: TimeRange,
  experienceId?: string,
  customRange?: DateRange
): Promise<ToolUsageMetrics> {
  const range = getDateRange(timeRange, customRange);

  try {
    const { analyticsDB } = await import('@/db/index');
    if (!analyticsDB) {
      return getEmptyToolMetrics();
    }

    // aiToolExecutions has no experienceId — use the tool.execute spans in the experience's traces
    if (experienceId) {
      const { otelSpans } = await import('@/db/analytics-schema');
      const toolName = sql<string>`${otelSpans.attributes}->>'alpha.tool.slug'`;
      const toolType = sql<string>`${otelSpans.attributes}->>'alpha.tool.type'`;
      const conditions = and(
        eq(otelSpans.operationName, 'tool.execute'),
        gte(otelSpans.startTime, range.from),
        lte(otelSpans.startTime, range.to),
        inExperienceTrace(otelSpans, experienceId, range),
        notTestTraffic(otelSpans),
      );

      const [overallResults, byToolResults, byCategoryResults] = await Promise.all([
        analyticsDB
          .select({
            total: count(),
            successful: count(sql`CASE WHEN ${otelSpans.attributes}->>'alpha.tool.success' = 'true' THEN 1 END`),
            avgDuration: avg(otelSpans.durationMs),
          })
          .from(otelSpans)
          .where(conditions),
        analyticsDB.select({ toolName, count: count() }).from(otelSpans).where(conditions).groupBy(toolName),
        analyticsDB.select({ category: toolType, count: count() }).from(otelSpans).where(conditions).groupBy(toolType),
      ]);

      const overall = overallResults[0];
      const total = Number(overall?.total ?? 0);
      const successful = Number(overall?.successful ?? 0);

      return {
        totalExecutions: total,
        successRate: total > 0 ? successful / total : 0,
        avgDurationMs: Number(overall?.avgDuration ?? 0),
        byTool: Object.fromEntries(byToolResults.map((r) => [r.toolName ?? 'unknown', Number(r.count)])),
        byCategory: Object.fromEntries(byCategoryResults.map((r) => [r.category ?? 'unknown', Number(r.count)])),
      };
    }

    const { aiToolExecutions } = await import('@/db/analytics-schema');

    const conditions = [
      gte(aiToolExecutions.timestamp, range.from),
      lte(aiToolExecutions.timestamp, range.to),
      // The source is kept in metadata (no column); rows from before it was recorded count as live
      sql`COALESCE(${aiToolExecutions.metadata}->>'source', 'api') = 'api'`,
    ];

    // Overall metrics
    const overallResults = await analyticsDB
      .select({
        total: count(),
        successful: count(sql`CASE WHEN ${aiToolExecutions.success} = true THEN 1 END`),
        avgDuration: avg(aiToolExecutions.durationMs),
      })
      .from(aiToolExecutions)
      .where(and(...conditions));

    // By tool
    const byToolResults = await analyticsDB
      .select({
        toolName: aiToolExecutions.toolName,
        count: count(),
      })
      .from(aiToolExecutions)
      .where(and(...conditions))
      .groupBy(aiToolExecutions.toolName);

    // By category
    const byCategoryResults = await analyticsDB
      .select({
        category: aiToolExecutions.toolCategory,
        count: count(),
      })
      .from(aiToolExecutions)
      .where(and(...conditions))
      .groupBy(aiToolExecutions.toolCategory);

    const overall = overallResults[0];
    const total = Number(overall?.total ?? 0);
    const successful = Number(overall?.successful ?? 0);

    return {
      totalExecutions: total,
      successRate: total > 0 ? successful / total : 0,
      avgDurationMs: Number(overall?.avgDuration ?? 0),
      byTool: Object.fromEntries(byToolResults.map((r) => [r.toolName, Number(r.count)])),
      byCategory: Object.fromEntries(byCategoryResults.map((r) => [r.category, Number(r.count)])),
    };
  } catch (error) {
    logger.error('Failed to get tool usage metrics', error as Error);
    return getEmptyToolMetrics();
  }
}

function getEmptyToolMetrics(): ToolUsageMetrics {
  return {
    totalExecutions: 0,
    successRate: 0,
    avgDurationMs: 0,
    byTool: {},
    byCategory: {},
  };
}

// ============================================================================
// RECENT EVENTS
// ============================================================================

/**
 * Get recent search events (for live feed)
 */
export async function getRecentSearchEvents(
  limit: number = 20,
  experienceId?: string
): Promise<
  Array<{
    id: string;
    timestamp: Date;
    query: string;
    searchType: string;
    triggerType: string;
    totalResults: number;
    durationMs: number;
    success: boolean;
  }>
> {
  try {
    const { analyticsDB } = await import('@/db/index');
    if (!analyticsDB) {
      return [];
    }

    const { searchEvents } = await import('@/db/analytics-schema');

    const conditions = [eq(searchEvents.source, 'api')];
    if (experienceId) {
      conditions.push(await buildExperienceCondition(searchEvents, experienceId));
    }

    const results = await analyticsDB
      .select({
        id: searchEvents.id,
        timestamp: searchEvents.timestamp,
        query: searchEvents.queryText,
        searchType: searchEvents.searchType,
        triggerType: searchEvents.triggerType,
        totalResults: searchEvents.totalResults,
        durationMs: searchEvents.durationMs,
        success: searchEvents.success,
      })
      .from(searchEvents)
      .where(and(...conditions))
      .orderBy(desc(searchEvents.timestamp))
      .limit(limit);

    return results.map((row) => ({
      id: row.id,
      timestamp: row.timestamp,
      query: row.query,
      searchType: row.searchType,
      triggerType: row.triggerType,
      totalResults: row.totalResults,
      durationMs: row.durationMs,
      success: row.success,
    }));
  } catch (error) {
    logger.error('Failed to get recent search events', error as Error);
    return [];
  }
}

/**
 * Get search events for a specific query (for investigating failures)
 */
export async function getQuerySearchEvents(
  queryText: string,
  timeRange: TimeRange,
  experienceId?: string,
  limit: number = 50,
  customRange?: DateRange
): Promise<
  Array<{
    id: string;
    timestamp: Date;
    query: string;
    searchType: string;
    triggerType: string;
    totalResults: number;
    isZeroResult: boolean;
    durationMs: number;
    success: boolean;
    hasFilters: boolean;
    filterFields?: string[];
  }>
> {
  const range = getDateRange(timeRange, customRange);

  try {
    const { analyticsDB } = await import('@/db/index');
    if (!analyticsDB) {
      return [];
    }

    const { searchEvents, conditions } = await buildSearchConditions(range, experienceId);
    conditions.push(sql`LOWER(${searchEvents.queryNormalized}) = LOWER(${queryText})`);

    const results = await analyticsDB
      .select({
        id: searchEvents.id,
        timestamp: searchEvents.timestamp,
        query: searchEvents.queryText,
        searchType: searchEvents.searchType,
        triggerType: searchEvents.triggerType,
        totalResults: searchEvents.totalResults,
        isZeroResult: searchEvents.isZeroResult,
        durationMs: searchEvents.durationMs,
        success: searchEvents.success,
        hasFilters: searchEvents.hasFilters,
        filterFields: searchEvents.filterFields,
      })
      .from(searchEvents)
      .where(and(...conditions))
      .orderBy(desc(searchEvents.timestamp))
      .limit(limit);

    return results.map((row) => ({
      id: row.id,
      timestamp: row.timestamp,
      query: row.query,
      searchType: row.searchType,
      triggerType: row.triggerType,
      totalResults: row.totalResults,
      isZeroResult: row.isZeroResult,
      durationMs: row.durationMs,
      success: row.success,
      hasFilters: row.hasFilters ?? false,
      filterFields: row.filterFields ?? undefined,
    }));
  } catch (error) {
    logger.error('Failed to get query search events', error as Error);
    return [];
  }
}

