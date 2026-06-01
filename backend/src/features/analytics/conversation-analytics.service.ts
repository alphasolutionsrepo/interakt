// src/features/analytics/conversation-analytics.service.ts

/**
 * Conversation Analytics Service
 *
 * Queries otel_spans directly for conversation-level metrics.
 * These are lightweight SQL queries (not part of the processing pipeline).
 */

import 'server-only';

import { and, count, eq, gte, lte, like, sql, avg } from 'drizzle-orm';
import { createLogger } from '@/shared/logger/logger';
import { getDateRange, type TimeRange } from './analytics-query.service';
import { getAnalyticsConfig } from './analytics-config';

const logger = createLogger('conversation-analytics');

// ============================================================================
// TYPES
// ============================================================================

export interface ConversationMetrics {
  totalConversations: number;
  avgTurnsPerSession: number;
  avgDurationPerTurn: number;
  outcomeDistribution: {
    success: number;
    plan_failed: number;
    context_assembly_failed: number;
    unknown: number;
  };
}

export interface RetryAnalysis {
  apparentZeroResultRate: number;
  realZeroResultRate: number;
  totalSearches: number;
  dedupedSearches: number;
  retrySearchCount: number;
}

export interface ConversationDetail {
  traceId: string;
  spans: Array<{
    id: string;
    operationName: string;
    durationMs: number;
    statusCode: string;
    userMessage?: string;
    planReasoning?: string;
    outcome?: string;
    preset?: string;
    toolName?: string;
    toolSuccess?: string;
    resultCount?: number;
    attributes: Record<string, unknown>;
  }>;
}

// ============================================================================
// CONVERSATION METRICS
// ============================================================================

export async function getConversationMetrics(
  timeRange: TimeRange,
  experienceId?: string
): Promise<ConversationMetrics> {
  const { analyticsDB } = await import('@/db/index');
  const { otelSpans } = await import('@/db/analytics-schema');

  if (!analyticsDB) {
    return {
      totalConversations: 0,
      avgTurnsPerSession: 0,
      avgDurationPerTurn: 0,
      outcomeDistribution: { success: 0, plan_failed: 0, context_assembly_failed: 0, unknown: 0 },
    };
  }

  const range = getDateRange(timeRange);

  const conditions = [
    gte(otelSpans.startTime, range.from),
    lte(otelSpans.startTime, range.to),
    like(otelSpans.operationName, 'chat.%'),
  ];

  if (experienceId) {
    conditions.push(eq(otelSpans.experienceId, experienceId));
  }

  // Total conversations (unique trace IDs with chat operations)
  const [conversationCount] = await analyticsDB
    .select({
      total: sql<number>`COUNT(DISTINCT ${otelSpans.traceId})`,
      totalSpans: count(),
      avgDuration: avg(otelSpans.durationMs),
    })
    .from(otelSpans)
    .where(and(...conditions));

  // Outcome distribution from V2 attributes
  const outcomeRows = await analyticsDB
    .select({
      outcome: sql<string>`${otelSpans.attributes}->>'alpha.v2.outcome'`,
      count: count(),
    })
    .from(otelSpans)
    .where(
      and(
        ...conditions,
        sql`${otelSpans.attributes}->>'alpha.v2.outcome' IS NOT NULL`
      )
    )
    .groupBy(sql`${otelSpans.attributes}->>'alpha.v2.outcome'`);

  const outcomes = { success: 0, plan_failed: 0, context_assembly_failed: 0, unknown: 0 };
  for (const row of outcomeRows) {
    const key = row.outcome as keyof typeof outcomes;
    if (key in outcomes) {
      outcomes[key] = Number(row.count);
    } else {
      outcomes.unknown += Number(row.count);
    }
  }

  const total = Number(conversationCount.total) || 0;
  const totalSpans = Number(conversationCount.totalSpans) || 0;

  return {
    totalConversations: total,
    avgTurnsPerSession: total > 0 ? Math.round((totalSpans / total) * 10) / 10 : 0,
    avgDurationPerTurn: Number(conversationCount.avgDuration) || 0,
    outcomeDistribution: outcomes,
  };
}

// ============================================================================
// RETRY ANALYSIS
// ============================================================================

