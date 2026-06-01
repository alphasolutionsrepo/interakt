// src/features/pipeline/v2/action-steps/tool-execution.step.ts

/**
 * Tool Execution Step — calls the actual tool with validated parameters.
 *
 * Takes validatedParams (or extractedParams if no filter validation ran)
 * and executes the tool. Captures the raw result without any retry logic
 * (that's handled by ZeroResultRetryStep).
 */

import { createLogger } from '@/shared/logger/logger';
import type { ActionStep, ActionStepContext, ActionStepDeps, ActionStepResult } from './action-step.types';

const logger = createLogger('v2:step:tool-execution');

export class ToolExecutionStep implements ActionStep {
  readonly id = 'tool_execution' as const;
  readonly name = 'Tool execution';

  async execute(ctx: ActionStepContext, deps: ActionStepDeps): Promise<ActionStepResult> {
    const start = Date.now();

    const params = ctx.validatedParams ?? ctx.extractedParams;
    if (!params) {
      return {
        success: false,
        context: ctx,
        summary: 'No parameters available for tool execution',
        durationMs: Date.now() - start,
        skipRemaining: true,
      };
    }

    try {
      const toolResult = await deps.executeTool(ctx.toolId, ctx.action.toolSlug, params);
      const durationMs = Date.now() - start;

      logger.info('Tool executed', {
        toolSlug: ctx.action.toolSlug,
        success: toolResult.success,
        resultCount: toolResult.resultCount,
        durationMs,
      });

      // Surface execution details on span
      const spanAttributes: Record<string, string | number | boolean> = {
        'alpha.v2.step.input_params': JSON.stringify(params),
        'alpha.v2.step.result_count': toolResult.resultCount ?? -1,
        'alpha.v2.step.tool_success': toolResult.success,
      };
      if (toolResult.error) {
        spanAttributes['alpha.v2.step.error'] = toolResult.error;
      }

      return {
        success: true,
        context: {
          ...ctx,
          toolResult,
          finalParams: params,
        },
        summary: toolResult.success
          ? `${toolResult.resultCount ?? '?'} result(s) returned`
          : `Tool execution failed: ${toolResult.error ?? 'unknown error'}`,
        durationMs,
        spanAttributes,
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      const durationMs = Date.now() - start;

      logger.error('Tool execution threw', err, { toolSlug: ctx.action.toolSlug });

      return {
        success: true, // Don't stop the chain — let result capture handle the failure
        context: {
          ...ctx,
          toolResult: { success: false, data: null, error: err.message },
          finalParams: params,
        },
        summary: `Tool execution error: ${err.message}`,
        durationMs,
      };
    }
  }
}
