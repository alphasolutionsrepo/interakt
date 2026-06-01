// src/features/pipeline/v2/action-steps/param-extraction.step.ts

/**
 * Parameter Extraction Step — AI call to extract structured tool parameters.
 *
 * Uses the tool's input schema as strict JSON response format. Includes the
 * retry-on-validation-failure loop (extraction's internal concern, not a
 * separate step — retry re-calls extraction with validation error feedback).
 *
 * Key improvement over the monolithic version:
 * - Uses `sanitizedHints` from the enrichment step (invalid keys removed)
 * - Injects `hintAnnotations` into the prompt so the AI knows what was
 *   attempted and dropped, enabling better query/filter decisions
 */

import { createLogger } from '@/shared/logger/logger';
import { extractParameters } from '../param-extraction';
import { validateParameters } from '../param-validation';
import type { PlannedAction } from '../v2.types';
import type { ActionStep, ActionStepContext, ActionStepDeps, ActionStepResult } from './action-step.types';

const logger = createLogger('v2:step:param-extraction');

export class ParamExtractionStep implements ActionStep {
  readonly id = 'param_extraction' as const;
  readonly name = 'Parameter extraction';

  async execute(ctx: ActionStepContext, deps: ActionStepDeps): Promise<ActionStepResult> {
    const start = Date.now();
    const maxRetries = deps.config.maxRetriesPerAction;

    // Build a modified action with sanitized hints (if enrichment ran)
    const action = buildActionWithSanitizedHints(ctx);

    let validationErrors = undefined;
    const attemptLog: Array<{ attempt: number; errors: string[] }> = [];

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const extractResult = await extractParameters(
        {
          userMessage: ctx.turnContext.userMessage,
          action,
          toolInputSchema: ctx.toolDef.inputSchema,
          resultMemoryIndex: ctx.turnContext.resultMemoryIndex,
          previousActionResults: ctx.previousResults.length > 0 ? ctx.previousResults : undefined,
          validationErrors,
          parameterContext: ctx.paramContext,
          // Pass hint annotations so the extractor prompt can include them
          hintAnnotations: ctx.hintAnnotations.length > 0 ? ctx.hintAnnotations : undefined,
        },
        { chat: deps.chat },
        {
          providerId: ctx.turnContext.providerId ?? undefined,
          modelId: ctx.turnContext.modelId ?? undefined,
        },
      );

      if (!extractResult.success || !extractResult.data) {
        const durationMs = Date.now() - start;
        logger.warn('Extraction call failed', {
          toolSlug: ctx.action.toolSlug,
          attempt,
        });

        return {
          success: false,
          context: ctx,
          summary: `Parameter extraction failed for ${ctx.action.toolSlug}`,
          durationMs,
          skipRemaining: true,
          spanAttributes: {
            'alpha.v2.step.attempts': attempt + 1,
            'alpha.v2.step.extraction_failed': true,
            ...(attemptLog.length > 0 && { 'alpha.v2.step.retry_log': JSON.stringify(attemptLog) }),
          },
        };
      }

      // Validate extracted parameters against tool schema
      const validationResult = validateParameters({
        parameters: extractResult.data.parameters,
        inputSchema: ctx.toolDef.inputSchema,
      });

      if (!validationResult.success || !validationResult.data) {
        const durationMs = Date.now() - start;
        return {
          success: false,
          context: ctx,
          summary: `Parameter validation system error for ${ctx.action.toolSlug}`,
          durationMs,
          skipRemaining: true,
        };
      }

      if (validationResult.data.valid) {
        const durationMs = Date.now() - start;
        const params = validationResult.data.parameters;
        const paramKeys = Object.keys(params);

        // Build rich span attributes for trace viewer
        const spanAttributes: Record<string, string | number | boolean> = {
          'alpha.v2.step.extracted_params': JSON.stringify(params),
          'alpha.v2.step.attempts': attempt + 1,
        };
        // Surface key params individually for quick scanning
        if (typeof params.query === 'string') {
          spanAttributes['alpha.v2.step.query'] = params.query;
        }
        if (params.filters != null) {
          spanAttributes['alpha.v2.step.filters'] = JSON.stringify(params.filters);
        }
        if (params.sort != null) {
          spanAttributes['alpha.v2.step.sort'] = String(params.sort);
        }
        if (ctx.hintAnnotations.length > 0) {
          spanAttributes['alpha.v2.step.hint_annotations'] = JSON.stringify(ctx.hintAnnotations);
        }
        if (attemptLog.length > 0) {
          spanAttributes['alpha.v2.step.retry_log'] = JSON.stringify(attemptLog);
        }

        const retryNote = attempt > 0 ? ` (${attempt + 1} attempts)` : '';
        return {
          success: true,
          context: {
            ...ctx,
            extractedParams: params,
          },
          summary: `Extracted ${paramKeys.length} param(s): ${paramKeys.join(', ')}${retryNote}`,
          durationMs,
          spanAttributes,
        };
      }

      // Validation failed — log attempt details, retry with error feedback
      validationErrors = validationResult.data.errors;
      attemptLog.push({
        attempt: attempt + 1,
        errors: validationErrors.map((e) => `${e.field}: ${e.message}`),
      });
      logger.info('Validation failed, retrying extraction', {
        toolSlug: ctx.action.toolSlug,
        attempt,
        errors: validationErrors.map((e) => e.field),
      });
    }

    // All retries exhausted
    const durationMs = Date.now() - start;
    return {
      success: false,
      context: ctx,
      summary: `Parameter extraction failed after ${maxRetries + 1} attempts for ${ctx.action.toolSlug}`,
      durationMs,
      skipRemaining: true,
      spanAttributes: {
        'alpha.v2.step.attempts': maxRetries + 1,
        'alpha.v2.step.retry_log': JSON.stringify(attemptLog),
      },
    };
  }
}

/**
 * Build a modified PlannedAction with sanitized hints from the enrichment step.
 * If enrichment didn't run (no sanitizedHints), use the original action as-is.
 */
function buildActionWithSanitizedHints(ctx: ActionStepContext): PlannedAction {
  // If sanitized hints are available and differ from original, use them
  if (Object.keys(ctx.sanitizedHints).length > 0 || ctx.hintAnnotations.length > 0) {
    return {
      ...ctx.action,
      hints: ctx.sanitizedHints,
    };
  }
  return ctx.action;
}
