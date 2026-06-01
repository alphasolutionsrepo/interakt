// src/features/pipeline/steps/result-memory.ts

/**
 * Result Memory Step (Deterministic Pipeline)
 *
 * Runs immediately after tool_execution. Persists the tool's results into
 * the session's ResultMemoryStore so they can be referenced in future turns.
 *
 * Two things are written:
 * 1. A named result set under a key derived from the tool slug
 *    (e.g. "last_search", "products_lookup")
 * 2. The reference index — rebuilt on every search-type result so ordinals
 *    are always relative to what the user is currently viewing
 *    ("item 1" always means the first item in the most recent results)
 *
 * The reference index is only rebuilt when the tool is a search-type result
 * (returns a list). For lookup/action tools, we just update the named set.
 *
 * The updated store is written to ctx.resultMemory (in-process) and also
 * persisted to the session DB row via ctx.shared.pendingResultMemoryUpdate —
 * chat-pipeline.ts flushes this after the turn completes.
 */

import type { Span } from '@opentelemetry/api';
import type { StepHandler, PipelineContext, StepResult, ResultMemoryStore, ResultSet, ResultMemoryEntry } from '../pipeline.types';
import type { ToolSelectionResult } from './tool-selection';

// ============================================================================
// CONFIG
// ============================================================================

interface ResultMemoryConfig {
  /**
   * Maximum number of items to index in the reference index.
   * Only the first N results get ordinals (default: 20).
   */
  maxIndexedItems?: number;
  /**
   * Fields to include in each item's snapshot (default: id, title, name, price, category).
   * Snapshots are used for ordinal display and tool parameter resolution.
   */
  snapshotFields?: string[];
}

// Key fields we always try to extract for the snapshot
const DEFAULT_SNAPSHOT_FIELDS = ['id', '_id', 'title', 'name', 'price', 'category', 'type', 'brand'];

// ============================================================================
// SHARED HELPER — usable by both the deterministic step and the agentic loop
// ============================================================================

/**
 * Update the result memory store with a tool's output.
 * Mutates ctx.resultMemory in place and marks ctx.shared.pendingResultMemoryUpdate.
 * Called by the deterministic result_memory step AND the agentic loop after each tool call.
 */
export function applyToolResultToMemory(
  toolSlug: string,
  toolOutput: Record<string, unknown>,
  ctx: PipelineContext,
  options?: { maxIndexedItems?: number; snapshotFields?: string[] },
): void {
  const maxIndexed = options?.maxIndexedItems ?? 20;
  const snapshotFields = options?.snapshotFields ?? DEFAULT_SNAPSHOT_FIELDS;

  const results = extractResultArray(toolOutput);
  const totalCount = extractTotalCount(toolOutput);
  const setKey = isSearchResult(toolSlug) ? 'last_search' : toolSlug;

  const updatedStore: ResultMemoryStore = {
    sets: {
      ...ctx.resultMemory.sets,
      [setKey]: {
        toolSlug,
        executedAt: new Date().toISOString(),
        results,
        totalCount,
      } satisfies ResultSet,
    },
    referenceIndex: results.length > 0
      ? buildReferenceIndex(toolSlug, results, maxIndexed, snapshotFields)
      : ctx.resultMemory.referenceIndex,
  };

  ctx.resultMemory = updatedStore;
  ctx.shared.pendingResultMemoryUpdate = updatedStore;
}

// ============================================================================
// STEP HANDLER
// ============================================================================

export const resultMemoryHandler: StepHandler = {
  type: 'result_memory',

  async execute(
    config: Record<string, unknown>,
    ctx: PipelineContext,
    span: Span,
  ): Promise<StepResult> {
    const cfg = config as unknown as ResultMemoryConfig;

    // Read tool selection result to know which tool ran
    const selectionData = ctx.stepResults['tool-selection']?.data as unknown as ToolSelectionResult | undefined;
    if (!selectionData?.toolSlug || selectionData.isDirectResponse) {
      return { success: true, summary: 'No tool result to store' };
    }

    // Read tool execution output from shared context
    const toolOutput = ctx.shared.lastToolResults as Record<string, unknown> | undefined;
    if (!toolOutput) {
      return { success: true, summary: 'No tool output found in shared context' };
    }

    applyToolResultToMemory(selectionData.toolSlug, toolOutput, ctx, {
      maxIndexedItems: cfg.maxIndexedItems,
      snapshotFields: cfg.snapshotFields,
    });

    const store = ctx.resultMemory;
    const setKey = isSearchResult(selectionData.toolSlug) ? 'last_search' : selectionData.toolSlug;
    const resultCount = store.sets[setKey]?.results.length ?? 0;

    span.setAttribute('result_memory.set_key', setKey);
    span.setAttribute('result_memory.result_count', resultCount);
    span.setAttribute('result_memory.index_size', store.referenceIndex.length);

    return {
      success: true,
      data: { setKey, resultCount, indexSize: store.referenceIndex.length },
      summary: `Stored ${resultCount} results under "${setKey}"; reference index has ${store.referenceIndex.length} items`,
    };
  },
};

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Extract the array of result items from a tool output.
 * Handles common shapes: { items: [] }, { results: [] }, { data: [] }, or root array.
 */
function extractResultArray(output: Record<string, unknown>): unknown[] {
  if (Array.isArray(output)) return output;
  if (Array.isArray(output.items)) return output.items as unknown[];
  if (Array.isArray(output.results)) return output.results as unknown[];
  if (Array.isArray(output.data)) return output.data as unknown[];
  if (Array.isArray(output.documents)) return output.documents as unknown[];
  // Single-item results (lookup)
  if (output.item && typeof output.item === 'object') return [output.item];
  if (output.document && typeof output.document === 'object') return [output.document];
  return [];
}

function extractTotalCount(output: Record<string, unknown>): number | undefined {
  if (typeof output.totalCount === 'number') return output.totalCount;
  if (typeof output.total === 'number') return output.total;
  if (typeof output.count === 'number') return output.count;
  return undefined;
}

function isSearchResult(toolSlug: string): boolean {
  return toolSlug.includes('search') || toolSlug.includes('find') || toolSlug.includes('list');
}

/**
 * Build the reference index from a list of results.
 * Each item gets a 1-based ordinal and a key-field snapshot.
 */
function buildReferenceIndex(
  toolSlug: string,
  results: unknown[],
  maxItems: number,
  snapshotFields: string[],
): ResultMemoryEntry[] {
  return results.slice(0, maxItems).map((item, i) => {
    const obj = item as Record<string, unknown>;
    const resultId = extractId(obj);
    const snapshot = extractSnapshot(obj, snapshotFields);

    return {
      ordinal: i + 1,
      toolSlug,
      resultId,
      snapshot,
    };
  });
}

function extractId(obj: Record<string, unknown>): string {
  return String(obj.id ?? obj._id ?? obj.documentId ?? obj.productId ?? Object.values(obj)[0] ?? '');
}

function extractSnapshot(obj: Record<string, unknown>, fields: string[]): Record<string, unknown> {
  const snapshot: Record<string, unknown> = {};
  for (const field of fields) {
    if (obj[field] !== undefined) {
      snapshot[field] = obj[field];
    }
  }
  return snapshot;
}
