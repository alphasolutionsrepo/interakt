// src/features/pipeline/v2/action-steps/result-capture.step.ts

/**
 * Result Capture Step — updates turn context's result memory after tool execution.
 *
 * This is the final step in the chain. It captures tool results into the
 * result memory so subsequent actions (and synthesis) can reference them.
 *
 * Side effect: mutates turnContext.resultMemory and turnContext.resultMemoryIndex.
 * This is intentional — sequential actions depend on previous results.
 */

import type { ActionStep, ActionStepContext, ActionStepDeps, ActionStepResult } from './action-step.types';
import type { ResultMemoryEntry } from '../../pipeline.types';

export class ResultCaptureStep implements ActionStep {
  readonly id = 'result_capture' as const;
  readonly name = 'Result capture';

  async execute(ctx: ActionStepContext, _deps: ActionStepDeps): Promise<ActionStepResult> {
    const start = Date.now();

    if (!ctx.toolResult || !ctx.toolResult.success || !ctx.toolResult.data) {
      return {
        success: true,
        context: ctx,
        summary: 'No results to capture',
        durationMs: Date.now() - start,
      };
    }

    const data = ctx.toolResult.data;
    const rawItems = Array.isArray(data) ? data : (data as Record<string, unknown>)?.results ?? [];
    const items = Array.isArray(rawItems) ? rawItems : [];
    const resultCount = ctx.toolResult.resultCount ?? items.length;

    // Update result sets
    ctx.turnContext.resultMemory.sets[ctx.action.toolSlug] = {
      toolSlug: ctx.action.toolSlug,
      executedAt: new Date().toISOString(),
      results: items as unknown[],
      totalCount: resultCount,
    };

    // Rebuild reference index from results
    if ((items as unknown[]).length > 0) {
      const newEntries: ResultMemoryEntry[] = (items as Record<string, unknown>[]).slice(0, 20).map((item, idx) => ({
        ordinal: idx + 1,
        toolSlug: ctx.action.toolSlug,
        resultId: String(item.id ?? item._id ?? `${ctx.action.toolSlug}-${idx}`),
        snapshot: buildSnapshot(item),
      }));

      ctx.turnContext.resultMemory.referenceIndex = newEntries;
      ctx.turnContext.resultMemoryIndex = newEntries;
    }

    return {
      success: true,
      context: ctx,
      summary: `Captured ${resultCount} result(s) for ${ctx.action.toolSlug}`,
      durationMs: Date.now() - start,
    };
  }
}

/**
 * Build a compact snapshot of a result item for the reference index.
 * Picks common display fields, keeps it small.
 */
function buildSnapshot(item: Record<string, unknown>): Record<string, unknown> {
  const snapshot: Record<string, unknown> = {};
  const displayFields = ['title', 'name', 'price', 'category', 'brand', 'status', 'description'];

  const nested = (item.data as Record<string, unknown>) ?? (item.document as Record<string, unknown>);
  const sources = nested ? [item, nested] : [item];

  for (const field of displayFields) {
    for (const src of sources) {
      if (src[field] !== undefined && src[field] !== null) {
        const val = src[field];
        snapshot[field] = typeof val === 'string' && val.length > 100
          ? val.slice(0, 100) + '...'
          : val;
        break;
      }
    }
  }

  if (item.id) snapshot.id = item.id;
  if (item._id) snapshot.id = item._id;

  return snapshot;
}

// Exported for testing
export { buildSnapshot as _buildSnapshot };
