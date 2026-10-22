// src/features/analytics/analytics-experience-summary.service.ts

/**
 * Experience Summary Service
 *
 * Queries OTel spans grouped by experience_id to produce
 * per-experience analytics summaries for the comparison table.
 */

import 'server-only';

import { sql, count, eq, gte, lte, and, isNotNull, type SQL } from 'drizzle-orm';
import { createLogger } from '@/shared/logger/logger';
import { buildSearchConditions, getDateRange, type TimeRange } from './analytics-query.service';

const logger = createLogger('analytics-experience-summary');

// ============================================================================
// TYPES
// ============================================================================

export interface ExperienceSummary {
  id: string;
  name: string;
  type: 'ai' | 'search';
  /** Conversations for AI experiences, searches for search experiences */
  volume: number;
  /** Experience no longer exists in the main database */
  deleted: boolean;
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

    // AI experience zero-result rates from tool execution steps (tool.execute spans
    // carry no experienceId; their pipeline.v2.action.tool_execution parents do)
    const toolRows = await analyticsDB
      .select({
        experienceId: otelSpans.experienceId,
        totalSearches: sql<number>`COUNT(*)::int`,
        zeroResults: sql<number>`COUNT(CASE WHEN (${otelSpans.attributes}->>'alpha.v2.step.result_count')::int = 0 THEN 1 END)::int`,
      })
      .from(otelSpans)
      .where(
        and(
          eq(otelSpans.operationName, 'pipeline.v2.action.tool_execution'),
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
    // Candidates: experiences with tagged events in range, plus search experiences with
    // indexes (whose older untagged events are matched by index)
    const taggedRows = await analyticsDB
      .selectDistinct({ experienceId: searchEvents.experienceId })
      .from(searchEvents)
      .where(
        and(
          eq(searchEvents.source, 'api'),
          gte(searchEvents.timestamp, range.from),
          lte(searchEvents.timestamp, range.to),
          isNotNull(searchEvents.experienceId),
        )
      );
    const aiExperienceIds = turnRows.map((r) => r.experienceId).filter(Boolean) as string[];
    const candidateSearchIds = new Set<string>(
      [...taggedRows.map((r) => r.experienceId), ...(await fetchSearchExperienceIdsWithIndexes())]
        .filter((id): id is string => id != null && !aiExperienceIds.includes(id)),
    );

    // Count each one with the overview's own matching rules so the table and the
    // drill-down always agree. Conditions are built one at a time (each may look up the
    // experience's indexes in the main DB, cached), then the counts run in parallel.
    const searchConditions: Array<{ experienceId: string; conditions: SQL[] }> = [];
    for (const experienceId of candidateSearchIds) {
      const { conditions } = await buildSearchConditions(range, experienceId);
      searchConditions.push({ experienceId, conditions });
    }
    const searchRows = (
      await Promise.all(
        searchConditions.map(async ({ experienceId, conditions }) => {
          const [row] = await analyticsDB
            .select({
              totalSearches: count(),
              zeroResults: sql<number>`COUNT(CASE WHEN ${searchEvents.isZeroResult} = true THEN 1 END)::int`,
              avgDurationMs: sql<number>`COALESCE(AVG(${searchEvents.durationMs}), 0)::int`,
            })
            .from(searchEvents)
            .where(and(...conditions));
          return { experienceId, ...row, totalSearches: Number(row?.totalSearches ?? 0) };
        }),
      )
    ).filter((r) => r.totalSearches > 0);

    // Collect all experience IDs for name lookup
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
        volume: row.totalConversations,
        deleted: !nameInfo,
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
        volume: row.totalSearches,
        deleted: !nameInfo,
        successRate: row.totalSearches > 0
          ? (row.totalSearches - row.zeroResults) / row.totalSearches
          : 0,
        zeroResultRate: row.totalSearches > 0
          ? row.zeroResults / row.totalSearches
          : 0,
        avgLatencyMs: row.avgDurationMs,
      });
    }

    // Sort by volume descending, deleted experiences last
    summaries.sort((a, b) => Number(a.deleted) - Number(b.deleted) || b.volume - a.volume);

    return summaries;
  } catch (error) {
    logger.error('Failed to get experience summaries', { error });
    return [];
  }
}

/** Search experiences that have at least one index attached */
async function fetchSearchExperienceIdsWithIndexes(): Promise<string[]> {
  try {
    const { db } = await import('@/db/index');
    const { searchExperienceIndexes } = await import('@/db/schema');
    const rows = await db
      .selectDistinct({ id: searchExperienceIndexes.searchExperienceId })
      .from(searchExperienceIndexes);
    return rows.map((r) => r.id);
  } catch (error) {
    logger.warn('Failed to fetch search experience indexes (non-fatal)', { error });
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
