// src/features/pipeline/v2/v2.types.ts

/**
 * Deterministic Pipeline V2 — Types
 *
 * All shared types for the Plan-Execute-Synthesize pipeline.
 * See: docs/platform-evolution/DETERMINISTIC-PIPELINE-V2.md
 */

import type { PipelineStreamEvent, TokenUsage, ResultMemoryStore, ResultMemoryEntry } from '../pipeline.types';
import type { ToolParameterSchema } from '@/features/ai-service/ai-service.types';
import type { ToolDisplayConfig } from '@/db/schema/tools.schema';

// ============================================================================
// S2: CONTEXT ASSEMBLY
// ============================================================================

/**
 * Input to the Context Assembly module.
 * Provided by the pipeline orchestrator at turn start.
 */
export interface ContextAssemblyInput {
  sessionId: string;
  experienceId: string;
  userMessage: string;
  /** Pre-loaded experience with tool assignments */
  experience: {
    id: string;
    slug: string;
    providerId: string | null;
    modelId: number | null;
    personaConfig: {
      systemInstructions: string;
      businessDomains?: string[];
      tone?: string;
      name?: string;
      responseFormats?: {
        enabledPresets?: string[];
        defaultPreset?: string;
        maxResponseLength?: number;
        enableCitations?: boolean;
        citationStyle?: string;
      };
    };
    sessionConfig: {
      maxContextMessages?: number;
      summaryThreshold?: number;
      enableConversationSummary?: boolean;
      enableUserContext?: boolean;
    };
    tools: Array<{
      isEnabled: boolean;
      overrideAiDescription: string | null;
      tool: {
        id: string;
        name: string;
        slug: string;
        executorType: string;
        operation: string | null;
        aiDescription: string;
        inputSchema: Record<string, unknown> | null;
        isActive: boolean;
        dataSourceId: string | null;
        displayConfig: ToolDisplayConfig | null;
      };
    }>;
    mcpConnections?: Array<{
      isEnabled: boolean;
      enabledToolNames: string[] | null;
      mcpConnection: {
        id: string;
        slug: string;
        name: string;
        isActive: boolean;
        discoveredTools: {
          tools: Array<{
            name: string;
            description?: string;
            inputSchema?: Record<string, unknown>;
          }>;
        } | null;
      };
    }>;
  };
}

/**
 * Lightweight tool summary — name + description only.
 * Used in AI prompts where full schemas are unnecessary (e.g., Turn Planner).
 */
export interface ToolSummary {
  /** Tool slug (used as identifier in plans) */
  slug: string;
  /** Display name (e.g. "Product Search") */
  name: string;
  /** Human-readable description for AI context */
  description: string;
  /** Operation type (search, lookup, enumerate, etc.) */
  operation: string | null;
  /** Executor type (data_source, http, web_search, etc.) */
  executorType: string;
}

/**
 * Full tool definition with input schema.
 * Only used by Parameter Extraction (D2a) — one tool at a time.
 */
export interface ToolDefinitionV2 {
  slug: string;
  name: string;
  description: string;
  inputSchema: ToolParameterSchema;
  operation: string | null;
  executorType: string;
  dataSourceId: string | null;
  displayConfig: ToolDisplayConfig | null;
}

/**
 * Compact reference index for result memory.
 * Used in AI prompts so the planner can resolve "item 3", "that shirt", etc.
 */
export type ResultMemoryIndex = ResultMemoryEntry[];

/**
 * The assembled context for a conversation turn.
 * Produced by S2, consumed by downstream modules (D1, D2, D3, D4).
 * Each downstream module picks only the fields it needs.
 */
export interface TurnContext {
  // ── Always available ──────────────────────────────────────────────────
  userMessage: string;
  sessionId: string;
  experienceId: string;
  experienceSlug: string;

  /** Extracted session facts — key-value pairs like { budget: "$100" } */
  sessionFacts: Record<string, string>;

  /** Tool summaries — name + description only (no schemas) */
  availableTools: ToolSummary[];

  // ── Conditionally loaded ──────────────────────────────────────────────
  /** Recent conversation messages (sliding window) */
  conversationHistory: TurnContextMessage[];

  /** Compressed summary of older conversation history */
  conversationSummary: string | null;

  /** Reference index for resolving ordinal references ("item 2") */
  resultMemoryIndex: ResultMemoryIndex;

  /** Full result memory store (for D2d result capture) */
  resultMemory: ResultMemoryStore;

  /** Top relevant episodic memories (semantic retrieval) */
  episodicMemories: string[];

  /** Structured turn log — compact action history from previous turns */
  turnLog: TurnLogEntry[];

  // ── Raw data (not sent to AI by default) ──────────────────────────────
  /** Full tool definitions including inputSchemas — only D2a uses these */
  toolDefinitions: ToolDefinitionV2[];

  /** slug → tool UUID mapping for execution */
  toolSlugToId: Record<string, string>;

