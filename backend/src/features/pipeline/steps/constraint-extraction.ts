// src/features/pipeline/steps/constraint-extraction.ts

/**
 * Constraint Extraction Step (Structured Pipeline)
 *
 * Validates and normalizes constraints extracted by intent detection
 * against the actual data source fields. Maps text values to canonical
 * values using field metadata.
 *
 * Learnings from old pipeline:
 * - Validate field names exist in filterable fields
 * - Map text values to canonical (e.g., "red" → "Red")
 * - Numeric fields just validate format, skip mapping
 * - Drop invalid constraints rather than erroring
 * - Carry forward constraints from previous turns when refining
 */

import type { Span } from '@opentelemetry/api';
import type { StepHandler, PipelineContext, StepResult } from '../pipeline.types';
import type { DetectedIntent } from './intent-detection';

// ============================================================================
// TYPES
// ============================================================================

export interface ValidatedConstraint {
  field: string;
  operator: string;
  value: unknown;
  /** Whether this was carried forward from a previous turn */
  carriedForward?: boolean;
}

interface DroppedConstraint {
  field: string;
  operator: string;
  value: unknown;
  reason: string;
}

interface ConstraintExtractionConfig {
  /** Available filterable fields from data source(s) */
  filterableFields?: Array<{
    name: string;
    type: string;
    values?: string[];
  }>;
  /** Whether to carry forward constraints from previous turns on refine */
  carryForwardOnRefine?: boolean;
}

// ============================================================================
// STEP HANDLER
// ============================================================================

export const constraintExtractionHandler: StepHandler = {
  type: 'constraint_extraction',

  async execute(
    config: Record<string, unknown>,
    ctx: PipelineContext,
    span: Span,
  ): Promise<StepResult> {
    const cfg = config as unknown as ConstraintExtractionConfig;
    const intentResult = ctx.stepResults[findIntentStepId(ctx)]?.data as
      | { intent: DetectedIntent }
      | undefined;

    if (!intentResult?.intent) {
      return {
        success: true,
        data: { validConstraints: [], droppedConstraints: [] },
        summary: 'No intent data available',
      };
    }

    const { intent } = intentResult;
    const rawConstraints = intent.constraints ?? [];
    const filterableFields = cfg.filterableFields ?? (ctx.shared.filterableFields as ConstraintExtractionConfig['filterableFields']) ?? [];

    // Carry forward previous constraints on refine actions
    let carriedConstraints: ValidatedConstraint[] = [];
    if (
      intent.action === 'refine' &&
      (cfg.carryForwardOnRefine ?? true)
    ) {
      carriedConstraints = (ctx.shared.activeConstraints as ValidatedConstraint[] | undefined) ?? [];
    }

    const validConstraints: ValidatedConstraint[] = [...carriedConstraints.map(c => ({ ...c, carriedForward: true }))];
    const droppedConstraints: DroppedConstraint[] = [];

    for (const raw of rawConstraints) {
      const field = filterableFields.find(
        f => f.name.toLowerCase() === raw.field.toLowerCase(),
      );

      if (!field) {
        droppedConstraints.push({ ...raw, reason: `Unknown field: ${raw.field}` });
        continue;
      }

      // Numeric fields: validate format
      if (isNumericType(field.type)) {
        const numValue = Number(raw.value);
        if (isNaN(numValue)) {
          droppedConstraints.push({ ...raw, reason: `Invalid numeric value for ${field.name}` });
          continue;
        }
        validConstraints.push({
          field: field.name,
          operator: raw.operator,
          value: numValue,
        });
        continue;
      }

      // Boolean fields
      if (field.type === 'boolean') {
        const boolValue = parseBooleanValue(raw.value);
        if (boolValue === null) {
          droppedConstraints.push({ ...raw, reason: `Invalid boolean value for ${field.name}` });
          continue;
        }
        validConstraints.push({
          field: field.name,
          operator: 'eq',
          value: boolValue,
        });
        continue;
      }

      // Text/keyword fields: map to canonical value if mappings available
      if (field.values?.length) {
        const canonical = findCanonicalValue(String(raw.value), field.values);
        if (!canonical) {
          droppedConstraints.push({ ...raw, reason: `No matching value for "${raw.value}" in ${field.name}` });
          continue;
        }
        validConstraints.push({
          field: field.name,
          operator: raw.operator,
          value: canonical,
        });
        continue;
      }

      // No mappings — pass through as-is
      validConstraints.push({
        field: field.name,
        operator: raw.operator,
        value: raw.value,
      });
    }

    // Update shared state for next turn
    ctx.shared.activeConstraints = validConstraints.filter(c => !c.carriedForward);

    span.setAttribute('constraints.valid_count', validConstraints.length);
    span.setAttribute('constraints.dropped_count', droppedConstraints.length);

    return {
      success: true,
      data: { validConstraints, droppedConstraints },
      summary: `${validConstraints.length} valid, ${droppedConstraints.length} dropped`,
    };
  },
};

// ============================================================================
// HELPERS
// ============================================================================

function findIntentStepId(ctx: PipelineContext): string {
  // Find the first intent_detection step result
  for (const [stepId, result] of Object.entries(ctx.stepResults)) {
    if (result.data && 'intent' in result.data) return stepId;
  }
  return 'intent_detection';
}

function isNumericType(type: string): boolean {
  return ['number', 'integer', 'float', 'decimal', 'price'].includes(type.toLowerCase());
}

function parseBooleanValue(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  const str = String(value).toLowerCase();
  if (['true', 'yes', '1', 'on'].includes(str)) return true;
  if (['false', 'no', '0', 'off'].includes(str)) return false;
  return null;
}

function findCanonicalValue(input: string, values: string[]): string | null {
  const lower = input.toLowerCase();
  // Exact match (case-insensitive)
  const exact = values.find(v => v.toLowerCase() === lower);
  if (exact) return exact;
  // Partial match — value contains input or input contains value
  const partial = values.find(
    v => v.toLowerCase().includes(lower) || lower.includes(v.toLowerCase()),
  );
  return partial ?? null;
}
