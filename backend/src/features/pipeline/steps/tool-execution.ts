// src/features/pipeline/steps/tool-execution.ts

/**
 * Tool Execution Step (Deterministic Pipeline)
 *
 * Two execution paths:
 *
 * 1. Tool-selection path (current): reads toolId + parameters from
 *    ctx.stepResults['tool-selection']. Calls executeTool directly.
 *    Writes raw output to ctx.shared.lastToolResults for result_memory.
 *
 * 2. Intent-detection path (legacy): reads DetectedIntent + constraints
 *    from prior steps. Maps action enum to tool calls.
 *    Kept for backward compatibility with older pipeline configs.
 */

import type { Span } from '@opentelemetry/api';
import { executeTool } from '@/features/tools/tools.executor';
import type { StepHandler, PipelineContext, StepResult } from '../pipeline.types';
import type { ToolSelectionResult } from './tool-selection';
import type { DetectedIntent, IntentAction } from './intent-detection';
import type { ValidatedConstraint } from './constraint-extraction';

// ============================================================================
// TYPES
// ============================================================================

interface ToolExecutionConfig {
  /** Primary search tool ID for this experience */
  searchToolId?: string;
  /** Knowledge/web search tool ID */
  knowledgeToolId?: string;
  /** Max results to return from search */
  maxResults?: number;
  /** Max results to include in synthesis context */
  synthesisMaxResults?: number;
}

export interface ExecutionFacts {
  action: IntentAction;
  query?: string;
  results?: unknown[];
  resultCount?: number;
  constraints?: ValidatedConstraint[];
  rankingCriteria?: string;
  itemDetails?: unknown;
  comparisonItems?: unknown[];
  knowledgeAnswer?: string;
  error?: string;
  /** Whether constraints were relaxed to get results */
  constraintsRelaxed?: boolean;
  relaxedConstraints?: ValidatedConstraint[];
}

// ============================================================================
// STEP HANDLER
// ============================================================================

export const toolExecutionHandler: StepHandler = {
  type: 'tool_execution',

  async execute(
    config: Record<string, unknown>,
    ctx: PipelineContext,
    span: Span,
  ): Promise<StepResult> {
    const cfg = config as unknown as ToolExecutionConfig;

    // ── New path: tool-selection-based ──────────────────────────────────────
    // When tool_selection ran, delegate to the new direct execution path.
    const selectionData = ctx.stepResults['tool-selection']?.data as unknown as ToolSelectionResult | undefined;
    if (selectionData !== undefined) {
      return executeFromSelection(selectionData, ctx, span);
    }

    // ── Legacy path: intent-detection-based ─────────────────────────────────
    // Resolve intent (may have been corrected by validation step)
    const intentData = findIntentData(ctx);
    const constraintData = findConstraintData(ctx);
    const validationOverride = ctx.shared.validationOverride as
      | { correctedAction: IntentAction; reason: string }
      | undefined;

    const intent = intentData?.intent;
    if (!intent) {
      return {
        success: false,
        data: { facts: { action: 'clarify', error: 'No intent detected' } },
        summary: 'No intent available for execution',
      };
    }

    const action = (validationOverride?.correctedAction ?? intent.action) as IntentAction;
    const constraints = constraintData?.validConstraints ?? [];

    const facts = await executeAction(action, intent, constraints, cfg, ctx, span);

    // Store facts in shared for synthesis
    ctx.shared.executionFacts = facts;

    // Update conversation state
    if (facts.results?.length) {
      ctx.shared.hasResults = true;
      ctx.shared.resultCount = facts.resultCount ?? facts.results.length;
      ctx.shared.currentResults = facts.results;
    }
    if (facts.query) {
      ctx.shared.currentQuery = facts.query;
    }

    span.setAttribute('execution.action', action);
    span.setAttribute('execution.result_count', facts.resultCount ?? 0);
    if (facts.error) span.setAttribute('execution.error', facts.error);

    return {
      success: !facts.error,
      data: { facts },
      summary: facts.error
        ? `Execution failed: ${facts.error}`
        : `Executed ${action}: ${facts.resultCount ?? 0} results`,
    };
  },
};

// ============================================================================
// NEW PATH: TOOL-SELECTION-BASED EXECUTION
// ============================================================================

