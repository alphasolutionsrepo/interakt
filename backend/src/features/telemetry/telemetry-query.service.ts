// src/features/telemetry/telemetry-query.service.ts

/**
 * Telemetry Query Service
 *
 * Queries the otel_spans table for the Trace Viewer UI.
 */

import 'server-only';

import { and, count, desc, eq, gte, lte, sql, avg, like, asc, or } from 'drizzle-orm';
import { createLogger } from '@/shared/logger/logger';

const logger = createLogger('telemetry-query');

// ============================================================================
// TYPES
// ============================================================================

export type TimeRange = '1h' | '24h' | '7d' | '30d' | '90d';

export interface SpanListItem {
  id: string;
  traceId: string;
  spanId: string;
  parentSpanId: string | null;
  operationName: string;
  serviceName: string;
  spanKind: string;
  startTime: Date;
  endTime: Date;
  durationMs: number;
  statusCode: string;
  statusMessage: string | null;
  experienceId: string | null;
  experienceType: string | null;
  pipelineType: string | null;
  requestId: string | null;
  sessionId: string | null;
  // Denormalized from JSONB attributes for list display
  userMessage: string | null;
  experienceSlug: string | null;
}

export interface SpanDetail extends SpanListItem {
  attributes: Record<string, unknown>;
  events: Array<{
    name: string;
    timestamp: string;
    attributes: Record<string, unknown>;
  }>;
  createdAt: Date;
}

export interface SpanMetrics {
  totalSpans: number;
  errorCount: number;
  errorRate: number;
  avgDurationMs: number;
  p95DurationMs: number;
  topOperations: Array<{ operation: string; count: number; avgDurationMs: number }>;
  /**
   * Health summary for fire-and-forget post-turn tasks (memory extraction,
   * summarization). These tasks log errors but don't surface them to users;
   * without aggregation a steadily-failing background job would be invisible.
   * Operations counted: anything matching `pipeline.post.%`.
   */
  asyncTasks: {
    total: number;
    errors: number;
    byOperation: Array<{ operation: string; total: number; errors: number }>;
  };
}

