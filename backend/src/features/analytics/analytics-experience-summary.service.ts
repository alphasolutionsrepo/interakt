// src/features/analytics/analytics-experience-summary.service.ts

/**
 * Experience Summary Service
 *
 * Queries OTel spans grouped by experience_id to produce
 * per-experience analytics summaries for the comparison table.
 */

import 'server-only';

import { sql, count, eq, gte, lte, and, isNotNull } from 'drizzle-orm';
import { createLogger } from '@/shared/logger/logger';
import { getDateRange, type TimeRange } from './analytics-query.service';

const logger = createLogger('analytics-experience-summary');

// ============================================================================
// TYPES
// ============================================================================

export interface ExperienceSummary {
  id: string;
  name: string;
  type: 'ai' | 'search';
  totalConversations: number;
  successRate: number;
  zeroResultRate: number;
  avgLatencyMs: number;
}

// ============================================================================
// MAIN QUERY
// ============================================================================

export async function getExperienceSummaries(
  timeRange: TimeRange
): Promise<ExperienceSummary[]> {
  const { analyticsDB } = await import('@/db/index');
  const { otelSpans } = await import('@/db/analytics-schema');

  if (!analyticsDB) return [];

  const range = getDateRange(timeRange);

  try {
    const { searchEvents } = await import('@/db/analytics-schema');

    // ── AI experiences: query pipeline.v2.turn OTel spans ──────────────
    const turnRows = await analyticsDB
      .select({
        experienceId: otelSpans.experienceId,
        experienceType: otelSpans.experienceType,
        totalConversations: sql<number>`COUNT(DISTINCT ${otelSpans.traceId})::int`,
        totalTurns: sql<number>`COUNT(*)::int`,
        successCount: sql<number>`COUNT(CASE WHEN ${otelSpans.attributes}->>'alpha.v2.outcome' = 'success' THEN 1 END)::int`,
        avgDurationMs: sql<number>`COALESCE(AVG(${otelSpans.durationMs}), 0)::int`,
      })
      .from(otelSpans)
      .where(
        and(
          eq(otelSpans.operationName, 'pipeline.v2.turn'),
          gte(otelSpans.startTime, range.from),
          lte(otelSpans.startTime, range.to),
          isNotNull(otelSpans.experienceId),
        )
      )
      .groupBy(otelSpans.experienceId, otelSpans.experienceType);

    // AI experience zero-result rates from tool.execute spans
    const toolRows = await analyticsDB
      .select({
        experienceId: otelSpans.experienceId,
        totalSearches: sql<number>`COUNT(*)::int`,
        zeroResults: sql<number>`COUNT(CASE WHEN (${otelSpans.attributes}->>'alpha.tool.result_count')::int = 0 THEN 1 END)::int`,
      })
      .from(otelSpans)
      .where(
        and(
          eq(otelSpans.operationName, 'tool.execute'),
          gte(otelSpans.startTime, range.from),
          lte(otelSpans.startTime, range.to),
          isNotNull(otelSpans.experienceId),
        )
      )
      .groupBy(otelSpans.experienceId);

    const zeroResultMap = new Map<string, { total: number; zero: number }>();
    for (const row of toolRows) {
      if (row.experienceId) {
        zeroResultMap.set(row.experienceId, {
          total: row.totalSearches,
          zero: row.zeroResults,
        });
      }
    }

    // ── Search experiences: query searchEvents table ───────────────────
    const searchRows = await analyticsDB
      .select({
        experienceId: searchEvents.experienceId,
        totalSearches: count(),
        zeroResults: sql<number>`COUNT(CASE WHEN ${searchEvents.isZeroResult} = true THEN 1 END)::int`,
        avgDurationMs: sql<number>`COALESCE(AVG(${searchEvents.durationMs}), 0)::int`,
        totalSessions: sql<number>`COUNT(DISTINCT ${searchEvents.sessionId})::int`,
      })
      .from(searchEvents)
      .where(
        and(
          eq(searchEvents.triggerType, 'user'),
          gte(searchEvents.timestamp, range.from),
          lte(searchEvents.timestamp, range.to),
          isNotNull(searchEvents.experienceId),
        )
      )
      .groupBy(searchEvents.experienceId);

    // Collect all experience IDs for name lookup
    const aiExperienceIds = turnRows.map((r) => r.experienceId).filter(Boolean) as string[];
    const searchExperienceIds = searchRows
      .map((r) => r.experienceId)
      .filter((id): id is string => id != null && !aiExperienceIds.includes(id));
    const allExperienceIds = [...aiExperienceIds, ...searchExperienceIds];

    const experienceNames = await fetchExperienceNames(allExperienceIds);

    // ── Build AI summaries ────────────────────────────────────────────
    const summaries: ExperienceSummary[] = [];

    for (const row of turnRows) {
      if (!row.experienceId) continue;

      const nameInfo = experienceNames.get(row.experienceId);
      const zeroInfo = zeroResultMap.get(row.experienceId);

      summaries.push({
        id: row.experienceId,
        name: nameInfo?.name || row.experienceId.slice(0, 8),
        type: (row.experienceType as 'ai' | 'search') || nameInfo?.type || 'ai',
        totalConversations: row.totalConversations,
        successRate: row.totalTurns > 0 ? row.successCount / row.totalTurns : 0,
        zeroResultRate: zeroInfo && zeroInfo.total > 0 ? zeroInfo.zero / zeroInfo.total : 0,
        avgLatencyMs: row.avgDurationMs,
      });
    }

    // ── Build search experience summaries ─────────────────────────────
    const aiIds = new Set(summaries.map((s) => s.id));

    for (const row of searchRows) {
      if (!row.experienceId || aiIds.has(row.experienceId)) continue;

      const nameInfo = experienceNames.get(row.experienceId);

      summaries.push({
        id: row.experienceId,
        name: nameInfo?.name || row.experienceId.slice(0, 8),
        type: 'search',
        totalConversations: row.totalSessions,
        successRate: row.totalSearches > 0
          ? (row.totalSearches - row.zeroResults) / row.totalSearches
          : 0,
        zeroResultRate: row.totalSearches > 0
          ? row.zeroResults / row.totalSearches
          : 0,
        avgLatencyMs: row.avgDurationMs,
      });
    }

    // Sort by total conversations descending
    summaries.sort((a, b) => b.totalConversations - a.totalConversations);

    return summaries;
  } catch (error) {
    logger.error('Failed to get experience summaries', { error });
    return [];
  }
}

