// src/features/pipeline/v2/action-steps/filter-validation.step.ts

/**
 * Filter Validation Step — validates extracted filter values against known constraints.
 *
 * Only runs when:
 * 1. The enricher returned enriched=true (we have field constraints with valid values)
 * 2. The extracted params contain a filters array
 *
 * When not applicable, passes extractedParams through as validatedParams unchanged.
 *
 * Only used for data_source:search tools (other tool types skip this step
 * via the chain factory).
 */

import { createLogger } from '@/shared/logger/logger';
import { validateFilters } from '../param-validation';
import type { ActionStep, ActionStepContext, ActionStepDeps, ActionStepResult } from './action-step.types';

const logger = createLogger('v2:step:filter-validation');

export class FilterValidationStep implements ActionStep {
  readonly id = 'filter_validation' as const;
  readonly name = 'Filter validation';

  async execute(ctx: ActionStepContext, _deps: ActionStepDeps): Promise<ActionStepResult> {
    const start = Date.now();

    const params = ctx.extractedParams;
    if (!params) {
      return {
        success: true,
        context: { ...ctx, validatedParams: null },
        summary: 'No parameters to validate',
        durationMs: Date.now() - start,
      };
    }

    // Pass through if no filters extracted
    if (!Array.isArray(params.filters) || params.filters.length === 0) {
      return {
        success: true,
        context: { ...ctx, validatedParams: params },
        summary: 'No filters to validate',
        durationMs: Date.now() - start,
      };
    }

    // Pass through if enricher has no field constraints at all (non-search tool or no schema)
    const hasConstraints = Object.keys(ctx.paramContext.fieldConstraints).length > 0;
    if (!hasConstraints) {
      return {
        success: true,
        context: { ...ctx, validatedParams: params },
        summary: 'No field constraints available for validation',
        durationMs: Date.now() - start,
      };
    }

    const filterResult = validateFilters(
      params.filters as Array<{ field: string; operator: string; value: unknown }>,
      ctx.paramContext,
    );

    const durationMs = Date.now() - start;

    if (filterResult.hasCorrections) {
      const validatedParams = { ...params, filters: filterResult.filters };

      logger.info('Filter validation applied corrections', {
        toolSlug: ctx.action.toolSlug,
        dropped: filterResult.droppedFilters.length,
        summary: filterResult.summary,
      });

      return {
        success: true,
        context: { ...ctx, validatedParams },
        summary: filterResult.summary,
        durationMs,
      };
    }

    return {
      success: true,
      context: { ...ctx, validatedParams: params },
      summary: filterResult.summary,
      durationMs,
    };
  }
}
