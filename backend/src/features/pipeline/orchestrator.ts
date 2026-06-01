import { createLogger } from '@/shared/logger/logger';
import { withSpan } from '@/features/telemetry/tracing-utils';
import { ATTR } from '@/features/telemetry';
import { requireStepHandler } from './step-registry';
import type {
  PipelineConfig,
  PipelineContext,
  PipelineStep,
  StepCondition,
  StepResult,
} from './pipeline.types';

// ============================================================================
// PIPELINE ORCHESTRATOR
// ============================================================================

const logger = createLogger('pipeline:orchestrator');

/**
 * Execute a full pipeline: iterate steps in order, evaluate conditions,
 * handle failures, emit streaming events, and enforce timeouts.
 *
 * Returns the mutated context after all steps have run (or the pipeline was aborted).
 */
export async function executePipeline(
  config: PipelineConfig,
  ctx: PipelineContext,
): Promise<PipelineContext> {
  const { settings } = config;
  const steps = getEnabledSteps(config.steps);

  logger.info('Pipeline execution starting', {
    experienceId: ctx.experienceId, mode: config.mode, stepCount: steps.length,
  });

  const pipelineStart = Date.now();

  await withSpan(
    {
      name: 'pipeline.execute',
      experienceId: ctx.experienceId,
      attributes: {
        [ATTR.EXPERIENCE_ID]: ctx.experienceId,
        'pipeline.mode': config.mode,
        'pipeline.step_count': steps.length,
      },
    },
    async (pipelineSpan) => {
      for (const step of steps) {
        if (ctx.aborted) {
          logger.info('Pipeline aborted, skipping remaining steps', { stepId: step.id });
          break;
        }

        if (isTimedOut(pipelineStart, settings.maxTotalDurationMs)) {
          logger.warn('Pipeline timed out', {
            experienceId: ctx.experienceId, elapsedMs: Date.now() - pipelineStart,
          });
          ctx.emitEvent({ type: 'error', message: 'Pipeline execution timed out' });
          ctx.aborted = true;
          break;
        }

        if (!evaluateConditions(step.conditions, ctx)) {
          logger.debug('Step conditions not met, skipping', { stepId: step.id });
          continue;
        }

        await executeStep(step, ctx, config);
      }

      pipelineSpan.setAttribute('pipeline.duration_ms', Date.now() - pipelineStart);
      pipelineSpan.setAttribute('pipeline.aborted', ctx.aborted);
    },
  );

  logger.info('Pipeline execution complete', {
    experienceId: ctx.experienceId,
    durationMs: Date.now() - pipelineStart,
    aborted: ctx.aborted,
  });

  return ctx;
}

// ============================================================================
// STEP EXECUTION
// ============================================================================

async function executeStep(
  step: PipelineStep,
  ctx: PipelineContext,
  config: PipelineConfig,
): Promise<void> {
  const handler = requireStepHandler(step.type);
  const stepStart = Date.now();
  const failureStrategy = step.onFailure ?? config.settings.onStepFailure;

  ctx.emitEvent({
    type: 'step_start',
    stepId: step.id,
    stepType: step.type,
    stepName: step.name,
  });

  try {
    const result = await withSpan(
      {
        name: `pipeline.step.${step.type}`,
        experienceId: ctx.experienceId,
        attributes: {
          'step.id': step.id,
          'step.type': step.type,
          'step.name': step.name,
          'step.order': step.order,
        },
      },
      (span) => handler.execute(step.config, ctx, span),
    );

    recordStepResult(step, result, ctx, stepStart, 'ok');

    if (result.abort) {
      ctx.aborted = true;
    }
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('Step execution failed', { stepId: step.id, error: err.message });

    await handleStepFailure(step, err, ctx, config, failureStrategy, stepStart);
  }
}

// ============================================================================
// FAILURE HANDLING
// ============================================================================

