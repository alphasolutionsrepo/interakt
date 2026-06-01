// src/features/pipeline/steps/param-validation.ts

/**
 * Parameter Validation Step (Deterministic Pipeline)
 *
 * Validates the parameters extracted by tool_selection against the selected
 * tool's inputSchema before the tool executor runs.
 *
 * Why this step exists:
 * - Tool executors should receive valid input or not run at all.
 * - Catching type errors and missing required fields here — not inside the
 *   executor — means the failure point is always clear in the trace.
 * - On failure: re-prompt the AI once with the validation errors.
 *   If still invalid after one retry, route to clarification.
 *
 * Input (from ctx.stepResults['tool-selection'].data):
 *   { toolSlug, toolId, parameters, isDirectResponse }
 *
 * Output:
 *   { valid: true, parameters } — validated (possibly coerced) parameters
 *   { valid: false, errors, clarificationQuestion } — aborts pipeline
 */

import type { Span } from '@opentelemetry/api';
import { streamChat } from '@/features/ai-service/ai-service.service';
import type { ChatMessage, ToolDefinition, ResponseFormat } from '@/features/ai-service/ai-service.types';
import type { StepHandler, PipelineContext, StepResult } from '../pipeline.types';
import type { ToolSelectionResult } from './tool-selection';

// ============================================================================
// TYPES
// ============================================================================

interface ValidationError {
  field: string;
  message: string;
}

interface ParamValidationConfig {
  /** Max re-extraction attempts on validation failure (default: 1) */
  maxRetries?: number;
  /** AI provider for re-extraction */
  providerId?: string;
  modelId?: number;
}

// ============================================================================
// STEP HANDLER
// ============================================================================

export const paramValidationHandler: StepHandler = {
  type: 'param_validation',

  async execute(
    config: Record<string, unknown>,
    ctx: PipelineContext,
    span: Span,
  ): Promise<StepResult> {
    const cfg = config as unknown as ParamValidationConfig;

    // Read selection result from previous step
    const selectionData = ctx.stepResults['tool-selection']?.data as unknown as ToolSelectionResult | undefined;

    if (!selectionData) {
      // tool-selection step didn't run or was skipped
      return { success: true, summary: 'No tool selected — skipping param validation' };
    }

    // Direct response or no tool selected — nothing to validate
    if (selectionData.isDirectResponse || !selectionData.toolSlug) {
      return { success: true, summary: 'No tool selected — skipping param validation' };
    }

    // Get the tool's inputSchema from shared context
    const toolDefinitions = ctx.shared.toolDefinitions as ToolDefinition[] | undefined ?? [];
    const toolDef = toolDefinitions.find(t => t.name === selectionData.toolSlug);

    if (!toolDef) {
      span.setAttribute('param_validation.tool_not_found', selectionData.toolSlug);
      return {
        success: false,
        summary: `Tool definition not found for slug: ${selectionData.toolSlug}`,
      };
    }

    // If no inputSchema defined, skip validation — executor handles it
    if (!toolDef.parameters || Object.keys(toolDef.parameters).length === 0) {
      span.setAttribute('param_validation.skipped', 'no_schema');
      return {
        success: true,
        data: { valid: true, parameters: selectionData.parameters },
        summary: 'No input schema — skipping validation',
      };
    }

    const maxRetries = cfg.maxRetries ?? 1;
    let parameters = selectionData.parameters;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const errors = validateParameters(parameters, toolDef.parameters as unknown as Record<string, unknown>);

      if (errors.length === 0) {
        span.setAttribute('param_validation.valid', true);
        span.setAttribute('param_validation.attempts', attempt + 1);

        // Write validated parameters back to shared context so tool_execution can read them
        ctx.shared.validatedParameters = parameters;

        return {
          success: true,
          data: { valid: true, parameters },
          summary: `Parameters valid${attempt > 0 ? ` (after ${attempt} retry)` : ''}`,
        };
      }

      span.setAttribute('param_validation.errors', errors.map(e => e.field).join(','));

      if (attempt < maxRetries) {
        // Re-prompt the AI with the validation errors
        parameters = await reExtractParameters(ctx, cfg, toolDef, parameters, errors);
        continue;
      }

      // All retries exhausted — route to clarification
      const errorSummary = errors.map(e => `${e.field}: ${e.message}`).join('; ');
      const clarification = "I couldn't extract all the details needed. Could you provide more information?";

      ctx.responseText = clarification;
      ctx.emitEvent({ type: 'content', text: clarification });

      return {
        success: true,
        abort: true,
        data: { valid: false, errors, parameters },
        summary: `Validation failed after ${maxRetries + 1} attempts: ${errorSummary}`,
      };
    }

    // Should never reach here
    return { success: true, data: { valid: true, parameters }, summary: 'Parameters valid' };
  },
};