  /** slug → tool display name mapping for persistence */
  toolSlugToName: Record<string, string>;

  /** slug → display config mapping for preset rendering (null = no visual preset) */
  toolSlugToDisplayConfig: Record<string, ToolDisplayConfig>;

  // ── Session metadata (for post-turn triggers) ─────────────────────────
  /** Current session message count (before this turn) */
  sessionMessageCount: number;
  /** User ID from session context (for episodic memory) */
  userId: string | null;

  // ── Experience config (for downstream modules) ────────────────────────
  personaInstructions: string;
  businessDomain: string | null;
  providerId: string | null;
  modelId: number | null;
  /**
   * Rendered description of the fields behind this turn's tools, measured from real
   * documents. Null when no data source is attached or no schema has been discovered, in
   * which case the planner falls back to tool descriptions alone.
   */
  dataContext: string | null;

}

/**
 * A message in conversation history, simplified for turn context.
 */
export interface TurnContextMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: string;
}

// ============================================================================
// TURN LOG — compact action history for planner context
// ============================================================================

/**
 * A single entry in the structured turn log.
 * Built after each pipeline turn, persisted in pipelineState.
 * Used by the planner instead of raw conversation history.
 */
export interface TurnLogEntry {
  /** What the user said */
  userMessage: string;
  /** What the AI decided */
  decision: 'tool_use' | 'direct_response' | 'clarification';
  /** Tools used in this turn — records what ACTUALLY executed, not what was planned */
  toolsUsed: Array<{
    slug: string;
    /** What the planner intended */
    intent: string;
    /** The actual query that was executed (may differ from intent) */
    query: string | null;
    /** Number of results returned to the pipeline (not total index matches) */
    resultsReturned: number | null;
    success: boolean;
  }>;
  /** Response format selected */
  preset: string | null;
  /** Turn index within the session (1-based) */
  turnIndex: number;
}

// ============================================================================
// D1: TURN PLANNER
// ============================================================================

export interface TurnPlannerInput {
  userMessage: string;
  experienceId: string;
  conversationHistory: TurnContextMessage[];
  conversationSummary: string | null;
  /** Structured turn log — compact action history (preferred over conversationHistory when available) */
  turnLog: TurnLogEntry[];
  sessionFacts: Record<string, string>;
  resultMemoryIndex: ResultMemoryIndex;
  episodicMemories: string[];
  availableTools: ToolSummary[];
  personaInstructions: string;
  businessDomain: string | null;
  /**
   * Rendered field facts for the data behind this turn's tools — measured from real
   * documents, not declared. Null when nothing has been discovered, in which case the
   * planner works from tool descriptions alone as it always did.
   */
  dataContext?: string | null;
  /**
   * Whether personaInstructions is included in the planning prompt.
   * Controlled by ExecutionPolicy.includePersonaInPlanning; defaults to false,
   * which is the historical behavior (the field was threaded here and ignored).
   */
  includePersona?: boolean;
  /**
   * Outcomes of earlier planning rounds *within this turn*, oldest first.
   * Present only when re-planning. Without this the planner would repeat the
   * strategy that just failed.
   */
  previousRounds?: PlanningRoundSummary[];
}

/**
 * What a previous planning round tried and what came of it. Fed back into the
 * planner so a re-plan is informed rather than a blind retry.
 */
export interface PlanningRoundSummary {
  /** 1-based round index. */
  round: number;
  /** Tools attempted, with the query used and what came back. */
  attempts: Array<{
    toolSlug: string;
    intent: string;
    query: string | null;
    success: boolean;
    resultCount: number;
    error?: string;
  }>;
  /** Assessment verdict for the round (see planning-assessment.ts). */
  verdict: string;
  /** One-line explanation of why the round was judged unusable. */
  reason: string;
}

export interface TurnPlan {
  actions: PlannedAction[];
  reasoning: string;
  directResponse: boolean;
  needsClarification: boolean;
  clarificationQuestion: string | null;
  confidence: number;
}

export interface PlannedAction {
  toolSlug: string;
  intent: string;
  /** JSON-encoded hints (string in AI schema, parsed by backend) */
  hints: Record<string, unknown>;
  dependsOnPrevious: boolean;
}

// ============================================================================
// D2: EXECUTION LOOP
// ============================================================================

export interface ExecutionLoopInput {
  plan: TurnPlan;
  turnContext: TurnContext;
  config: {
    executionBatchSize: number;
    maxRetriesPerAction: number;
    /**
     * Correlates every tool execution in this turn for analytics, and links the
     * analytics rows to the turn's trace.
     */
    turnRequestId: string;
  };
  emit: (event: PipelineStreamEvent) => void;
}

export interface ExecutionLoopResult {
  executedActions: ActionResult[];
  remainingActions: PlannedAction[];
  aborted: boolean;
  summary: string;
}

