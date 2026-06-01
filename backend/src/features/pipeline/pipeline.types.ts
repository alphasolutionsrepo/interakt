import type { Span } from '@opentelemetry/api';

// ============================================================================
// PIPELINE STEP TYPES (extensible registry of known step types)
// ============================================================================

/**
 * All registered pipeline step types.
 * New step types are added here as the system grows.
 */
export type PipelineStepType =
  // Shared steps (both modes)
  | 'input_guardrail'
  | 'output_guardrail'
  | 'query_rewriter'
  | 'citation_formatter'
  // Agentic-specific
  | 'agentic_loop'
  // Deterministic-specific (legacy — being replaced by tool_selection)
  | 'intent_detection'
  | 'constraint_extraction'
  | 'validation'
  // Deterministic-specific (current)
  | 'tool_group_selection'
  | 'tool_selection'
  | 'param_validation'
  | 'tool_execution'
  | 'result_memory'
  | 'response_synthesis'
  // Cross-session memory (Sprint 5)
  | 'episodic_memory';

// ============================================================================
// PIPELINE CONFIGURATION (stored on AI Experience)
// ============================================================================

export type PipelineMode = 'agentic' | 'deterministic';

/** Condition for conditional step execution */
export interface StepCondition {
  /** Dot-path to check in pipeline context (e.g., "stepResults.intent_detection.action") */
  field: string;
  operator: 'eq' | 'neq' | 'gt' | 'lt' | 'in' | 'exists';
  value: unknown;
}

/** How to handle step failure */
export type StepFailureStrategy = 'abort' | 'skip' | 'fallback';

/** A single step in the pipeline configuration */
export interface PipelineStep {
  /** Unique ID within this pipeline (e.g., "input-guardrail", "detect-intent") */
  id: string;
  /** Registered step type — determines which handler runs */
  type: PipelineStepType;
  /** Display name for dashboard and traces */
  name: string;
  /** Optional description */
  description?: string;
  /** Type-specific configuration passed to the step handler */
  config: Record<string, unknown>;
  /** Toggle on/off without removing from pipeline */
  enabled: boolean;
  /** Execution order (lower runs first) */
  order: number;
  /** Only run if all conditions are met */
  conditions?: StepCondition[];
  /** What to do if this step throws (overrides pipeline-level setting) */
  onFailure?: StepFailureStrategy;
  /** Configuration for fallback behavior (used when onFailure = 'fallback') */
  fallbackConfig?: Record<string, unknown>;
}

/** Global pipeline settings */
export interface PipelineSettings {
  /** Hard timeout for entire pipeline execution in ms */
  maxTotalDurationMs: number;
  /** Whether to create OpenTelemetry spans per step */
  enableTracing: boolean;
  /** Default failure strategy when a step doesn't specify one */
  onStepFailure: StepFailureStrategy;
}

/** Complete pipeline configuration stored on the AI Experience */
export interface PipelineConfig {
  mode: PipelineMode;
  steps: PipelineStep[];
  settings: PipelineSettings;
}

// ============================================================================
// PIPELINE DEFAULTS
// ============================================================================

export const DEFAULT_PIPELINE_SETTINGS: PipelineSettings = {
  maxTotalDurationMs: 30_000,
  enableTracing: true,
  onStepFailure: 'abort',
};

// ============================================================================
// STREAMING EVENTS (emitted during pipeline execution)
// ============================================================================

/** Events the pipeline emits to the client via SSE */
export type PipelineStreamEvent =
  | { type: 'step_start'; stepId: string; stepType: PipelineStepType; stepName: string }
  | { type: 'step_complete'; stepId: string; stepType: PipelineStepType; durationMs: number; status: 'ok' | 'skipped' | 'fallback' | 'error' }
  | { type: 'content'; text: string }
  | { type: 'tool_call'; id: string; name: string; arguments: Record<string, unknown> }
  | { type: 'tool_result'; id: string; success: boolean; resultCount?: number; durationMs: number }
  // Execution loop sub-step events (granular visibility into D2)
  | { type: 'action_step'; toolSlug: string; step: ActionSubStep; durationMs: number; detail?: string }
  | { type: 'preset'; preset: string; data: unknown }
  | { type: 'sources'; sources: Array<{ id: string; title?: string; dataSource?: string }> }
  | { type: 'error'; message: string; stepId?: string }
  | { type: 'done'; sessionId: string; usage?: TokenUsage }
  // Message classification result (emitted by S1 input guardrail)
  | { type: 'classification'; classification: string; debug: {
      greetingRegexMatched: boolean;
      domainFilterEnabled: boolean;
      domainSimilarity?: number;
      generalSimilarity?: number;
      closestDomainTerm?: string;
      closestGeneralTerm?: string;
      shortCircuited: boolean;
    }};