// ============================================================================
// EXPERIENCE NAME LOOKUP
// ============================================================================

async function fetchExperienceNames(
  experienceIds: string[]
): Promise<Map<string, { name: string; type: 'ai' | 'search' }>> {
  const nameMap = new Map<string, { name: string; type: 'ai' | 'search' }>();
  if (experienceIds.length === 0) return nameMap;

  try {
    // Try AI experiences
    const { db } = await import('@/db/index');
    const { aiExperiences } = await import('@/db/schema');
    const { inArray } = await import('drizzle-orm');

    const aiRows = await db
      .select({ id: aiExperiences.id, name: aiExperiences.name })
      .from(aiExperiences)
      .where(inArray(aiExperiences.id, experienceIds));

    for (const row of aiRows) {
      nameMap.set(row.id, { name: row.name, type: 'ai' });
    }

    // Try search experiences for any remaining
    const remaining = experienceIds.filter((id) => !nameMap.has(id));
    if (remaining.length > 0) {
      const { searchExperiences } = await import('@/db/schema');
      const searchRows = await db
        .select({ id: searchExperiences.id, name: searchExperiences.name })
        .from(searchExperiences)
        .where(inArray(searchExperiences.id, remaining));

      for (const row of searchRows) {
        nameMap.set(row.id, { name: row.name, type: 'search' });
      }
    }
  } catch (error) {
    logger.warn('Failed to fetch experience names (non-fatal)', { error });
  }

  return nameMap;
}
