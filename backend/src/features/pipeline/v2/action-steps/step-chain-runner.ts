// src/features/pipeline/v2/action-steps/step-chain-runner.ts

/**
 * Step Chain Runner — executes an ordered chain of action steps for a single action.
 *
 * Each step gets:
 * - Its own tracing span (`pipeline.v2.action.<stepId>`)
 * - An action_step event emitted for SSE visibility
 * - The accumulated ActionStepContext from prior steps
 *
 * The chain stops when a step returns skipRemaining=true or success=false.
 */

import { createLogger } from '@/shared/logger/logger';
import { withSpan, ATTR } from '@/features/telemetry';
import type {
  ActionStep,
  ActionStepContext,
  ActionStepDeps,
} from './action-step.types';

const logger = createLogger('v2:step-chain-runner');

// ============================================================================
// CHAIN RESULT
// ============================================================================

export interface StepChainResult {
  /** Final context after all steps ran (or after early exit) */
  finalContext: ActionStepContext;
  /** Whether the chain completed successfully */
  success: boolean;
  /** Total duration across all steps */
  totalDurationMs: number;
  /** Which steps ran (in order) */
  stepsExecuted: string[];
}

// ============================================================================
// RUNNER
// ============================================================================

/**
 * Run a chain of action steps for a single planned action.
 * Each step is wrapped in its own tracing span.
 */
export async function runActionStepChain(
  chain: ActionStep[],
  initialContext: ActionStepContext,
  deps: ActionStepDeps,
  experienceId: string,
): Promise<StepChainResult> {
  const chainStart = Date.now();
  let ctx = initialContext;
  const stepsExecuted: string[] = [];

  for (const step of chain) {
    const result = await withSpan(
      {
        name: `pipeline.v2.action.${step.id}`,
        experienceId,
        attributes: {
          [ATTR.EXPERIENCE_ID]: experienceId,
          'alpha.v2.action_step.id': step.id,
          'alpha.v2.action_step.name': step.name,
          'alpha.v2.action_step.tool': ctx.action.toolSlug,
        },
      },
      async (span) => {
        const stepResult = await step.execute(ctx, deps);

        span.setAttribute('alpha.v2.action_step.success', stepResult.success);
        span.setAttribute('alpha.v2.action_step.summary', stepResult.summary);
        span.setAttribute('alpha.v2.action_step.duration_ms', stepResult.durationMs);

        // Set step-specific detail attributes for trace viewer
        if (stepResult.spanAttributes) {
          for (const [key, value] of Object.entries(stepResult.spanAttributes)) {
            span.setAttribute(key, value);
          }
        }

        return stepResult;
      },
    );

    stepsExecuted.push(step.id);

    // Emit action_step event for SSE + trace viewer visibility
    deps.emit({
      type: 'action_step',
      toolSlug: ctx.action.toolSlug,
      step: step.id,
      durationMs: result.durationMs,
      detail: result.summary,
    });

    ctx = result.context;

    if (result.skipRemaining) {
      logger.info('Step chain early exit — step requested skip', {
        stepId: step.id,
        toolSlug: ctx.action.toolSlug,
        reason: result.summary,
      });
      return {
        finalContext: ctx,
        success: result.success,
        totalDurationMs: Date.now() - chainStart,
        stepsExecuted,
      };
    }

    if (!result.success) {
      logger.warn('Step chain stopped — step failed', {
        stepId: step.id,
        toolSlug: ctx.action.toolSlug,
        reason: result.summary,
      });
      return {
        finalContext: ctx,
        success: false,
        totalDurationMs: Date.now() - chainStart,
        stepsExecuted,
      };
    }
  }

  return {
    finalContext: ctx,
    success: true,
    totalDurationMs: Date.now() - chainStart,
    stepsExecuted,
  };
}
