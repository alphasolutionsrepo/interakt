// src/features/analytics/analytics-insights.service.ts

/**
 * Analytics Insights Service
 *
 * Reads the proactive insights that analytics processing stores, for the
 * overview's "What needs attention" list. Says when the insights were computed
 * and whether there were any to compute, so the page never presents a missing
 * or stale result as "all good".
 */

import 'server-only';

import { and, eq, gt, gte, isNotNull, sql } from 'drizzle-orm';

import type { ProactiveInsight } from './proactive-insights.service';

import { createLogger } from '@/shared/logger/logger';

const logger = createLogger('analytics-insights');

// ============================================================================
// TYPES
// ============================================================================

/** Periods analytics processing computes insights for */
export type InsightsTimeRange = '24h' | '7d' | '30d';

export type InsightsStatus =
  /** Computed; `insights` may still be empty when nothing needs attention */
  | 'ready'
  /** Processing ran but there was no activity in the period */
  | 'no_data'
  /** Processing has not run for this experience and period yet */
  | 'not_processed'
  /** The analytics database isn't configured or couldn't be read */
  | 'unavailable';

export interface ProactiveInsightsResult {
  status: InsightsStatus;
  timeRange: InsightsTimeRange;
  /** When the insights were computed (ISO), or null when they never were */
  processedAt: string | null;
  /** Findings to show: computed, and not hidden */
  insights: ProactiveInsight[];
  /** Findings an admin hid, with when they come back */
  hidden: Array<ProactiveInsight & { hiddenUntil: string }>;
}

/** Stored insight types the analytics pages read (written by analytics processing) */
export const READABLE_INSIGHT_TYPES = [
  'proactive_insights',
  'ai_effectiveness',
  'guardrail_analytics',
  'intent_clusters',
  'cost_analysis',
] as const;
export type ReadableInsightType = (typeof READABLE_INSIGHT_TYPES)[number];

export interface StoredInsightResult {
  status: InsightsStatus;
  timeRange: InsightsTimeRange;
  processedAt: string | null;
  /** The computed result, shaped by its type; null unless status is 'ready' */
  data: Record<string, unknown> | null;
}

// ============================================================================
// QUERIES
// ============================================================================

/**
 * One stored insight for an experience, or for all experiences combined when
 * `experienceId` is omitted.
 */
export async function getStoredInsight(
  insightType: ReadableInsightType,
  timeRange: InsightsTimeRange,
  experienceId?: string
): Promise<StoredInsightResult> {
  const empty = { timeRange, processedAt: null, data: null };

  try {
    const { analyticsDB } = await import('@/db/index');
    if (!analyticsDB) return { status: 'unavailable', ...empty };

    const { analyticsInsights } = await import('@/db/analytics-schema');
    const [row] = await analyticsDB
      .select({ data: analyticsInsights.data, processedAt: analyticsInsights.processedAt })
      .from(analyticsInsights)
      .where(
        and(
          experienceId
            ? eq(analyticsInsights.experienceId, experienceId)
            : sql`${analyticsInsights.experienceId} IS NULL`,
          eq(analyticsInsights.insightType, insightType),
          eq(analyticsInsights.timeRange, timeRange)
        )
      )
      .limit(1);

    if (!row) return { status: 'not_processed', ...empty };

    const processedAt = row.processedAt.toISOString();
    const data = row.data as Record<string, unknown> & { empty?: boolean };
    if (data.empty) return { status: 'no_data', timeRange, processedAt, data: null };

    return { status: 'ready', timeRange, processedAt, data: forDisplay(insightType, data) };
  } catch (error) {
    logger.error('Failed to read stored insight', error as Error, { insightType, experienceId, timeRange });
    return { status: 'unavailable', ...empty };
  }
}

/**
 * Proactive insights ("What needs attention") for one experience, or for all
 * experiences combined when `experienceId` is omitted.
 */
export async function getProactiveInsights(
  timeRange: InsightsTimeRange,
  experienceId?: string
): Promise<ProactiveInsightsResult> {
  const { status, processedAt, data } = await getStoredInsight('proactive_insights', timeRange, experienceId);
  const hiddenUntil = await readHiddenFindings(experienceId);
  const all = (data?.insights as ProactiveInsight[] | undefined) ?? [];
  return {
    status,
    timeRange,
    processedAt,
    insights: all.filter((i) => !hiddenUntil.has(i.id)),
    hidden: all.filter((i) => hiddenUntil.has(i.id)).map((i) => ({ ...i, hiddenUntil: hiddenUntil.get(i.id)! })),
  };
}

