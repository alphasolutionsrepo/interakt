// src/features/pipeline/v2/parameter-context.types.ts

/**
 * Parameter Context Enrichment — Types
 *
 * Generic interface for enriching parameter extraction with real data.
 * Each tool type can register a provider that resolves valid values
 * for constrained parameters (e.g., facet values for search filters,
 * valid field names for enumerate, enum values from API schemas).
 *
 * This is the abstraction layer that keeps the execution loop generic
 * while allowing tool-type-specific enrichment logic.
 */

import type { ToolDefinitionV2 } from './v2.types';

// ============================================================================
// FIELD CONSTRAINT — describes valid values for a single parameter/field
// ============================================================================

/**
 * A constraint on a parameter field's valid values.
 * Used to ground the AI param extractor with real data.
 */
export interface FieldConstraint {
  /** The field name (e.g., "category", "season") */
  fieldName: string;
  /** The field's data type in the source system */
  fieldType: 'text' | 'number' | 'boolean' | 'date';
  /** Whether this field can be used as a filter */
  isFilterable: boolean;
  /** Whether this field supports value enumeration */
  isFacetable: boolean;
  /** Known valid values (populated from facets/enums). Empty if not resolvable. */
  validValues: string[];
  /** The hint value from the planner (what the AI guessed) */
  hintValue?: unknown;
}

// ============================================================================
// PARAMETER CONTEXT — the enrichment result passed to param extraction
// ============================================================================

/**
 * Additional context about valid parameter values.
 * Produced by a ParameterContextProvider, consumed by param extraction.
 */
export interface ParameterContext {
  /** Constraints per field — keyed by field name for fast lookup */
  fieldConstraints: Record<string, FieldConstraint>;
  /** Whether any enrichment was applied (false = provider skipped or no-op) */
  enriched: boolean;
  /** Human-readable summary for tracing */
  summary: string;
  /** Time taken to resolve context (ms) */
  durationMs: number;
}

/** Empty context — used when no provider applies or enrichment is skipped */
export const EMPTY_PARAMETER_CONTEXT: ParameterContext = {
  fieldConstraints: {},
  enriched: false,
  summary: 'No enrichment needed',
  durationMs: 0,
};

// ============================================================================
// PROVIDER INTERFACE — implemented per executor type
// ============================================================================

/**
 * Strategy interface for resolving parameter context per tool type.
 *
 * Implementations:
 *   - DataSourceSearchProvider: resolves facet values for filterable fields
 *   - (future) HttpApiProvider: resolves enum values from API schema
 *   - (future) DataSourceEnumerateProvider: resolves valid field names
 *
 * Providers are stateless — caching is handled by the facet cache layer.
 */
export interface ParameterContextProvider {
  /**
   * Check if this provider can enrich the given tool's parameters.
   * Should be fast — no I/O, just type/operation checks.
   */
  canEnrich(tool: ToolDefinitionV2): boolean;

  /**
   * Resolve valid values for the tool's constrained parameters.
   * Uses planner hints to determine which fields to resolve.
   *
   * @param tool - The full tool definition (includes dataSourceId, executorType, etc.)
   * @param hints - The planner's rough parameter hints
   * @returns Parameter context with resolved field constraints
   */
  resolve(
    tool: ToolDefinitionV2,
    hints: Record<string, unknown>,
  ): Promise<ParameterContext>;
}

// ============================================================================
// FILTER VALIDATION RESULT — output of post-extraction filter validation
// ============================================================================

/**
 * Result of validating extracted filter parameters against known constraints.
 */
export interface FilterValidationResult {
  /** The validated/corrected filters */
  filters: Array<{ field: string; operator: string; value: unknown }>;
  /** Filters that were dropped because values couldn't be resolved */
  droppedFilters: Array<{
    field: string;
    reason: string;
    originalValue: unknown;
  }>;
  /** Whether any filters were modified or dropped */
  hasCorrections: boolean;
  /** Human-readable summary */
  summary: string;
}
