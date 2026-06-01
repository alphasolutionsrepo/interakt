// src/features/pipeline/steps/validation.ts

/**
 * Validation Step (Structured Pipeline)
 *
 * Validates the detected intent against the current conversation state.
 * Ensures the action makes sense given what's available (e.g., can't compare
 * items if there are no results, can't refine if there's no active query).
 *
 * If validation fails, overrides the action to 'clarify' with a reason,
 * so the synthesis step can generate a helpful clarification message.
 */

import type { Span } from '@opentelemetry/api';
import type { StepHandler, PipelineContext, StepResult } from '../pipeline.types';
import type { DetectedIntent, IntentAction } from './intent-detection';
import type { ValidatedConstraint } from './constraint-extraction';

// ============================================================================
// TYPES
// ============================================================================

interface ValidationConfig {
  /** Minimum items required for compare action */
  minCompareItems?: number;
}

interface ValidationResult {
  valid: boolean;
  /** If invalid, the corrected action */
  correctedAction?: IntentAction;
  /** Human-readable reason for the correction */
  reason?: string;
}

// ============================================================================
// STEP HANDLER
// ============================================================================

export const validationHandler: StepHandler = {
  type: 'validation',

  async execute(
    config: Record<string, unknown>,
    ctx: PipelineContext,
    span: Span,
  ): Promise<StepResult> {
    const cfg = config as unknown as ValidationConfig;

    // Find intent from prior step
    const intentData = findIntentData(ctx);
    if (!intentData) {
      return {
        success: true,
        data: { valid: true },
        summary: 'No intent to validate',
      };
    }

    const { intent } = intentData;
    const constraintData = findConstraintData(ctx);
    const validConstraints = constraintData?.validConstraints ?? [];

    // Current state from shared context
    const hasResults = Boolean(ctx.shared.hasResults);
    const resultCount = (ctx.shared.resultCount as number) ?? 0;
    const currentQuery = ctx.shared.currentQuery as string | undefined;

    const result = validateAction(
      intent,
      validConstraints,
      { hasResults, resultCount, currentQuery },
      cfg,
    );

    span.setAttribute('validation.valid', result.valid);
    if (result.correctedAction) {
      span.setAttribute('validation.corrected_to', result.correctedAction);
    }

    if (!result.valid) {
      // Override the intent for downstream steps
      ctx.shared.validationOverride = {
        originalAction: intent.action,
        correctedAction: result.correctedAction,
        reason: result.reason,
      };
    }

    return {
      success: true,
      data: result as unknown as Record<string, unknown>,
      summary: result.valid
        ? `Validated: ${intent.action}`
        : `Corrected ${intent.action} → ${result.correctedAction}: ${result.reason}`,
    };
  },
};

// ============================================================================
// VALIDATION RULES (per action type)
// ============================================================================

function validateAction(
  intent: DetectedIntent,
  constraints: ValidatedConstraint[],
  state: { hasResults: boolean; resultCount: number; currentQuery?: string },
  cfg: ValidationConfig,
): ValidationResult {
  switch (intent.action) {
    case 'search':
      if (!intent.searchQuery?.trim()) {
        return {
          valid: false,
          correctedAction: 'clarify',
          reason: 'Search requires a query. What would you like to search for?',
        };
      }
      return { valid: true };

    case 'refine':
      if (!state.hasResults && !state.currentQuery) {
        // If they provided a query, treat as search instead
        if (intent.searchQuery) {
          return {
            valid: false,
            correctedAction: 'search',
            reason: 'No active results to refine, treating as new search',
          };
        }
        return {
          valid: false,
          correctedAction: 'clarify',
          reason: 'There are no results to refine. Would you like to search for something first?',
        };
      }
      return { valid: true };

    case 'rank':
      if (!state.hasResults) {
        if (intent.searchQuery) {
          return {
            valid: false,
            correctedAction: 'search',
            reason: 'No results to rank, treating as new search',
          };
        }
        return {
          valid: false,
          correctedAction: 'clarify',
          reason: 'There are no results to sort. Would you like to search for something first?',
        };
      }
      return { valid: true };

    case 'compare': {
      const minItems = cfg.minCompareItems ?? 2;
      if (!state.hasResults || state.resultCount < minItems) {
        return {
          valid: false,
          correctedAction: 'clarify',
          reason: `Comparison needs at least ${minItems} items. ${state.hasResults ? 'Not enough results available.' : 'Please search for something first.'}`,
        };
      }
      return { valid: true };
    }

    case 'explain':
      if (!state.hasResults) {
        return {
          valid: false,
          correctedAction: 'clarify',
          reason: 'No items available to explain. Would you like to search for something first?',
        };
      }
      return { valid: true };

    case 'greet':
    case 'clarify':
    case 'knowledge':
      // Always valid
      return { valid: true };

    default:
      return { valid: true };
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function findIntentData(ctx: PipelineContext): { intent: DetectedIntent } | undefined {
  for (const result of Object.values(ctx.stepResults)) {
    if (result.data && 'intent' in result.data) {
      return result.data as { intent: DetectedIntent };
    }
  }
  return undefined;
}

function findConstraintData(ctx: PipelineContext): { validConstraints: ValidatedConstraint[] } | undefined {
  for (const result of Object.values(ctx.stepResults)) {
    if (result.data && 'validConstraints' in result.data) {
      return result.data as { validConstraints: ValidatedConstraint[] };
    }
  }
  return undefined;
}
