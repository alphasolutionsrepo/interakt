// src/features/pipeline/v2/action-steps/action-step.types.ts

/**
 * Action Step Types — Discrete execution sub-steps
 *
 * Each sub-step within the execution loop (context enrichment, param extraction,
 * validation, tool execution, retry, result capture) is modeled as an ActionStep
 * with typed context flowing through. This enables per-step observability,
 * configurability, and tool-type-aware step chains.
 *
 * See: docs/platform-evolution/DETERMINISTIC-PIPELINE-V2.md § D2
 */

import type {
  PlannedAction,
  ToolDefinitionV2,
  TurnContext,
  ActionResult,
  ToolExecutionResultV2,
} from '../v2.types';
import type { ParameterContext } from '../parameter-context.types';
import type { PipelineStreamEvent } from '../../pipeline.types';
import type { ChatFn } from '../turn-planner';
import type { ToolExecutorFn } from '../execution-loop';

// ============================================================================
// ACTION STEP IDENTIFIERS
// ============================================================================

/** Identifiers for each action sub-step. Used for config lookup, span naming, and event emission. */
export type ActionStepId =
  | 'context_enrichment'
  | 'param_extraction'
  | 'filter_validation'
  | 'tool_execution'
  | 'zero_result_retry'
  | 'result_capture';

// ============================================================================
// ACTION STEP CONTEXT — data flowing through the chain
// ============================================================================

/**
 * Immutable context bag flowing through the action step chain.
 * Each step reads what it needs and returns a new context with its outputs added.
 */
export interface ActionStepContext {
  // ── Set at chain start (never mutated) ─────────────────────────────────
  readonly action: PlannedAction;
  readonly toolDef: ToolDefinitionV2;
  readonly toolId: string;
  readonly turnContext: TurnContext;
  readonly previousResults: ActionResult[];

  // ── Written by ContextEnrichmentStep ───────────────────────────────────
  /** Enriched field constraints with valid values (for filter grounding) */
  paramContext: ParameterContext;
  /** Planner hints with invalid keys removed */
  sanitizedHints: Record<string, unknown>;
  /** Explains what was removed and why, injected into extraction prompt */
  hintAnnotations: string[];

  // ── Written by ParamExtractionStep ─────────────────────────────────────
  /** Raw extracted parameters from AI (before filter validation) */
  extractedParams: Record<string, unknown> | null;

  // ── Written by FilterValidationStep ────────────────────────────────────
  /** Parameters after filter validation corrections */
  validatedParams: Record<string, unknown> | null;

  // ── Written by ToolExecutionStep / ZeroResultRetryStep ─────────────────
  /** Result from tool execution (may be updated by retry step) */
  toolResult: ToolExecutionResultV2 | null;
  /** Final parameters used (may differ from validatedParams after retry relaxation) */
  finalParams: Record<string, unknown> | null;
}

// ============================================================================
// ACTION STEP RESULT
// ============================================================================

/** Result returned by each step's execute() method. */
export interface ActionStepResult {
  /** Whether this step succeeded */
  success: boolean;
  /** Updated context with this step's outputs */
  context: ActionStepContext;
  /** Human-readable summary for tracing and trace viewer */
  summary: string;
  /** Duration of this step in milliseconds */
  durationMs: number;
  /** If true, skip all remaining steps for this action (e.g., extraction failed) */
  skipRemaining?: boolean;
  /** Step-specific attributes to record on the tracing span (for trace viewer detail) */
  spanAttributes?: Record<string, string | number | boolean>;
}

// ============================================================================
// ACTION STEP INTERFACE
// ============================================================================

/**
 * An action step: a discrete, observable unit of work within the execution loop.
 *
 * Each step:
 * - Has its own tracing span (added by the step chain runner)
 * - Emits an action_step event (added by the step chain runner)
 * - Reads specific fields from ActionStepContext
 * - Returns an updated context with its outputs
 */
export interface ActionStep {
  /** Step identifier — used for config lookup, span naming, event emission */
  readonly id: ActionStepId;
  /** Display name for traces and trace viewer */
  readonly name: string;
  /** Execute this step */
  execute(ctx: ActionStepContext, deps: ActionStepDeps): Promise<ActionStepResult>;
}

// ============================================================================
// ACTION STEP DEPENDENCIES
// ============================================================================

/** Dependencies injected into every action step. */
export interface ActionStepDeps {
  /** AI chat function for param extraction */
  chat: ChatFn;
  /** Tool executor function */
  executeTool: ToolExecutorFn;
  /** SSE event emitter (for sub-step-level events within a step) */
  emit: (event: PipelineStreamEvent) => void;
  /** Chain-level configuration */
  config: ActionStepChainConfig;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

/** Per-step enable/disable and config overrides. */
export interface ActionStepOverride {
  enabled: boolean;
  config?: Record<string, unknown>;
}

/** Configuration for an action step chain. */
export interface ActionStepChainConfig {
  /** Max retries for param extraction (passed to ParamExtractionStep) */
  maxRetriesPerAction: number;
  /** Per-step overrides — disable steps or pass step-specific config */
  stepOverrides?: Partial<Record<ActionStepId, ActionStepOverride>>;
}