async function handleStepFailure(
  step: PipelineStep,
  error: Error,
  ctx: PipelineContext,
  config: PipelineConfig,
  strategy: 'abort' | 'skip' | 'fallback',
  stepStart: number,
): Promise<void> {
  switch (strategy) {
    case 'abort':
      ctx.emitEvent({ type: 'error', message: error.message, stepId: step.id });
      recordStepResult(step, { success: false, summary: error.message }, ctx, stepStart, 'error');
      ctx.aborted = true;
      break;

    case 'skip':
      logger.warn('Step failed, skipping per failure strategy', { stepId: step.id });
      recordStepResult(step, { success: false, summary: `Skipped: ${error.message}` }, ctx, stepStart, 'skipped');
      break;

    case 'fallback': {
      const handler = requireStepHandler(step.type);

      if (!handler.fallback) {
        logger.warn('No fallback handler, treating as skip', { stepId: step.id });
        recordStepResult(step, { success: false, summary: `No fallback: ${error.message}` }, ctx, stepStart, 'skipped');
        return;
      }

      try {
        const fallbackResult = await handler.fallback(
          step.fallbackConfig ?? step.config,
          ctx,
          error,
        );
        recordStepResult(step, fallbackResult, ctx, stepStart, 'fallback');

        if (fallbackResult.abort) {
          ctx.aborted = true;
        }
      } catch (fallbackError) {
        const fbErr = fallbackError instanceof Error ? fallbackError : new Error(String(fallbackError));
        logger.error('Fallback also failed, aborting', { stepId: step.id, error: fbErr.message });
        ctx.emitEvent({ type: 'error', message: fbErr.message, stepId: step.id });
        recordStepResult(step, { success: false, summary: `Fallback failed: ${fbErr.message}` }, ctx, stepStart, 'error');
        ctx.aborted = true;
      }
      break;
    }
  }
}

// ============================================================================
// CONDITION EVALUATION
// ============================================================================

/**
 * Evaluate all conditions for a step. Returns true if ALL conditions pass
 * (or if there are no conditions).
 */
function evaluateConditions(
  conditions: StepCondition[] | undefined,
  ctx: PipelineContext,
): boolean {
  if (!conditions || conditions.length === 0) return true;
  return conditions.every((c) => evaluateCondition(c, ctx));
}

function evaluateCondition(condition: StepCondition, ctx: PipelineContext): boolean {
  const value = resolveDotPath(condition.field, ctx as unknown as Record<string, unknown>);

  switch (condition.operator) {
    case 'eq':
      return value === condition.value;
    case 'neq':
      return value !== condition.value;
    case 'gt':
      return typeof value === 'number' && typeof condition.value === 'number' && value > condition.value;
    case 'lt':
      return typeof value === 'number' && typeof condition.value === 'number' && value < condition.value;
    case 'in':
      return Array.isArray(condition.value) && condition.value.includes(value);
    case 'exists':
      return value !== undefined && value !== null;
    default: {
      const _exhaustive: never = condition.operator;
      logger.warn('Unknown condition operator', { operator: String(_exhaustive) });
      return false;
    }
  }
}

/**
 * Resolve a dot-separated path against the pipeline context.
 * e.g. "stepResults.intent_detection.data.action" traverses ctx.stepResults.intent_detection.data.action
 */
function resolveDotPath(path: string, obj: Record<string, unknown>): unknown {
  return path.split('.').reduce<unknown>(
    (current, segment) => {
      if (current !== null && current !== undefined && typeof current === 'object') {
        return (current as Record<string, unknown>)[segment];
      }
      return undefined;
    },
    obj,
  );
}

// ============================================================================
// HELPERS
// ============================================================================

function getEnabledSteps(steps: PipelineStep[]): PipelineStep[] {
  return steps
    .filter((s) => s.enabled)
    .sort((a, b) => a.order - b.order);
}

function isTimedOut(startTime: number, maxDurationMs: number): boolean {
  return Date.now() - startTime > maxDurationMs;
}

function recordStepResult(
  step: PipelineStep,
  result: StepResult,
  ctx: PipelineContext,
  stepStart: number,
  status: 'ok' | 'skipped' | 'fallback' | 'error',
): void {
  const durationMs = Date.now() - stepStart;

  ctx.stepResults[step.id] = result;

  ctx.emitEvent({
    type: 'step_complete',
    stepId: step.id,
    stepType: step.type,
    durationMs,
    status,
  });
}