// ============================================================================
// VALIDATION LOGIC
// ============================================================================

/**
 * Validate parameters against a JSON Schema (subset — required fields and basic types).
 * We deliberately keep this lightweight: tool executors do full validation internally.
 * This step catches obvious issues (missing required fields, wrong types) before
 * spending tokens on a tool call that will definitely fail.
 */
function validateParameters(
  parameters: Record<string, unknown>,
  schema: Record<string, unknown>,
): ValidationError[] {
  const errors: ValidationError[] = [];

  const properties = schema.properties as Record<string, { type?: string | string[] }> | undefined;
  const required = schema.required as string[] | undefined;

  if (!properties) return errors;

  // Check required fields
  for (const field of (required ?? [])) {
    const value = parameters[field];
    if (value === undefined || value === null || value === '') {
      errors.push({ field, message: 'Required field is missing or empty' });
    }
  }

  // Check types for present fields
  for (const [field, value] of Object.entries(parameters)) {
    if (value === undefined || value === null) continue;
    const fieldSchema = properties[field];
    if (!fieldSchema?.type) continue;

    const expectedTypes = Array.isArray(fieldSchema.type) ? fieldSchema.type : [fieldSchema.type];
    const actualType = Array.isArray(value) ? 'array' : typeof value;

    if (!expectedTypes.includes(actualType) && !expectedTypes.includes('null')) {
      errors.push({
        field,
        message: `Expected type ${expectedTypes.join(' | ')}, got ${actualType}`,
      });
    }
  }

  return errors;
}

// ============================================================================
// RE-EXTRACTION
// ============================================================================

const REEXTRACT_RESPONSE_FORMAT: ResponseFormat = {
  type: 'json_schema',
  json_schema: {
    name: 'parameter_reextraction',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        parameters: {
          type: 'object',
          additionalProperties: {},
        },
      },
      required: ['parameters'],
      additionalProperties: false,
    },
  },
};

async function reExtractParameters(
  ctx: PipelineContext,
  cfg: ParamValidationConfig,
  toolDef: ToolDefinition,
  currentParameters: Record<string, unknown>,
  errors: ValidationError[],
): Promise<Record<string, unknown>> {
  const errorList = errors.map(e => `- ${e.field}: ${e.message}`).join('\n');

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: `You are a parameter extraction assistant.
The user wants to call the tool "${toolDef.name}" but the extracted parameters have validation errors.
Fix the parameters based on the user's original message and the validation errors.

Tool description: ${toolDef.description}
Input schema: ${JSON.stringify(toolDef.parameters, null, 2)}

Current parameters (with errors):
${JSON.stringify(currentParameters, null, 2)}

Validation errors:
${errorList}

Return corrected parameters as JSON: { "parameters": { ... } }`,
    },
    { role: 'user', content: ctx.userMessage },
  ];

  let fullContent = '';
  for await (const chunk of streamChat(messages, {
    temperature: 0.1,
    maxTokens: 400,
    providerId: cfg.providerId,
    modelId: cfg.modelId,
    responseFormat: REEXTRACT_RESPONSE_FORMAT,
    feature: 'param-reextraction',
    sessionId: ctx.sessionId,
  })) {
    fullContent += chunk.content;
    if (chunk.done && chunk.usage) {
      ctx.tokenUsage.promptTokens += chunk.usage.inputTokens;
      ctx.tokenUsage.completionTokens += chunk.usage.outputTokens;
      ctx.tokenUsage.totalTokens += chunk.usage.totalTokens;
    }
  }

  try {
    const parsed = JSON.parse(fullContent) as { parameters: Record<string, unknown> };
    return parsed.parameters ?? currentParameters;
  } catch {
    return currentParameters;
  }
}