export interface SpanFilterOptions {
  operationName?: string;
  statusCode?: string;
  experienceId?: string;
  experienceType?: string;
  pipelineType?: string;
  minDurationMs?: number;
  search?: string;
  /** When true, only return root spans (no parentSpanId) — one per conversation turn */
  rootOnly?: boolean;
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Escape special SQL LIKE pattern characters in user input.
 *
 * Postgres LIKE/ILIKE uses backslash as the default escape character, so the
 * backslash itself must be escaped first — otherwise user input containing a
 * '\' produces a dangling escape sequence (malformed pattern / wrong matches).
 */
function escapeLikePattern(input: string): string {
  return input.replace(/[\\%_]/g, '\\$&');
}

function getDateRange(timeRange: TimeRange): { from: Date; to: Date } {
  const to = new Date();
  const from = new Date();

  switch (timeRange) {
    case '1h':
      from.setHours(from.getHours() - 1);
      break;
    case '24h':
      from.setHours(from.getHours() - 24);
      break;
    case '7d':
      from.setDate(from.getDate() - 7);
      break;
    case '30d':
      from.setDate(from.getDate() - 30);
      break;
    case '90d':
      from.setDate(from.getDate() - 90);
      break;
  }

  return { from, to };
}

// ============================================================================
// QUERIES
// ============================================================================

export async function getRecentSpans(
  timeRange: TimeRange,
  options?: SpanFilterOptions,
  limit: number = 100,
  offset: number = 0
): Promise<{ spans: SpanListItem[]; total: number }> {
  try {
    const { analyticsDB } = await import('@/db/index');
    if (!analyticsDB) return { spans: [], total: 0 };

    const { otelSpans } = await import('@/db/analytics-schema');
    const range = getDateRange(timeRange);

    const conditions = [
      gte(otelSpans.startTime, range.from),
      lte(otelSpans.startTime, range.to),
    ];

    if (options?.operationName) {
      conditions.push(like(otelSpans.operationName, `%${escapeLikePattern(options.operationName)}%`));
    }
    if (options?.statusCode) {
      conditions.push(eq(otelSpans.statusCode, options.statusCode));
    }
    if (options?.experienceId) {
      conditions.push(eq(otelSpans.experienceId, options.experienceId));
    }
    if (options?.experienceType) {
      conditions.push(eq(otelSpans.experienceType, options.experienceType));
    }
    if (options?.pipelineType) {
      conditions.push(eq(otelSpans.pipelineType, options.pipelineType));
    }
    if (options?.minDurationMs) {
      conditions.push(gte(otelSpans.durationMs, options.minDurationMs));
    }
    if (options?.search) {
      const pattern = `%${escapeLikePattern(options.search)}%`;
      conditions.push(
        or(
          like(otelSpans.operationName, pattern),
          sql`${otelSpans.attributes}->>'alpha.chat.user_message' ILIKE ${pattern}`,
          sql`${otelSpans.attributes}->>'alpha.experience.slug' ILIKE ${pattern}`,
        )!,
      );
    }
    if (options?.rootOnly) {
      // Filter to conversation-level spans by operation name prefix.
      // More reliable than parentSpanId IS NULL because chat spans may be children
      // of HTTP instrumentation spans (e.g. "POST /api/v1/ai-experiences/.../chat").
      conditions.push(like(otelSpans.operationName, 'chat.%'));
    }

    const where = and(...conditions);

    const [spans, totalResult] = await Promise.all([
      analyticsDB
        .select({
          id: otelSpans.id,
          traceId: otelSpans.traceId,
          spanId: otelSpans.spanId,
          parentSpanId: otelSpans.parentSpanId,
          operationName: otelSpans.operationName,
          serviceName: otelSpans.serviceName,
          spanKind: otelSpans.spanKind,
          startTime: otelSpans.startTime,
          endTime: otelSpans.endTime,
          durationMs: otelSpans.durationMs,
          statusCode: otelSpans.statusCode,
          statusMessage: otelSpans.statusMessage,
          experienceId: otelSpans.experienceId,
          experienceType: otelSpans.experienceType,
          pipelineType: otelSpans.pipelineType,
          requestId: otelSpans.requestId,
          sessionId: otelSpans.sessionId,
          userMessage: sql<string | null>`${otelSpans.attributes}->>'alpha.chat.user_message'`,
          experienceSlug: sql<string | null>`${otelSpans.attributes}->>'alpha.experience.slug'`,
        })
        .from(otelSpans)
        .where(where)
        .orderBy(desc(otelSpans.startTime))
        .limit(limit)
        .offset(offset),
      analyticsDB
        .select({ total: count() })
        .from(otelSpans)
        .where(where),
    ]);

    return { spans, total: Number(totalResult[0]?.total ?? 0) };
  } catch (error) {
    logger.error('Failed to get recent spans', error as Error);
    return { spans: [], total: 0 };
  }
}

export async function getSpanById(id: string): Promise<SpanDetail | null> {
  try {
    const { analyticsDB } = await import('@/db/index');
    if (!analyticsDB) return null;

    const { otelSpans } = await import('@/db/analytics-schema');

    const results = await analyticsDB
      .select()
      .from(otelSpans)
      .where(eq(otelSpans.id, id))
      .limit(1);

    if (results.length === 0) return null;
    return results[0] as SpanDetail;
  } catch (error) {
    logger.error('Failed to get span by ID', error as Error);
    return null;
  }
}

export async function getTraceSpans(traceId: string): Promise<SpanDetail[]> {
  try {
    const { analyticsDB } = await import('@/db/index');
    if (!analyticsDB) return [];

    const { otelSpans } = await import('@/db/analytics-schema');

    const results = await analyticsDB
      .select()
      .from(otelSpans)
      .where(eq(otelSpans.traceId, traceId))
      .orderBy(asc(otelSpans.startTime));

    return results as SpanDetail[];
  } catch (error) {
    logger.error('Failed to get trace spans', error as Error);
    return [];
  }
}

export async function getSpanMetrics(timeRange: TimeRange): Promise<SpanMetrics> {
  const empty: SpanMetrics = {
    totalSpans: 0,
    errorCount: 0,
    errorRate: 0,
    avgDurationMs: 0,
    p95DurationMs: 0,
    topOperations: [],
    asyncTasks: { total: 0, errors: 0, byOperation: [] },
  };

  try {
    const { analyticsDB } = await import('@/db/index');
    if (!analyticsDB) return empty;

    const { otelSpans } = await import('@/db/analytics-schema');
    const range = getDateRange(timeRange);

    const conditions = [
      gte(otelSpans.startTime, range.from),
      lte(otelSpans.startTime, range.to),
    ];
    const where = and(...conditions);

    const [overallResult, topOpsResult, asyncTaskResult] = await Promise.all([
      analyticsDB
        .select({
          total: count(),
          errors: count(sql`CASE WHEN ${otelSpans.statusCode} = 'ERROR' THEN 1 END`),
          avgDuration: avg(otelSpans.durationMs),
          p95Duration: sql<number>`percentile_cont(0.95) WITHIN GROUP (ORDER BY ${otelSpans.durationMs})`,
        })
        .from(otelSpans)
        .where(where),
      analyticsDB
        .select({
          operation: otelSpans.operationName,
          count: count(),
          avgDuration: avg(otelSpans.durationMs),
        })
        .from(otelSpans)
        .where(where)
        .groupBy(otelSpans.operationName)
        .orderBy(desc(count()))
        .limit(10),
      // Async (post-turn) task health: anything we wrapped in
      // `pipeline.post.*` spans (episodic memory, summarization, etc.).
      analyticsDB
        .select({
          operation: otelSpans.operationName,
          total: count(),
          errors: count(sql`CASE WHEN ${otelSpans.statusCode} = 'ERROR' THEN 1 END`),
        })
        .from(otelSpans)
        .where(and(...conditions, sql`${otelSpans.operationName} LIKE 'pipeline.post.%'`))
        .groupBy(otelSpans.operationName),
    ]);

    const overall = overallResult[0];
    const total = Number(overall?.total ?? 0);
    const errors = Number(overall?.errors ?? 0);

    const byOp = asyncTaskResult.map((r) => ({
      operation: r.operation,
      total: Number(r.total),
      errors: Number(r.errors),
    }));

    return {
      totalSpans: total,
      errorCount: errors,
      errorRate: total > 0 ? errors / total : 0,
      avgDurationMs: Number(overall?.avgDuration ?? 0),
      p95DurationMs: Number(overall?.p95Duration ?? 0),
      topOperations: topOpsResult.map((r) => ({
        operation: r.operation,
        count: Number(r.count),
        avgDurationMs: Number(r.avgDuration ?? 0),
      })),
      asyncTasks: {
        total: byOp.reduce((s, o) => s + o.total, 0),
        errors: byOp.reduce((s, o) => s + o.errors, 0),
        byOperation: byOp,
      },
    };
  } catch (error) {
    logger.error('Failed to get span metrics', error as Error);
    return empty;
  }
}

export async function deleteSpan(id: string): Promise<boolean> {
  try {
    const { analyticsDB } = await import('@/db/index');
    if (!analyticsDB) return false;

    const { otelSpans } = await import('@/db/analytics-schema');

    const result = await analyticsDB
      .delete(otelSpans)
      .where(eq(otelSpans.id, id))
      .returning({ id: otelSpans.id });

    return result.length > 0;
  } catch (error) {
    logger.error('Failed to delete span', error as Error);
    throw error;
  }
}

export async function deleteAllSpans(): Promise<number> {
  try {
    const { analyticsDB } = await import('@/db/index');
    if (!analyticsDB) return 0;

    const { otelSpans } = await import('@/db/analytics-schema');

    const result = await analyticsDB
      .delete(otelSpans)
      .returning({ id: otelSpans.id });

    logger.info('Deleted all OTel spans', { count: result.length });
    return result.length;
  } catch (error) {
    logger.error('Failed to delete all spans', error as Error);
    throw error;
  }
}