export interface ActionResult {
  toolSlug: string;
  toolId: string;
  toolName: string;
  intent: string;
  parameters: Record<string, unknown>;
  result: ToolExecutionResultV2;
  durationMs: number;
  /**
   * Constraints abandoned by zero-result retry, if any. Surfaced to synthesis so
   * the answer can say what it could not honor instead of silently returning
   * results that do not match the request.
   */
  relaxation?: { droppedFilters: string[]; droppedAll: boolean };

  /**
   * True when a tool relaxed something it cannot express as a dropped filter.
   *
   * `relaxation` above covers the filter case and names what went; this covers the rest —
   * the knowledge base widening its relevance cutoff when a strict pass finds nothing, for
   * instance, which is invisible to a parameter diff and has no filter to name.
   *
   * Either one means the same thing to the reader of the answer: these results are looser
   * than what was asked for, and saying so is the difference between a narrowed search and
   * a broken filter.
   */
  constraintsRelaxed?: boolean;
}

export interface ToolExecutionResultV2 {
  success: boolean;
  data: unknown;
  resultCount?: number;
  error?: string;
}

// ============================================================================
// D2a: PARAMETER EXTRACTION
// ============================================================================

export interface ParamExtractionInput {
  userMessage: string;
  action: PlannedAction;
  toolInputSchema: ToolParameterSchema;
  resultMemoryIndex: ResultMemoryIndex;
  previousActionResults?: ActionResult[];
  validationErrors?: ValidationError[];
  /** Enriched parameter context — field constraints with known valid values */
  parameterContext?: import('./parameter-context.types').ParameterContext;
  /** Annotations about planner hints that were removed (field not in schema, etc.) */
  hintAnnotations?: string[];
}

export interface ParamExtractionResult {
  parameters: Record<string, unknown>;
}

// ============================================================================
// D2b: PARAMETER VALIDATION
// ============================================================================

export interface ParamValidationInput {
  parameters: Record<string, unknown>;
  inputSchema: ToolParameterSchema;
}

export interface ParamValidationResult {
  valid: boolean;
  parameters: Record<string, unknown>;
  errors: ValidationError[];
}

export interface ValidationError {
  field: string;
  message: string;
  expected?: string;
  received?: unknown;
}

// ============================================================================
// D3: RESPONSE SYNTHESIS
// ============================================================================

export type ResponsePreset =
  | 'rich_text'
  | 'single_card'
  | 'item_grid'
  | 'item_list'
  | 'comparison_table'
  | 'step_list'
  | 'summary_with_sources';

export interface SynthesisInput {
  userMessage: string;
  experienceId: string;
  actionResults: ActionResult[];
  remainingActions: PlannedAction[];
  personaConfig: {
    name?: string;
    tone?: string;
    systemInstructions: string;
    responseFormats?: {
      enabledPresets?: string[];
      defaultPreset?: string;
      maxResponseLength?: number;
      enableCitations?: boolean;
      citationStyle?: string;
    };
  };
  plan: TurnPlan;
  directResponse: boolean;
  clarificationQuestion?: string;
  /** slug → display config for tools that have visual rendering configs */
  toolSlugToDisplayConfig?: Record<string, ToolDisplayConfig>;
}

export interface SynthesisResult {
  responseText: string;
  preset: ResponsePreset;
  /** Self-contained preset payload — items + display config for frontend rendering */
  presetPayload?: PresetPayload;
  responseMetadata: {
    sources?: string[];
    suggestedActions?: string[];
  };
  /** Debug info explaining why this preset was selected */
  presetDebug?: {
    enabledPresets: string[];
    itemCount: number;
    visualGroupCount: number;
    reason: string;
    toolSlug?: string;
    toolPreferredPresets?: string[];
  };
}

/**
 * Self-contained preset data emitted to the frontend.
 * Contains everything needed to render a visual preset — no external lookups.
 */
export interface PresetPayload {
  /** Result items with their raw field data */
  items: Array<{ id?: string; fields: Record<string, unknown> }>;
  /** Display config from the source tool — maps fields to semantic roles */
  displayConfig: ToolDisplayConfig;
}

// ============================================================================
// D4: PERSISTENCE
// ============================================================================

export interface PersistenceInput {
  sessionId: string;
  userMessage: string;
  synthesisResult: SynthesisResult;
  actionResults: ActionResult[];
  resultMemory: ResultMemoryStore;
  sessionFacts: Record<string, string>;
  tokenUsage: TokenUsage;
  /** Updated turn log including this turn's entry */
  turnLog: TurnLogEntry[];
}

// ============================================================================
// MODULE PATTERN — shared interface for all V2 modules
// ============================================================================

/**
 * Dependencies injected into a module.
 * In production: real services. In tests: mocks.
 */
export interface ModuleDeps {
  [key: string]: unknown;
}

/**
 * Standard output envelope for all V2 modules.
 */
export interface ModuleResult<T> {
  success: boolean;
  data?: T;
  abort?: boolean;
  summary: string;
  durationMs: number;
}