// ============================================================================
// HIDDEN FINDINGS
// ============================================================================

const scopeOf = (experienceId?: string) => experienceId ?? 'all';

/** Findings hidden for this scope right now: finding id → when it comes back (ISO) */
async function readHiddenFindings(experienceId?: string): Promise<Map<string, string>> {
  const { analyticsDB } = await import('@/db/index');
  if (!analyticsDB) return new Map();
  const { analyticsHiddenFindings } = await import('@/db/analytics-schema');
  try {
    const rows = await analyticsDB
      .select({ findingId: analyticsHiddenFindings.findingId, hiddenUntil: analyticsHiddenFindings.hiddenUntil })
      .from(analyticsHiddenFindings)
      .where(and(eq(analyticsHiddenFindings.scope, scopeOf(experienceId)), gt(analyticsHiddenFindings.hiddenUntil, new Date())));
    return new Map(rows.map((r) => [r.findingId, r.hiddenUntil.toISOString()]));
  } catch (error) {
    // Showing a hidden finding again is better than showing none
    logger.error('Failed to read hidden findings', error as Error, { experienceId });
    return new Map();
  }
}

/** Hide a finding for this scope for `days` days (from now, replacing any earlier hide) */
export async function hideFinding(findingId: string, experienceId: string | undefined, days: number): Promise<Date> {
  const { analyticsDB } = await import('@/db/index');
  if (!analyticsDB) throw new Error('Analytics database is not configured');
  const { analyticsHiddenFindings } = await import('@/db/analytics-schema');
  const hiddenUntil = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  await analyticsDB
    .insert(analyticsHiddenFindings)
    .values({ scope: scopeOf(experienceId), findingId, hiddenUntil })
    .onConflictDoUpdate({
      target: [analyticsHiddenFindings.scope, analyticsHiddenFindings.findingId],
      set: { hiddenUntil, hiddenAt: new Date() },
    });
  return hiddenUntil;
}

/** Show a hidden finding again */
export async function unhideFinding(findingId: string, experienceId?: string): Promise<void> {
  const { analyticsDB } = await import('@/db/index');
  if (!analyticsDB) throw new Error('Analytics database is not configured');
  const { analyticsHiddenFindings } = await import('@/db/analytics-schema');
  await analyticsDB
    .delete(analyticsHiddenFindings)
    .where(and(eq(analyticsHiddenFindings.scope, scopeOf(experienceId)), eq(analyticsHiddenFindings.findingId, findingId)));
}

/**
 * Intent clusters keep sample visitor messages and queries for the analytics
 * chat. The pages only show what each cluster is and how it went, so the
 * visitor text is left out of what they receive.
 */
function forDisplay(insightType: ReadableInsightType, data: Record<string, unknown>): Record<string, unknown> {
  if (insightType !== 'intent_clusters') return data;
  const clusters = (data.clusters as Array<Record<string, unknown>> | undefined) ?? [];
  return {
    totalIntents: data.totalIntents,
    uniqueIntents: data.uniqueIntents,
    clusters: clusters.map((c) => ({ label: c.label, count: c.count, avgOutcomeSuccess: c.avgOutcomeSuccess })),
  };
}

/**
 * Experiences with any recorded activity (chat traces or searches) in the last
 * `days` days. Scheduled insight processing covers these, so idle experiences
 * don't cost a processing run every night.
 */
export async function listRecentlyActiveExperienceIds(days = 30): Promise<string[]> {
  const { analyticsDB } = await import('@/db/index');
  if (!analyticsDB) return [];

  const { otelSpans, searchEvents } = await import('@/db/analytics-schema');
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const [spanRows, searchRows] = await Promise.all([
    analyticsDB
      .selectDistinct({ experienceId: otelSpans.experienceId })
      .from(otelSpans)
      .where(and(isNotNull(otelSpans.experienceId), gte(otelSpans.startTime, since))),
    analyticsDB
      .selectDistinct({ experienceId: searchEvents.experienceId })
      .from(searchEvents)
      .where(and(isNotNull(searchEvents.experienceId), gte(searchEvents.timestamp, since))),
  ]);

  return [...new Set([...spanRows, ...searchRows].map((r) => r.experienceId).filter((id): id is string => !!id))];
}