export async function getRetryAnalysis(
  timeRange: TimeRange,
  experienceId?: string
): Promise<RetryAnalysis> {
  const { analyticsDB } = await import('@/db/index');
  const { otelSpans } = await import('@/db/analytics-schema');

  if (!analyticsDB) {
    return {
      apparentZeroResultRate: 0,
      realZeroResultRate: 0,
      totalSearches: 0,
      dedupedSearches: 0,
      retrySearchCount: 0,
    };
  }

  const range = getDateRange(timeRange);

  const conditions = [
    gte(otelSpans.startTime, range.from),
    lte(otelSpans.startTime, range.to),
    like(otelSpans.operationName, 'tool.%'),
  ];

  if (experienceId) {
    conditions.push(eq(otelSpans.experienceId, experienceId));
  }

  // Get all tool spans
  const toolSpans = await analyticsDB
    .select({
      traceId: otelSpans.traceId,
      operationName: otelSpans.operationName,
      attributes: otelSpans.attributes,
    })
    .from(otelSpans)
    .where(and(...conditions))
    .limit(10000);

  // Deduplicate retries: group by traceId + tool name
  const groups = new Map<string, typeof toolSpans>();

  for (const span of toolSpans) {
    const toolName = (span.attributes?.['alpha.tool.name'] as string) || span.operationName;
    const key = `${span.traceId}:${toolName}`;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(span);
  }

  let apparentZeroResults = 0;
  let realZeroResults = 0;
  let retryCount = 0;

  for (const [, attempts] of groups) {
    if (attempts.length > 1) {
      retryCount += attempts.length - 1;
    }

    // Apparent: count every attempt with 0 results
    for (const attempt of attempts) {
      const resultCount = Number(attempt.attributes?.['alpha.tool.result_count'] ?? -1);
      if (resultCount === 0) {
        apparentZeroResults++;
      }
    }

    // Real: only count if final attempt had 0 results
    const sorted = attempts.sort((a, b) => {
      const aAttempt = Number(a.attributes?.['alpha.tool.attempt'] ?? 0);
      const bAttempt = Number(b.attributes?.['alpha.tool.attempt'] ?? 0);
      return aAttempt - bAttempt;
    });
    const finalResult = Number(sorted[sorted.length - 1].attributes?.['alpha.tool.result_count'] ?? -1);
    if (finalResult === 0) {
      realZeroResults++;
    }
  }

  const totalSearches = toolSpans.length;
  const dedupedSearches = groups.size;

  return {
    apparentZeroResultRate: totalSearches > 0 ? apparentZeroResults / totalSearches : 0,
    realZeroResultRate: dedupedSearches > 0 ? realZeroResults / dedupedSearches : 0,
    totalSearches,
    dedupedSearches,
    retrySearchCount: retryCount,
  };
}

// ============================================================================
// CONVERSATION DETAIL (Single Trace)
// ============================================================================

export async function getConversationDetail(
  traceId: string
): Promise<ConversationDetail | null> {
  const { analyticsDB } = await import('@/db/index');
  const { otelSpans } = await import('@/db/analytics-schema');

  if (!analyticsDB) return null;

  const spans = await analyticsDB
    .select({
      id: otelSpans.id,
      operationName: otelSpans.operationName,
      durationMs: otelSpans.durationMs,
      statusCode: otelSpans.statusCode,
      startTime: otelSpans.startTime,
      attributes: otelSpans.attributes,
    })
    .from(otelSpans)
    .where(eq(otelSpans.traceId, traceId))
    .orderBy(otelSpans.startTime);

  if (spans.length === 0) return null;

  const config = getAnalyticsConfig();
  const redact = config.redactUserMessages;

  return {
    traceId,
    spans: spans.map((s) => ({
      id: s.id,
      operationName: s.operationName,
      durationMs: s.durationMs,
      statusCode: s.statusCode,
      userMessage: redact ? '[redacted]' : (s.attributes?.['alpha.chat.user_message'] as string | undefined),
      planReasoning: s.attributes?.['alpha.v2.plan.reasoning'] as string | undefined,
      outcome: s.attributes?.['alpha.v2.outcome'] as string | undefined,
      preset: s.attributes?.['alpha.v2.preset'] as string | undefined,
      toolName: s.attributes?.['alpha.tool.name'] as string | undefined,
      toolSuccess: s.attributes?.['alpha.tool.success'] as string | undefined,
      resultCount: s.attributes?.['alpha.tool.result_count'] as number | undefined,
      attributes: s.attributes || {},
    })),
  };
}
