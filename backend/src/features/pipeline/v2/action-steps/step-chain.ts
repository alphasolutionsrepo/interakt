// src/features/pipeline/v2/action-steps/step-chain.ts

/**
 * Step Chain Factory — builds tool-type-aware action step chains.
 *
 * Different tool types need different sub-steps:
 * - Search tools: enrichment, extraction, filter validation, execution, retry, capture
 * - Lookup/HTTP/MCP tools: extraction, execution, capture
 *
 * The chain is built from the tool's executorType + operation and can be
 * customized per-experience via ActionStepChainConfig.stepOverrides.
 */

import type { ToolDefinitionV2 } from '../v2.types';
import type { ActionStep, ActionStepChainConfig } from './action-step.types';
import { ContextEnrichmentStep } from './context-enrichment.step';
import { ParamExtractionStep } from './param-extraction.step';
import { FilterValidationStep } from './filter-validation.step';
import { ToolExecutionStep } from './tool-execution.step';
import { ZeroResultRetryStep } from './zero-result-retry.step';
import { ResultCaptureStep } from './result-capture.step';

// ============================================================================
// CHAIN TEMPLATES BY TOOL TYPE
// ============================================================================

/** Full chain for data_source:search — all sub-steps including search-specific ones. */
function searchChain(): ActionStep[] {
  return [
    new ContextEnrichmentStep(),
    new ParamExtractionStep(),
    new FilterValidationStep(),
    new ToolExecutionStep(),
    new ZeroResultRetryStep(),
    new ResultCaptureStep(),
  ];
}

/** Minimal chain for tools that don't need enrichment or filter validation. */
function defaultChain(): ActionStep[] {
  return [
    new ParamExtractionStep(),
    new ToolExecutionStep(),
    new ResultCaptureStep(),
  ];
}

// ============================================================================
// CHAIN FACTORY
// ============================================================================

/**
 * Build the action step chain for a given tool.
 *
 * The chain is determined by the tool's executorType and operation,
 * then filtered by per-step overrides from the experience config.
 */
export function buildStepChain(
  toolDef: ToolDefinitionV2,
  chainConfig?: ActionStepChainConfig,
): ActionStep[] {
  // Select base chain by tool type
  const isSearch = toolDef.executorType === 'data_source' && toolDef.operation === 'search';
  const chain = isSearch ? searchChain() : defaultChain();

  // Apply per-step overrides (disable specific steps)
  if (chainConfig?.stepOverrides) {
    return chain.filter((step) => {
      const override = chainConfig.stepOverrides?.[step.id];
      // Steps are enabled by default — only filter out explicitly disabled ones
      return override?.enabled !== false;
    });
  }

  return chain;
}

/**
 * Get the tool type key for config lookup.
 * Format: "executorType:operation" or just "executorType" when no operation.
 */
export function getToolTypeKey(toolDef: ToolDefinitionV2): string {
  return toolDef.operation
    ? `${toolDef.executorType}:${toolDef.operation}`
    : toolDef.executorType;
}