async function executeFromSelection(
  selection: ToolSelectionResult,
  ctx: PipelineContext,
  span: Span,
): Promise<StepResult> {
  // Direct response — no tool needed
  if (selection.isDirectResponse || !selection.toolId || !selection.toolSlug) {
    ctx.shared.lastToolResults = {};
    span.setAttribute('tool_execution.path', 'direct_response');
    return { success: true, summary: 'Direct response — no tool execution' };
  }

  const toolId = selection.toolId;
  const toolSlug = selection.toolSlug;
  // Prefer validated parameters (from param_validation step), fall back to raw selection params
  const parameters = (ctx.shared.validatedParameters as Record<string, unknown> | undefined) ?? selection.parameters;

  span.setAttribute('tool_execution.path', 'tool_selection');
  span.setAttribute('tool_execution.tool_id', toolId);
  span.setAttribute('tool_execution.tool_slug', toolSlug);

  ctx.emitEvent({
    type: 'tool_call',
    id: toolId,
    name: toolSlug,
    arguments: parameters,
  });

  const start = Date.now();
  const result = await executeTool(toolId, parameters);
  const durationMs = Date.now() - start;

  const rawOutput = (result.data ?? {}) as Record<string, unknown>;
  const resultItems = extractItems(rawOutput);

  ctx.emitEvent({
    type: 'tool_result',
    id: toolId,
    success: result.success,
    resultCount: resultItems.length,
    durationMs,
  });

  // Write raw output to shared — result_memory step reads this
  ctx.shared.lastToolResults = rawOutput;

  // Update conversation state (used by synthesis + future turns)
  if (resultItems.length > 0) {
    ctx.shared.hasResults = true;
    ctx.shared.resultCount = resultItems.length;
    ctx.shared.currentResults = resultItems;
  }

  span.setAttribute('tool_execution.success', result.success);
  span.setAttribute('tool_execution.result_count', resultItems.length);
  if (!result.success && result.error) {
    span.setAttribute('tool_execution.error', result.error);
  }

  return {
    success: result.success,
    data: { toolId, toolSlug, output: rawOutput },
    summary: result.success
      ? `Executed ${toolSlug}: ${resultItems.length} result(s)`
      : `Tool ${toolSlug} failed: ${result.error ?? 'unknown error'}`,
  };
}

/** Extract the result item array from a tool's raw output (same shapes as result-memory). */
function extractItems(output: Record<string, unknown>): unknown[] {
  if (Array.isArray(output)) return output;
  if (Array.isArray(output.items)) return output.items as unknown[];
  if (Array.isArray(output.results)) return output.results as unknown[];
  if (Array.isArray(output.data)) return output.data as unknown[];
  if (Array.isArray(output.documents)) return output.documents as unknown[];
  if (output.item && typeof output.item === 'object') return [output.item];
  if (output.document && typeof output.document === 'object') return [output.document];
  return [];
}

// ============================================================================
// LEGACY PATH: ACTION DISPATCH
// ============================================================================

async function executeAction(
  action: IntentAction,
  intent: DetectedIntent,
  constraints: ValidatedConstraint[],
  cfg: ToolExecutionConfig,
  ctx: PipelineContext,
  span: Span,
): Promise<ExecutionFacts> {
  switch (action) {
    case 'search':
    case 'refine':
      return executeSearch(intent, constraints, cfg, ctx, span);
    case 'rank':
      return executeRank(intent, constraints, cfg, ctx, span);
    case 'compare':
      return executeCompare(intent, ctx);
    case 'explain':
      return executeExplain(intent, ctx);
    case 'knowledge':
      return executeKnowledge(intent, cfg, ctx, span);
    case 'greet':
      return { action: 'greet' };
    case 'clarify':
      return {
        action: 'clarify',
        query: intent.searchQuery,
      };
    default:
      return { action, error: `Unknown action: ${action}` };
  }
}

// ============================================================================
// ACTION EXECUTORS
// ============================================================================

async function executeSearch(
  intent: DetectedIntent,
  constraints: ValidatedConstraint[],
  cfg: ToolExecutionConfig,
  ctx: PipelineContext,
  span: Span,
): Promise<ExecutionFacts> {
  const searchToolId = cfg.searchToolId ?? (ctx.shared.searchToolId as string);
  if (!searchToolId) {
    return { action: intent.action, error: 'No search tool configured' };
  }

  const query = intent.searchQuery ?? (ctx.shared.currentQuery as string) ?? '';
  const filters = constraints.map(c => ({
    field: c.field,
    operator: c.operator,
    value: c.value,
  }));

  ctx.emitEvent({
    type: 'tool_call',
    id: searchToolId,
    name: 'search',
    arguments: { query, filters },
  });

  const result = await executeTool(searchToolId, {
    action: 'search',
    query,
    filters: filters.length > 0 ? filters : undefined,
    maxResults: cfg.maxResults ?? 20,
  });

  const resultData = result.data as Record<string, unknown> | undefined;

  ctx.emitEvent({
    type: 'tool_result',
    id: searchToolId,
    success: result.success,
    resultCount: (resultData?.results as unknown[] | undefined)?.length,
    durationMs: result.durationMs,
  });

  if (!result.success) {
    return { action: intent.action, query, constraints, error: result.error };
  }

  const results = (resultData?.results as unknown[]) ?? [];
  const maxForSynthesis = cfg.synthesisMaxResults ?? 10;

  // If zero results with constraints, try relaxing
  if (results.length === 0 && constraints.length > 0) {
    const relaxed = await tryRelaxConstraints(searchToolId, query, constraints, cfg);
    if (relaxed) {
      return {
        action: intent.action,
        query,
        results: relaxed.results.slice(0, maxForSynthesis),
        resultCount: relaxed.results.length,
        constraints,
        constraintsRelaxed: true,
        relaxedConstraints: relaxed.usedConstraints,
      };
    }
  }

  return {
    action: intent.action,
    query,
    results: results.slice(0, maxForSynthesis),
    resultCount: results.length,
    constraints,
  };
}

