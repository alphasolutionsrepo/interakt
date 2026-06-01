// src/features/pipeline/v2/action-steps/zero-result-retry.step.ts

/**
 * Zero-Result Retry Step — progressive filter relaxation when search returns 0 results.
 *
 * When a search tool returns 0 results with filters present, this step
 * progressively relaxes the query and filters:
 *
 *   1. Relax query — strip filter-value words to avoid duplication
 *   2. Drop filters one-by-one, last-added first (least important first)
 *   3. Semantic fallback — drop ALL filters, fold values into query
 *
 * Stops as soon as results are found. Only runs for search tools that
 * returned 0 results with filters. Other tool types skip this step
 * via the chain factory.
 */

import { createLogger } from '@/shared/logger/logger';
import type { ToolExecutionResultV2 } from '../v2.types';
import type { ActionStep, ActionStepContext, ActionStepDeps, ActionStepResult } from './action-step.types';

const logger = createLogger('v2:step:zero-result-retry');

export class ZeroResultRetryStep implements ActionStep {
  readonly id = 'zero_result_retry' as const;
  readonly name = 'Zero-result retry';

  async execute(ctx: ActionStepContext, deps: ActionStepDeps): Promise<ActionStepResult> {
    const start = Date.now();
    const params = ctx.finalParams ?? ctx.validatedParams ?? ctx.extractedParams;
    let toolResult = ctx.toolResult;

    if (!toolResult || !params) {
      return {
        success: true,
        context: ctx,
        summary: 'Nothing to retry',
        durationMs: Date.now() - start,
      };
    }

    // Only retry when: success=true + 0 results + filters present
    const hasFilters = typeof params.query === 'string'
      && Array.isArray(params.filters)
      && (params.filters as unknown[]).length > 0;

    if (!toolResult.success || !isEmptyResult(toolResult) || !hasFilters) {
      return {
        success: true,
        context: ctx,
        summary: hasFilters ? 'Results found, no retry needed' : 'No filters to relax',
        durationMs: Date.now() - start,
      };
    }

    const originalFilters = params.filters as Array<{ field: string; operator: string; value: unknown }>;
    const originalQuery = params.query as string;
    let finalParams = params;
    const retryLog: Array<{ step: string; action: string; resultCount: number | null }> = [];

    const getResultCount = (r: ToolExecutionResultV2): number | null =>
      r.resultCount ?? (Array.isArray((r.data as any)?.results) ? (r.data as any).results.length : null);

    // Step 1: Relax query (strip filter-value words)
    const relaxedQuery = relaxQueryForFilters(originalQuery, originalFilters);
    const workingQuery = (relaxedQuery && relaxedQuery !== originalQuery) ? relaxedQuery : originalQuery;

    if (workingQuery !== originalQuery) {
      logger.info('Zero results — step 1: relaxed query', {
        toolSlug: ctx.action.toolSlug,
        originalQuery,
        relaxedQuery: workingQuery,
      });

      const retryParams = { ...params, query: workingQuery };
      try {
        const retryResult = await deps.executeTool(ctx.toolId, ctx.action.toolSlug, retryParams);
        const count = getResultCount(retryResult);
        retryLog.push({ step: 'relax_query', action: `"${originalQuery}" → "${workingQuery}"`, resultCount: count });
        if (retryResult.success && !isEmptyResult(retryResult)) {
          toolResult = retryResult;
          finalParams = retryParams;
        }
      } catch { /* non-fatal */ }
    }

    // Step 2: Progressive filter drop (last-added first)
    if (isEmptyResult(toolResult) && originalFilters.length > 1) {
      let remainingFilters = [...originalFilters];

      for (let i = remainingFilters.length - 1; i >= 1 && isEmptyResult(toolResult); i--) {
        const droppedFilter = remainingFilters[i];
        remainingFilters = remainingFilters.slice(0, i);

        logger.info('Zero results — step 2: dropping filter', {
          toolSlug: ctx.action.toolSlug,
          droppedFilter: `${droppedFilter.field}=${droppedFilter.value}`,
          remainingFilters: remainingFilters.map((f) => `${f.field}=${f.value}`),
        });

        const retryParams = { ...params, query: workingQuery, filters: remainingFilters };
        try {
          const retryResult = await deps.executeTool(ctx.toolId, ctx.action.toolSlug, retryParams);
          const count = getResultCount(retryResult);
          retryLog.push({
            step: 'drop_filter',
            action: `Dropped ${droppedFilter.field}=${droppedFilter.value}, ${remainingFilters.length} remaining`,
            resultCount: count,
          });
          if (retryResult.success && !isEmptyResult(retryResult)) {
            toolResult = retryResult;
            finalParams = retryParams;
          }
        } catch { /* non-fatal */ }
      }
    }

    // Step 3: Semantic fallback — drop ALL filters, fold values into query
    if (isEmptyResult(toolResult)) {
      const filterValues = originalFilters
        .map((f) => String(f.value))
        .filter((v) => v && v.length > 0);
      const enrichedQuery = [originalQuery, ...filterValues].join(' ');

      logger.info('Zero results — step 3: semantic fallback', {
        toolSlug: ctx.action.toolSlug,
        enrichedQuery,
        droppedFilters: originalFilters.map((f) => `${f.field}=${f.value}`),
      });

      const retryParams = { ...params, query: enrichedQuery, filters: undefined };
      try {
        const retryResult = await deps.executeTool(ctx.toolId, ctx.action.toolSlug, retryParams);
        const count = getResultCount(retryResult);
        retryLog.push({ step: 'semantic_fallback', action: `query="${enrichedQuery}", no filters`, resultCount: count });
        if (retryResult.success && !isEmptyResult(retryResult)) {
          toolResult = retryResult;
          finalParams = retryParams;
        }
      } catch { /* non-fatal */ }
    }

    const durationMs = Date.now() - start;
    const succeeded = retryLog.some((r) => r.resultCount !== null && r.resultCount > 0);
    const lastSuccessful = retryLog.filter((r) => r.resultCount !== null && r.resultCount > 0).pop();

    // Build human-readable summary
    const summaryParts = retryLog.map((r) => `${r.action} → ${r.resultCount ?? 0} results`);
    const summary = succeeded
      ? `Retry succeeded at ${lastSuccessful!.step}: ${summaryParts.join('; ')}`
      : `0 results after ${retryLog.length} relaxation attempt(s): ${summaryParts.join('; ')}`;

    return {
      success: true,
      context: {
        ...ctx,
        toolResult,
        finalParams,
      },
      summary,
      durationMs,
      spanAttributes: {
        'alpha.v2.step.original_query': originalQuery,
        'alpha.v2.step.original_filters': JSON.stringify(originalFilters.map((f) => `${f.field}=${f.value}`)),
        'alpha.v2.step.retry_attempts': retryLog.length,
        'alpha.v2.step.retry_succeeded': succeeded,
        'alpha.v2.step.retry_log': JSON.stringify(retryLog),
        ...(finalParams.query !== originalQuery && { 'alpha.v2.step.final_query': String(finalParams.query) }),
        ...(finalParams.filters !== params.filters && {
          'alpha.v2.step.final_filters': finalParams.filters
            ? JSON.stringify((finalParams.filters as Array<{ field: string; value: unknown }>).map((f) => `${f.field}=${f.value}`))
            : 'none',
        }),
      },
    };
  }
}

