// src/features/pipeline/v2/index.ts

/**
 * Deterministic Pipeline V2 — Public API
 *
 * Entry point for all V2 pipeline modules.
 * Import from here — not from individual module files.
 */

// Types
export type {
  TurnContext,
  TurnContextMessage,
  ToolSummary,
  ToolDefinitionV2,
  ResultMemoryIndex,
  ContextAssemblyInput,
  TurnPlannerInput,
  TurnPlan,
  PlannedAction,
  ExecutionLoopInput,
  ExecutionLoopResult,
  ActionResult,
  ToolExecutionResultV2,
  ParamExtractionInput,
  ParamExtractionResult,
  ParamValidationInput,
  ParamValidationResult,
  ValidationError,
  ResponsePreset,
  SynthesisInput,
  SynthesisResult,
  PersistenceInput,
  ModuleResult,
} from './v2.types';

// D1: Turn Planner
export {
  planTurn,
  createProductionTurnPlannerDeps,
} from './turn-planner';
export type {
  ChatFn,
  TurnPlannerDeps,
  TurnPlannerConfig,
} from './turn-planner';

// Pipeline Orchestrator
export {
  runV2Pipeline,
  createProductionV2Deps,
} from './orchestrator';
export type {
  V2PipelineInput,
  V2PipelineResult,
  V2PipelineDeps,
  V2PipelineConfig,
} from './orchestrator';

// D4: Persistence
export {
  persistTurn,
  createProductionPersistenceDeps,
} from './persistence';
export type {
  PersistenceDeps,
} from './persistence';

// D3: Response Synthesis
export {
  synthesizeResponse,
  createProductionSynthesisDeps,
} from './response-synthesis';
export type {
  SynthesisDeps,
  SynthesisConfig,
} from './response-synthesis';

// D2: Execution Loop
export {
  executeLoop,
  createProductionExecutionLoopDeps,
} from './execution-loop';
export type {
  ToolExecutorFn,
  ExecutionLoopDeps,
} from './execution-loop';

// D2b: Parameter Validation
export { validateParameters, validateFilters } from './param-validation';

// Parameter Context Enrichment
export { resolveParameterContext, getProviderForTool } from './parameter-context.provider';
export type {
  ParameterContextProvider,
  ParameterContext,
  FieldConstraint,
  FilterValidationResult,
} from './parameter-context.types';
export { EMPTY_PARAMETER_CONTEXT } from './parameter-context.types';

// Facet Cache
export { FacetCache, getGlobalFacetCache } from './facet-cache';

// D2a: Parameter Extraction
export {
  extractParameters,
  createProductionParamExtractionDeps,
} from './param-extraction';
export type {
  ParamExtractionDeps,
  ParamExtractionConfig,
} from './param-extraction';

// S2: Context Assembly
export {
  assembleContext,
  createProductionSessionLoader,
  createProductionEpisodicMemoryLoader,
} from './context-assembly';
export type {
  SessionLoader,
  SessionData,
  EpisodicMemoryLoader,
  ContextAssemblyDeps,
  ContextAssemblyConfig,
} from './context-assembly';