async function executeRank(
  intent: DetectedIntent,
  constraints: ValidatedConstraint[],
  cfg: ToolExecutionConfig,
  ctx: PipelineContext,
  span: Span,
): Promise<ExecutionFacts> {
  // If we have a search query or target is new_search, do a sorted search
  if (intent.searchQuery || intent.target === 'new_search') {
    const searchToolId = cfg.searchToolId ?? (ctx.shared.searchToolId as string);
    if (!searchToolId) {
      return { action: 'rank', error: 'No search tool configured' };
    }

    const query = intent.searchQuery ?? (ctx.shared.currentQuery as string) ?? '';
    const result = await executeTool(searchToolId, {
      action: 'search',
      query,
      sort: intent.rankingCriteria,
      maxResults: cfg.maxResults ?? 20,
    });

    if (!result.success) {
      return { action: 'rank', error: result.error };
    }

    const rankData = result.data as Record<string, unknown> | undefined;
    const results = (rankData?.results as unknown[]) ?? [];
    return {
      action: 'rank',
      query,
      results: results.slice(0, cfg.synthesisMaxResults ?? 10),
      resultCount: results.length,
      rankingCriteria: intent.rankingCriteria,
    };
  }

  // Otherwise, rank current results in-memory
  const currentResults = (ctx.shared.currentResults as unknown[]) ?? [];
  return {
    action: 'rank',
    results: currentResults,
    resultCount: currentResults.length,
    rankingCriteria: intent.rankingCriteria,
  };
}

function executeCompare(
  intent: DetectedIntent,
  ctx: PipelineContext,
): ExecutionFacts {
  const currentResults = (ctx.shared.currentResults as Record<string, unknown>[]) ?? [];
  const refs = intent.itemReferences ?? [];

  // Find referenced items in current results
  let items: unknown[];
  if (refs.length > 0) {
    items = refs
      .map(ref => currentResults.find(r =>
        String(r.id) === ref || String(r.name)?.toLowerCase().includes(ref.toLowerCase()),
      ))
      .filter(Boolean);
  } else {
    // Default: first items in results
    items = currentResults.slice(0, 3);
  }

  return {
    action: 'compare',
    comparisonItems: items,
    resultCount: items.length,
  };
}

function executeExplain(
  intent: DetectedIntent,
  ctx: PipelineContext,
): ExecutionFacts {
  const currentResults = (ctx.shared.currentResults as Record<string, unknown>[]) ?? [];
  const ref = intent.itemReference;

  let item: unknown = null;
  if (ref) {
    item = currentResults.find(r =>
      String(r.id) === ref || String(r.name)?.toLowerCase().includes(ref.toLowerCase()),
    );
  }
  if (!item) {
    item = currentResults[0]; // Default to first result
  }

  return {
    action: 'explain',
    itemDetails: item,
  };
}

async function executeKnowledge(
  intent: DetectedIntent,
  cfg: ToolExecutionConfig,
  ctx: PipelineContext,
  span: Span,
): Promise<ExecutionFacts> {
  const knowledgeToolId = cfg.knowledgeToolId ?? (ctx.shared.knowledgeToolId as string);

  if (!knowledgeToolId) {
    // No knowledge tool — just let synthesis handle it conversationally
    return { action: 'knowledge', query: intent.searchQuery };
  }

  const result = await executeTool(knowledgeToolId, {
    query: intent.searchQuery ?? ctx.userMessage,
  });

  return {
    action: 'knowledge',
    query: intent.searchQuery,
    knowledgeAnswer: result.success ? String((result.data as Record<string, unknown>)?.answer ?? (result.data as Record<string, unknown>)?.content ?? '') : undefined,
    error: result.success ? undefined : result.error,
  };
}

// ============================================================================
// CONSTRAINT RELAXATION
// ============================================================================

async function tryRelaxConstraints(
  toolId: string,
  query: string,
  constraints: ValidatedConstraint[],
  cfg: ToolExecutionConfig,
): Promise<{ results: unknown[]; usedConstraints: ValidatedConstraint[] } | null> {
  // Try removing constraints one at a time (least important first = last in array)
  for (let i = constraints.length - 1; i >= 0; i--) {
    const relaxed = [...constraints.slice(0, i), ...constraints.slice(i + 1)];
    const filters = relaxed.map(c => ({ field: c.field, operator: c.operator, value: c.value }));

    const result = await executeTool(toolId, {
      action: 'search',
      query,
      filters: filters.length > 0 ? filters : undefined,
      maxResults: cfg.maxResults ?? 20,
    });

    const relaxData = result.data as Record<string, unknown> | undefined;
    if (result.success && (relaxData?.results as unknown[])?.length > 0) {
      return {
        results: relaxData!.results as unknown[],
        usedConstraints: relaxed,
      };
    }
  }

  return null;
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
