// src/features/analytics/analytics-failed-turns.service.ts

/**
 * Conversation turns that went wrong: the turn errored, or it finished without
 * a successful outcome (e.g. the plan failed). Read from the per-turn spans, so
 * each comes with its trace id, which opens the full conversation in Traces or
 * through the chat's conversation-detail tool. No message text is returned.
 */

import 'server-only';

import { and, desc, eq, gte, lte, or, sql } from 'drizzle-orm';

import { fetchExperienceNames } from './analytics-experience-summary.service';
import type { DateRange } from './analytics-query.service';

export interface FailedTurn {
  traceId: string;
  sessionId: string | null;
  at: string;
  experienceId: string | null;
  /** Name at the time of asking; null when the experience is gone or unknown */
  experienceName: string | null;
  /** The pipeline's outcome, e.g. "plan_failed"; null when the turn errored before recording one */
  outcome: string | null;
  /** The error, when the turn errored */
  error: string | null;
  durationMs: number;
}

export interface FailedTurnsResult {
  /** All turns in the period, failed or not */
  totalTurns: number;
  failedTurns: number;
  /** Count per reason: an outcome, or "error" */
  byReason: Record<string, number>;
  /** The most recent failures, newest first */
  recent: FailedTurn[];
}

/** Conversation turns and failed turns per day, days starting at midnight in `timeZone`; days without turns are left out */
export async function getTurnsByDay(
  range: DateRange,
  timeZone: string,
  experienceId?: string,
): Promise<Array<{ day: Date; turns: number; failed: number }>> {
  const { analyticsDB } = await import('@/db/index');
  if (!analyticsDB) return [];
  const { otelSpans } = await import('@/db/analytics-schema');

  const outcome = sql`${otelSpans.attributes}->>'alpha.v2.outcome'`;
  const day = sql<Date>`date_trunc('day', ${otelSpans.startTime} AT TIME ZONE ${timeZone}) AT TIME ZONE ${timeZone}`;
  const rows = await analyticsDB
    .select({
      day: sql<Date>`${day} AS turn_day`,
      turns: sql<number>`COUNT(*)::int`,
      failed: sql<number>`COUNT(*) FILTER (WHERE ${otelSpans.statusCode} = 'ERROR' OR COALESCE(${outcome}, '') <> 'success')::int`,
    })
    .from(otelSpans)
    .where(
      and(
        eq(otelSpans.operationName, 'pipeline.v2.turn'),
        gte(otelSpans.startTime, range.from),
        lte(otelSpans.startTime, range.to),
        experienceId ? eq(otelSpans.experienceId, experienceId) : undefined,
      ),
    )
    // Grouped by the alias: the same expression written twice would bind the time zone twice
    .groupBy(sql.raw('turn_day'))
    .orderBy(sql.raw('turn_day'));

  return rows.map((r) => ({ day: new Date(r.day), turns: r.turns, failed: r.failed }));
}

/** Chat turns and search requests that started in the last `minutes` minutes */
export async function countRecentRequests(minutes = 5): Promise<number> {
  const { analyticsDB } = await import('@/db/index');
  if (!analyticsDB) return 0;
  const { otelSpans } = await import('@/db/analytics-schema');
  const [row] = await analyticsDB
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(otelSpans)
    .where(
      and(
        gte(otelSpans.startTime, new Date(Date.now() - minutes * 60_000)),
        or(sql`${otelSpans.operationName} LIKE 'chat.%'`, sql`${otelSpans.operationName} LIKE 'search_experience.%'`),
      ),
    );
  return row?.count ?? 0;
}

export async function getFailedTurns(range: DateRange, experienceId?: string, limit = 20): Promise<FailedTurnsResult> {
  const empty: FailedTurnsResult = { totalTurns: 0, failedTurns: 0, byReason: {}, recent: [] };
  const { analyticsDB } = await import('@/db/index');
  if (!analyticsDB) return empty;
  const { otelSpans } = await import('@/db/analytics-schema');

  const outcome = sql<string | null>`${otelSpans.attributes}->>'alpha.v2.outcome'`;
  const inScope = and(
    eq(otelSpans.operationName, 'pipeline.v2.turn'),
    gte(otelSpans.startTime, range.from),
    lte(otelSpans.startTime, range.to),
    experienceId ? eq(otelSpans.experienceId, experienceId) : undefined,
  );
  const failed = or(eq(otelSpans.statusCode, 'ERROR'), sql`COALESCE(${outcome}, '') <> 'success'`);

  const [totals, reasons, rows] = await Promise.all([
    analyticsDB
      .select({
        total: sql<number>`COUNT(*)::int`,
        failed: sql<number>`COUNT(*) FILTER (WHERE ${failed})::int`,
      })
      .from(otelSpans)
      .where(inScope),
    analyticsDB
      .select({
        // An errored turn counts as "error" even if it recorded an outcome first
        reason: sql<string>`CASE WHEN ${otelSpans.statusCode} = 'ERROR' THEN 'error' ELSE COALESCE(${outcome}, 'unknown') END`,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(otelSpans)
      .where(and(inScope, failed))
      .groupBy(sql`1`),
    analyticsDB
      .select({
        traceId: otelSpans.traceId,
        sessionId: sql<string | null>`COALESCE(${otelSpans.sessionId}, ${otelSpans.attributes}->>'alpha.session.id')`,
        startTime: otelSpans.startTime,
        experienceId: otelSpans.experienceId,
        outcome,
        statusCode: otelSpans.statusCode,
        statusMessage: otelSpans.statusMessage,
        durationMs: otelSpans.durationMs,
      })
      .from(otelSpans)
      .where(and(inScope, failed))
      .orderBy(desc(otelSpans.startTime))
      .limit(limit),
  ]);

  const names = await fetchExperienceNames([...new Set(rows.map((r) => r.experienceId).filter((id): id is string => !!id))]);

  return {
    totalTurns: totals[0]?.total ?? 0,
    failedTurns: totals[0]?.failed ?? 0,
    byReason: Object.fromEntries(reasons.map((r) => [r.reason, r.count])),
    recent: rows.map((r) => ({
      traceId: r.traceId,
      sessionId: r.sessionId,
      at: r.startTime.toISOString(),
      experienceId: r.experienceId,
      experienceName: r.experienceId ? names.get(r.experienceId)?.name ?? null : null,
      outcome: r.outcome,
      error: r.statusCode === 'ERROR' ? r.statusMessage ?? 'Unknown error' : null,
      durationMs: r.durationMs,
    })),
  };
}
