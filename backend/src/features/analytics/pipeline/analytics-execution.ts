// src/features/analytics/pipeline/analytics-execution.ts

/**
 * D2: Parallel Tool Execution
 *
 * Executes planned tools in parallel via Promise.all().
 * No AI calls — analytics tools have trivial params (timeRange, experienceId).
 * Emits SSE events for frontend rendering.
 */

import 'server-only';

import { createLogger } from '@/shared/logger/logger';
import { executeAnalyticsTool } from '../analytics-ai-tools';
import { calendarDaysIn, describePeriod, type RequestedPeriod } from '../analytics-period';
import { getDateRange, type TimeRange } from '../analytics-query.service';
import type {
  ModuleResult,
  AnalyticsTurnPlan,
  AnalyticsExecutionResult,
  AnalyticsActionResult,
  SSEEmitter,
} from './analytics-pipeline.types';
import type { AdminChatAnalyticsData } from '@/db/analytics-schema/admin-chat-sessions.schema';

const logger = createLogger('analytics-execution');

// ============================================================================
// MAIN
// ============================================================================

/** The nearest fixed range to a period, for tools that only have those (stored insights) */
function nearestTimeRange(period: RequestedPeriod): string {
  const hours = (period.to.getTime() - period.from.getTime()) / 3_600_000;
  if (hours <= 26) return '24h';
  if (hours <= 8 * 24) return '7d';
  if (hours <= 32 * 24) return '30d';
  return '90d';
}

/**
 * The period one tool call covers: calendar days the planner named in its hints
 * ("Oct 13"), a fixed range it named ("24h"), or else the page's period.
 */
export function resolveToolPeriod(
  hints: Record<string, unknown>,
  pagePeriod: RequestedPeriod | null,
  timeZone: string,
  now: Date = new Date(),
): RequestedPeriod | null {
  if (typeof hints.from === 'string' && typeof hints.to === 'string') {
    try {
      return calendarDaysIn(hints.from, hints.to, timeZone, now);
    } catch (error) {
      logger.warn('Planner gave dates that are not a period; using the page period', { from: hints.from, to: hints.to, error: String(error) });
    }
  }
  if (typeof hints.timeRange === 'string' && hints.timeRange !== 'custom') {
    return getDateRange(hints.timeRange as TimeRange);
  }
  return pagePeriod;
}

export async function executeAnalyticsTools(
  plan: AnalyticsTurnPlan,
  experienceId: string | null,
  defaultTimeRange: string | null,
  emit: SSEEmitter,
  /** The page's exact period and the viewer's time zone, when the page sent them */
  pagePeriod: RequestedPeriod | null = null,
  timeZone: string = 'UTC',
): Promise<ModuleResult<AnalyticsExecutionResult>> {
  const startTime = Date.now();

  if (plan.directResponse || plan.actions.length === 0) {
    return {
      success: true,
      data: { executedActions: [], analyticsData: [] },
      summary: 'No tools to execute (direct response)',
      durationMs: Date.now() - startTime,
    };
  }

  try {
    // Build params for each tool and execute in parallel
    const executions = plan.actions.map(async (action) => {
      const toolStart = Date.now();

      // Build params from hints. The user's experience selection always wins over any
      // experienceId the planner put in its hints.
      const params: Record<string, unknown> = { ...action.hints };
      if (experienceId) {
        params.experienceId = experienceId;
      } else {
        delete params.experienceId;
      }
      // The exact period this call covers, sent as instants; the fixed range stays
      // alongside for tools that only have those
      const period = resolveToolPeriod(action.hints, pagePeriod, timeZone);
      delete params.from;
      delete params.to;
      if (period) {
        params.from = period.from.toISOString();
        params.to = period.to.toISOString();
        params.timeZone = timeZone;
        params.timeRange = nearestTimeRange(period);
      } else if (!params.timeRange) {
        // Default to the range selected on the page
        params.timeRange = defaultTimeRange ?? '7d';
      }

      // Emit tool start
      emit({ type: 'tool_start', tool: action.toolSlug, input: params });

      // Execute
      const result = await executeAnalyticsTool(action.toolSlug, params);
      // What the card says it covers: the exact period when the tool read one
      const periodLabel = result.period
        ? describePeriod({ from: new Date(result.period.from), to: new Date(result.period.to) }, timeZone)
        : result.timeRange
          ? `Last ${result.timeRange.replace('h', ' hours').replace('d', ' days')}`
          : undefined;

      // Emit tool data for frontend rendering
      if (result.success && result.rawData && result.dataType) {
        emit({
          type: 'tool_data',
          tool: action.toolSlug,
          dataType: result.dataType,
          data: result.rawData,
          periodLabel,
        });
      }

      // Emit tool result
      emit({
        type: 'tool_result',
        tool: action.toolSlug,
        success: result.success,
        hasData: result.success && !!result.data,
      });

      return {
        toolSlug: action.toolSlug,
        intent: action.intent,
        parameters: params,
        result,
        periodLabel,
        durationMs: Date.now() - toolStart,
      } satisfies AnalyticsActionResult;
    });

    // Execute all in parallel
    const executedActions = await Promise.all(executions);

    // Collect analytics data for session storage
    const analyticsData: AdminChatAnalyticsData[] = executedActions
      .filter((a) => a.result.success && a.result.rawData && a.result.dataType)
      .map((a) => ({
        tool: a.toolSlug,
        dataType: a.result.dataType!,
        data: a.result.rawData,
        periodLabel: a.periodLabel,
      }));

    const successCount = executedActions.filter((a) => a.result.success).length;

    logger.info('Tools executed', {
      total: executedActions.length,
      success: successCount,
      tools: executedActions.map((a) => a.toolSlug),
    });

    return {
      success: true,
      data: { executedActions, analyticsData },
      summary: `Executed ${successCount}/${executedActions.length} tools in parallel`,
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    logger.error('Execution failed', { error });
    return {
      success: false,
      summary: `Execution failed: ${error instanceof Error ? error.message : 'Unknown'}`,
      durationMs: Date.now() - startTime,
    };
  }
}
