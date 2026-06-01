// src/features/pipeline/v2/action-steps/context-enrichment.step.ts

/**
 * Context Enrichment Step — resolves parameter context and sanitizes planner hints.
 *
 * Two responsibilities:
 * 1. ENRICH — for hint keys that match real fields, fetch valid values (facets)
 *    so the param extractor can ground AI output in real data.
 * 2. ANNOTATE — for hint keys that DON'T match any field, strip them from
 *    structured hints and produce clear annotations explaining what was removed
 *    and what fields are actually available. These annotations are injected into
 *    the param extraction prompt so the AI knows what was attempted and why it
 *    was dropped.
 *
 * Only runs for tools with a registered ParameterContextProvider (currently
 * data_source:search). Other tool types skip this step via the chain factory.
 */

import { createLogger } from '@/shared/logger/logger';
import { resolveParameterContext } from '../parameter-context.provider';
import { EMPTY_PARAMETER_CONTEXT } from '../parameter-context.types';
import type { ActionStep, ActionStepContext, ActionStepDeps, ActionStepResult } from './action-step.types';

const logger = createLogger('v2:step:context-enrichment');

export class ContextEnrichmentStep implements ActionStep {
  readonly id = 'context_enrichment' as const;
  readonly name = 'Context enrichment';

  async execute(ctx: ActionStepContext, _deps: ActionStepDeps): Promise<ActionStepResult> {
    const start = Date.now();
    const hints = ctx.action.hints;

    if (!hints || Object.keys(hints).length === 0) {
      return {
        success: true,
        context: {
          ...ctx,
          paramContext: EMPTY_PARAMETER_CONTEXT,
          sanitizedHints: {},
          hintAnnotations: [],
        },
        summary: 'No hints to resolve',
        durationMs: Date.now() - start,
      };
    }

    try {
      // 1. Resolve parameter context (fetch valid values for matching fields)
      const paramContext = await resolveParameterContext(ctx.toolDef, hints);

      // 2. Sanitize hints: strip keys that don't match any field in the schema
      const { sanitizedHints, annotations } = sanitizeHints(hints, paramContext, ctx.toolDef);

      const durationMs = Date.now() - start;

      if (annotations.length > 0) {
        logger.info('Hints sanitized — invalid keys removed', {
          toolSlug: ctx.action.toolSlug,
          removed: annotations.length,
          annotations,
        });
      }

      const summaryParts: string[] = [];
      if (paramContext.enriched) {
        summaryParts.push(paramContext.summary);
      }
      if (annotations.length > 0) {
        summaryParts.push(`Removed ${annotations.length} invalid hint(s)`);
      }
      if (summaryParts.length === 0) {
        summaryParts.push(paramContext.summary || 'No enrichment needed');
      }

      // Build span attributes for trace viewer detail
      const spanAttributes: Record<string, string | number | boolean> = {};
      if (annotations.length > 0) {
        spanAttributes['alpha.v2.step.removed_hints'] = JSON.stringify(annotations);
      }
      if (Object.keys(sanitizedHints).length > 0) {
        spanAttributes['alpha.v2.step.sanitized_hints'] = JSON.stringify(sanitizedHints);
      }
      if (paramContext.enriched) {
        const constraintSummary = Object.entries(paramContext.fieldConstraints)
          .filter(([, c]) => c.validValues.length > 0)
          .map(([k, c]) => `${k}: ${c.validValues.slice(0, 5).join(', ')}${c.validValues.length > 5 ? '...' : ''}`)
          .join('; ');
        if (constraintSummary) {
          spanAttributes['alpha.v2.step.enriched_fields'] = constraintSummary;
        }
      }

      return {
        success: true,
        context: {
          ...ctx,
          paramContext,
          sanitizedHints,
          hintAnnotations: annotations,
        },
        summary: summaryParts.join('. '),
        durationMs,
        spanAttributes,
      };
    } catch (error) {
      // Enrichment failure is non-fatal — proceed with original hints and no context
      const err = error instanceof Error ? error : new Error(String(error));
      const durationMs = Date.now() - start;

      logger.warn('Context enrichment failed, proceeding without', {
        toolSlug: ctx.action.toolSlug,
        error: err.message,
      });

      return {
        success: true,
        context: {
          ...ctx,
          paramContext: EMPTY_PARAMETER_CONTEXT,
          sanitizedHints: hints,
          hintAnnotations: [],
        },
        summary: `Enrichment failed: ${err.message}`,
        durationMs,
      };
    }
  }
}

// ============================================================================
// HINT SANITIZATION
// ============================================================================

/**
 * Sanitize planner hints by removing keys that don't correspond to any
 * field in the data source schema. Produces annotations for each removal
 * so the param extractor knows what was attempted and why it was dropped.
 */
function sanitizeHints(
  hints: Record<string, unknown>,
  paramContext: import('../parameter-context.types').ParameterContext,
  toolDef: import('../v2.types').ToolDefinitionV2,
): { sanitizedHints: Record<string, unknown>; annotations: string[] } {
  const sanitizedHints: Record<string, unknown> = {};
  const annotations: string[] = [];

  // Get all known field names from tool input schema
  const schemaFields = new Set(Object.keys(toolDef.inputSchema.properties));

  // Get field names from enricher's resolved constraints (data source fields)
  const enrichedFields = new Set(Object.keys(paramContext.fieldConstraints));

  // Collect available filterable field names for annotation context.
  // The enricher now always includes all filterable fields in fieldConstraints
  // (not just hint-matched ones), so this list is always complete.
  const filterableFields = Object.entries(paramContext.fieldConstraints)
    .filter(([, c]) => c.isFilterable)
    .map(([name]) => name);

  for (const [key, value] of Object.entries(hints)) {
    // A hint key is valid if it matches:
    // 1. A top-level tool schema field (query, filters, sort) — keep always
    // 2. A field in the data source that the enricher found — keep always
    if (schemaFields.has(key) || enrichedFields.has(key)) {
      sanitizedHints[key] = value;
    } else {
      // This hint key doesn't match any known field — remove it and annotate
      const available = filterableFields.length > 0
        ? `Available filterable fields: ${filterableFields.join(', ')}`
        : 'No filterable fields available';

      annotations.push(
        `Removed hint '${key}=${JSON.stringify(value)}': field '${key}' does not exist in the data source schema. ${available}.`
      );
    }
  }

  return { sanitizedHints, annotations };
}

// Exported for testing
export { sanitizeHints as _sanitizeHints };
