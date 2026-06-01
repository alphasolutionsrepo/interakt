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

export async function executeAnalyticsTools(
  plan: AnalyticsTurnPlan,
  experienceId: string | null,
  emit: SSEEmitter
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

      // Build params from hints + inject experienceId
      const params: Record<string, unknown> = { ...action.hints };
      if (experienceId && !params.experienceId) {
        params.experienceId = experienceId;
      }
      // Set default timeRange if not specified
      if (!params.timeRange) {
        params.timeRange = '7d';
      }

      // Emit tool start
      emit({ type: 'tool_start', tool: action.toolSlug, input: params });

      // Execute
      const result = await executeAnalyticsTool(action.toolSlug, params);

      // Emit tool data for frontend rendering
      if (result.success && result.rawData && result.dataType) {
        emit({
          type: 'tool_data',
          tool: action.toolSlug,
          dataType: result.dataType,
          data: result.rawData,
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
