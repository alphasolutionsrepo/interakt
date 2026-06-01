// src/features/pipeline/steps/index.ts

/**
 * Pipeline Step Handlers — Registration Entry Point
 *
 * Import this module to register all step handlers with the step registry.
 * This should be called once at application startup.
 */

import { registerStepHandler } from '../step-registry';

// Step handlers
import { inputGuardrailHandler } from './input-guardrail';
import { outputGuardrailHandler } from './output-guardrail';
import { intentDetectionHandler } from './intent-detection';
import { constraintExtractionHandler } from './constraint-extraction';
import { validationHandler } from './validation';
import { toolExecutionHandler } from './tool-execution';
import { responseSynthesisHandler } from './response-synthesis';
import { agenticLoopHandler } from './agentic-loop';
// New deterministic pipeline steps
import { toolGroupSelectionHandler } from './tool-group-selection';
import { toolSelectionHandler } from './tool-selection';
import { paramValidationHandler } from './param-validation';
import { resultMemoryHandler } from './result-memory';
// Cross-session memory (Sprint 5)
import { episodicMemoryHandler } from './episodic-memory';

// Re-export types that other modules need
export type { DetectedIntent, IntentAction } from './intent-detection';
export type { ValidatedConstraint } from './constraint-extraction';
export type { ExecutionFacts } from './tool-execution';
export type { ToolGroupSelectionResult } from './tool-group-selection';
export type { ToolSelectionResult } from './tool-selection';

/**
 * Register all built-in step handlers.
 * Call this once at app startup before any pipeline execution.
 */
export function registerAllStepHandlers(): void {
  // Shared steps (both pipeline modes)
  registerStepHandler(inputGuardrailHandler);
  registerStepHandler(outputGuardrailHandler);

  // Legacy deterministic pipeline steps (intent-detection-based, kept for backward compat)
  registerStepHandler(intentDetectionHandler);
  registerStepHandler(constraintExtractionHandler);
  registerStepHandler(validationHandler);

  // Current deterministic pipeline steps (tool-selection-based)
  registerStepHandler(toolGroupSelectionHandler);
  registerStepHandler(toolSelectionHandler);
  registerStepHandler(paramValidationHandler);
  registerStepHandler(resultMemoryHandler);

  // Shared execution + synthesis
  registerStepHandler(toolExecutionHandler);
  registerStepHandler(responseSynthesisHandler);

  // Agentic pipeline steps
  registerStepHandler(agenticLoopHandler);

  // Cross-session memory (Sprint 5)
  registerStepHandler(episodicMemoryHandler);
}
