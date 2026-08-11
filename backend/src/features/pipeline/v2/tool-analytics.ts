// src/features/pipeline/v2/tool-analytics.ts

/**
 * Tool-execution analytics for the chat pipeline.
 *
 * `trackToolExecution` has existed in the analytics collector — with a config
 * flag, a queue, and a rollup table behind it — but nothing ever called it, so
 * tool-usage analytics were always empty. The old step-based engine didn't call
 * it either, so this is a long-standing gap rather than a regression from the
 * pipeline consolidation.
 *
 * Implemented as a wrapper around ToolExecutorFn rather than a call inside a
 * step, for one reason: `ZeroResultRetryStep` re-executes the tool up to three
 * more times with progressively relaxed filters. Those are real tool
 * executions. Tracking inside `ToolExecutionStep` would miss them, and adding
 * calls to both steps would leave the next caller to remember. Wrapping the one
 * function every execution passes through cannot be bypassed.
 *
 * This mirrors how the orchestrator already wraps `chat` with `trackUsage` to
 * accumulate token usage.
 */

import { createLogger } from '@/shared/logger/logger';
import type { ToolExecutorFn } from './execution-loop';
import type { TurnContext, ToolDefinitionV2 } from './v2.types';

const logger = createLogger('v2:tool-analytics');

/**
 * Map an executor type to the analytics tool category.
 *
 * `retrieval` covers anything that reads data to answer a question; `action`
 * covers tools with side effects. Data-source and web-search tools are reads by
 * definition. HTTP and MCP tools could be either, and the platform has no
 * declaration of intent for them yet, so they are classified conservatively as
 * `action` — over-reporting a read as an action is less misleading than the
 * reverse when someone is auditing what the assistant *did*.
 */
export function toolCategoryFor(executorType: string | undefined): 'retrieval' | 'action' | 'navigation' {
  switch (executorType) {
    case 'data_source':
    case 'web_search':
    case 'ai_call':
      return 'retrieval';
    default:
      return 'action';
  }
}

/**
 * Summarize tool input for analytics without dragging the whole payload in.
 *
 * Records the *shape* of the call — which keys were passed, the query text, how
 * many filters — rather than full values. Enough to answer "what is this tool
 * actually being asked for", without copying customer data into an analytics
 * table that has its own retention policy.
 */
export function summariseInput(parameters: Record<string, unknown>): Record<string, unknown> {
  const summary: Record<string, unknown> = { paramKeys: Object.keys(parameters) };

  if (typeof parameters.query === 'string') {
    summary.query = parameters.query;
  }
  if (Array.isArray(parameters.filters)) {
    summary.filterCount = parameters.filters.length;
    summary.filterFields = parameters.filters
      .map((f) => (f as { field?: unknown })?.field)
      .filter((f): f is string => typeof f === 'string');
  }
  if (typeof parameters.field === 'string') {
    summary.field = parameters.field;
  }

  return summary;
}

/**
 * Wrap a tool executor so every execution is recorded.
 *
 * Tracking is fire-and-forget: a failure in analytics must never change the
 * outcome of a tool call, so errors are swallowed at debug level.
 */
export function withToolAnalytics(
  executeTool: ToolExecutorFn,
  turnContext: TurnContext,
  /** Correlates every execution in a turn, and links analytics rows to the trace. */
  turnRequestId: string,
): ToolExecutorFn {
  const toolDefBySlug = new Map<string, ToolDefinitionV2>(
    turnContext.toolDefinitions.map((t) => [t.slug, t]),
  );

  return async (toolId, toolSlug, parameters) => {
    const start = Date.now();
    let result: Awaited<ReturnType<ToolExecutorFn>> | undefined;
    let thrown: unknown;

    try {
      result = await executeTool(toolId, toolSlug, parameters);
      return result;
    } catch (error) {
      thrown = error;
      throw error;
    } finally {
      // Record whichever happened — a thrown executor is still a tool execution
      // that consumed time and produced no answer, which is exactly what a
      // reliability view needs to show.
      try {
        const { trackToolExecution } = await import('@/features/analytics');
        const durationMs = Date.now() - start;
        const toolDef = toolDefBySlug.get(toolSlug);
        const errorMessage = thrown
          ? (thrown instanceof Error ? thrown.message : String(thrown))
          : result?.error;

        trackToolExecution({
          aiRequestId: turnRequestId,
          sessionId: turnContext.sessionId,
          toolName: toolSlug,
          toolCategory: toolCategoryFor(toolDef?.executorType),
          inputSummary: summariseInput(parameters),
          outputSummary: {
            resultCount: result?.resultCount ?? 0,
            ...(result?.success === false || thrown ? { failed: true } : {}),
          },
          durationMs,
          success: !thrown && result?.success === true,
          ...(errorMessage ? { errorMessage } : {}),
          metadata: {
            experienceId: turnContext.experienceId,
            executorType: toolDef?.executorType ?? 'unknown',
            ...(toolDef?.operation ? { operation: toolDef.operation } : {}),
          },
        });
      } catch (error) {
        logger.debug('Tool analytics tracking skipped', {
          toolSlug,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }
  };
}