/** Sub-steps within the execution loop, emitted as action_step events */
export type ActionSubStep =
  | 'context_enrichment'
  | 'param_extraction'
  | 'param_validation'
  | 'filter_validation'
  | 'query_relaxation'
  | 'filter_relaxation'
  | 'zero_result_retry'
  | 'tool_execution'
  | 'result_capture';

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

// ============================================================================
// RESULT MEMORY STORE
// ============================================================================

/**
 * A snapshot of a single result item — key fields only, stored for fast
 * ordinal resolution ("item 2", "option 3") without re-fetching.
 */
export interface ResultMemoryEntry {
  /** 1-based ordinal displayed to the user (item 1, item 2, …) */
  ordinal: number;
  /** Slug of the tool that produced this result */
  toolSlug: string;
  /** Original result ID from the data source */
  resultId: string;
  /** Key fields for context: title, price, id, etc. */
  snapshot: Record<string, unknown>;
}

/**
 * A named set of results from a tool execution.
 * Keys are short descriptive names: "last_search", "compared_items", etc.
 */
export interface ResultSet {
  toolSlug: string;
  executedAt: string; // ISO timestamp
  results: unknown[];
  totalCount?: number;
}

/**
 * Session-scoped store that enables conversational references to prior results.
 * Written by the result_memory step after each tool execution.
 * Read by the context builder at the start of each turn.
 */
export interface ResultMemoryStore {
  /** Named result sets — "last_search", "compared_items", etc. */
  sets: Record<string, ResultSet>;
  /**
   * Ordered reference index — rebuilt on each new search.
   * Enables: "add item 2 to cart", "compare 1 and 3"
   */
  referenceIndex: ResultMemoryEntry[];
}

// ============================================================================
// PIPELINE CONTEXT (passed between steps)
// ============================================================================

/**
 * Mutable context object that flows through the pipeline.
 * Steps read from it and write their results to it.
 */
export interface PipelineContext {
  /** The AI Experience configuration */
  experienceId: string;
  experienceSlug: string;

  /** The user's message */
  userMessage: string;

  /** Session ID for this conversation */
  sessionId: string;

  /** Conversation history (loaded from session) */
  conversationHistory: ConversationMessage[];

  /**
   * Result memory from the current session.
   * Hydrated by the context builder at turn start.
   * Written by the result_memory step after each tool execution.
   */
  resultMemory: ResultMemoryStore;

  /** Results from each completed step, keyed by step ID */
  stepResults: Record<string, StepResult>;

  /** Accumulated token usage across all AI calls */
  tokenUsage: TokenUsage;

  /** Emit a streaming event to the client */
  emitEvent: (event: PipelineStreamEvent) => void;

  /** The final response text (set by synthesis/agentic loop steps) */
  responseText: string;

  /** Response metadata (preset, sources, etc.) */
  responseMetadata: Record<string, unknown>;

  /** Abort signal — set to true by any step to stop the pipeline */
  aborted: boolean;

  /** Arbitrary shared state that steps can read/write */
  shared: Record<string, unknown>;
}

export interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: string;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// STEP HANDLER INTERFACE (implemented by each step type)
// ============================================================================

/**
 * Result returned by a step handler after execution.
 */
export interface StepResult {
  /** Whether the step completed successfully */
  success: boolean;
  /** If true, the pipeline should stop after this step */
  abort?: boolean;
  /** Arbitrary output data from this step (available to subsequent steps via context.stepResults) */
  data?: Record<string, unknown>;
  /** Human-readable summary of what the step did (for traces) */
  summary?: string;
}

/**
 * Interface that all pipeline step handlers must implement.
 */
export interface StepHandler {
  /** The step type this handler is registered for */
  readonly type: PipelineStepType;

  /**
   * Execute the step.
   * @param config - Type-specific configuration from the PipelineStep
   * @param context - Mutable pipeline context
   * @param span - OpenTelemetry span for this step (may be a no-op span if tracing disabled)
   * @returns Result of the step execution
   */
  execute(
    config: Record<string, unknown>,
    context: PipelineContext,
    span: Span,
  ): Promise<StepResult>;

  /**
   * Optional fallback when the step fails and onFailure = 'fallback'.
   * If not implemented, the step is skipped on fallback.
   */
  fallback?(
    config: Record<string, unknown>,
    context: PipelineContext,
    error: Error,
  ): Promise<StepResult>;
}