// ============================================================================
// HELPERS (moved from execution-loop.ts)
// ============================================================================

function isEmptyResult(result: ToolExecutionResultV2): boolean {
  if (result.resultCount !== undefined && result.resultCount !== null) {
    return result.resultCount === 0;
  }
  if (!result.data) return true;
  const data = result.data as Record<string, unknown>;
  if (Array.isArray(data)) return (data as unknown[]).length === 0;
  if (Array.isArray(data?.results)) return (data.results as unknown[]).length === 0;
  return false;
}

const ATTRIBUTE_SYNONYMS: Record<string, string[]> = {
  men: ['male', 'mens', "men's", 'man', 'boys', 'boy'],
  women: ['female', 'womens', "women's", 'woman', 'girls', 'girl', 'ladies'],
  unisex: ['all', 'both'],
};

function relaxQueryForFilters(
  query: string,
  filters: Array<{ field: string; value: unknown }>,
): string | null {
  const stripWords = new Set<string>();

  for (const filter of filters) {
    stripWords.add(filter.field.toLowerCase());
    const val = String(filter.value).toLowerCase();
    stripWords.add(val);

    const synonyms = ATTRIBUTE_SYNONYMS[val];
    if (synonyms) {
      for (const syn of synonyms) stripWords.add(syn);
    }
    for (const [canonical, syns] of Object.entries(ATTRIBUTE_SYNONYMS)) {
      if (syns.includes(val)) {
        stripWords.add(canonical);
        for (const syn of syns) stripWords.add(syn);
      }
    }
  }

  const words = query.split(/\s+/);
  const cleaned = words.filter((w) => !stripWords.has(w.toLowerCase().replace(/['']/g, "'")));
  const result = cleaned.join(' ').trim();
  return result.length > 0 ? result : null;
}

// Exported for testing
export { isEmptyResult as _isEmptyResult, relaxQueryForFilters as _relaxQueryForFilters };
