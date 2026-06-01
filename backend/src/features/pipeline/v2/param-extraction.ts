// src/features/pipeline/v2/param-extraction.ts

/**
 * D2a: Parameter Extraction — Deterministic Pipeline V2
 *
 * Given a specific planned action and its tool's input schema, extracts
 * structured parameters via a focused AI call. Uses the tool's own schema
 * as the response format — since we know which tool, we can use strict: true
 * with its exact schema. This is the key insight that solves V1's problem.
 *
 * AI calls: 1 per action (tool-specific strict schema)
 *
 * Dependencies:
 * - chatFn: makes the AI call (same interface as Turn Planner)
 *
 * See: docs/platform-evolution/DETERMINISTIC-PIPELINE-V2.md § D2a
 */

import { createLogger } from '@/shared/logger/logger';
import type {
  ParamExtractionInput,
  ParamExtractionResult,
  ModuleResult,
} from './v2.types';
import type {
  ChatMessage,
  ResponseFormat,
  ToolParameterSchema,
  ToolParameterProperty,
} from '@/features/ai-service/ai-service.types';
import type { ChatFn } from './turn-planner';

const logger = createLogger('v2:param-extraction');

// ============================================================================
// CONFIGURATION
// ============================================================================

export interface ParamExtractionConfig {
  /** AI provider ID */
  providerId?: string;
  /** AI model ID (can use cheaper model like gpt-4o-mini for extraction) */
  modelId?: number;
  /** Temperature (default: 0.0 — deterministic extraction) */
  temperature: number;
  /** Max tokens (default: 2000 — strict schemas require all properties, can be verbose) */
  maxTokens: number;
}

const DEFAULT_CONFIG: ParamExtractionConfig = {
  temperature: 0.0,
  maxTokens: 2000,
};

export interface ParamExtractionDeps {
  chat: ChatFn;
}

// ============================================================================
// MODULE ENTRY POINT
// ============================================================================

/**
 * Extract parameters for a single planned action using the tool's own schema.
 *
 * The tool's inputSchema becomes the response_format, so the AI's response
 * is guaranteed to match the tool's expected parameter shape (when strict mode works).
 */
export async function extractParameters(
  input: ParamExtractionInput,
  deps: ParamExtractionDeps,
  config: Partial<ParamExtractionConfig> = {},
): Promise<ModuleResult<ParamExtractionResult>> {
  const startTime = Date.now();
  const cfg = { ...DEFAULT_CONFIG, ...config };

  try {
    // 1. Build the response format from the tool's input schema
    const responseFormat = buildResponseFormat(input.action.toolSlug, input.toolInputSchema);

    // 2. Build prompt messages
    const messages = await buildMessages(input);

    // 3. Call AI with the tool-specific schema
    const aiResult = await deps.chat(messages, {
      temperature: cfg.temperature,
      maxTokens: cfg.maxTokens,
      providerId: cfg.providerId,
      modelId: cfg.modelId,
      responseFormat,
      feature: 'param-extraction',
    });

    // 4. Check for truncation (finishReason === 'length' means maxTokens hit)
    if (aiResult.finishReason === 'length') {
      logger.warn('Parameter extraction truncated — output hit maxTokens limit', {
        toolSlug: input.action.toolSlug,
        maxTokens: cfg.maxTokens,
        outputTokens: aiResult.usage?.outputTokens,
      });
    }

    // 5. Parse response
    const content = typeof aiResult.message.content === 'string'
      ? aiResult.message.content
      : '';

    if (!content) {
      const durationMs = Date.now() - startTime;
      logger.warn('Parameter extraction returned empty content', {
        toolSlug: input.action.toolSlug,
        finishReason: aiResult.finishReason,
        contentType: typeof aiResult.message.content,
      });
      return {
        success: false,
        summary: `Parameter extraction returned empty content for ${input.action.toolSlug} (finishReason: ${aiResult.finishReason})`,
        durationMs,
      };
    }

    const parameters = JSON.parse(content) as Record<string, unknown>;

    const durationMs = Date.now() - startTime;

    logger.info('Parameters extracted', {
      toolSlug: input.action.toolSlug,
      paramKeys: Object.keys(parameters),
      finishReason: aiResult.finishReason,
      durationMs,
    });

    return {
      success: true,
      data: { parameters },
      summary: `Extracted ${Object.keys(parameters).length} parameters for ${input.action.toolSlug}`,
      durationMs,
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('Parameter extraction failed', err, {
      toolSlug: input.action.toolSlug,
      errorType: err.name,
      // Include truncated content for debugging JSON parse failures
      ...(err instanceof SyntaxError && { hint: 'JSON parse failed — likely truncated response (maxTokens too low)' }),
    });

    return {
      success: false,
      summary: `Parameter extraction failed for ${input.action.toolSlug}: ${err.message}`,
      durationMs,
    };
  }
}

// ============================================================================
// RESPONSE FORMAT BUILDING
// ============================================================================

/**
 * Convert a tool's inputSchema into an OpenAI response_format.
 *
 * OpenAI strict mode requirements:
 * - Every property must have a `type` key
 * - `additionalProperties` must be `false` (boolean, not object)
 * - All properties must be listed in `required`
 *
 * We sanitize the schema to meet these requirements.
 */
function buildResponseFormat(
  toolSlug: string,
  inputSchema: ToolParameterSchema,
): ResponseFormat {
  const sanitized = sanitizeSchemaForStrict(inputSchema);

  return {
    type: 'json_schema',
    json_schema: {
      name: `extract_${toolSlug.replace(/[^a-zA-Z0-9_-]/g, '_')}`,
      description: `Extract parameters for the ${toolSlug} tool`,
      strict: true,
      schema: sanitized,
    },
  };
}

/**
 * Recursively sanitize a JSON schema for OpenAI strict mode.
 *
 * Ensures:
 * - additionalProperties is false (not an object, not missing)
 * - All properties are in the required array
 * - Nested objects are also sanitized
 * - Optional fields get null union types so strict mode accepts missing values
 */
function sanitizeSchemaForStrict(
  schema: ToolParameterSchema,
): {
  type: 'object';
  properties: Record<string, unknown>;
  required: string[];
  additionalProperties: false;
} {
  const allPropertyNames = Object.keys(schema.properties);
  const requiredSet = new Set(schema.required ?? []);

  const sanitizedProperties: Record<string, unknown> = {};

  for (const [key, prop] of Object.entries(schema.properties)) {
    let sanitizedProp = sanitizeProperty(prop);

    // For optional fields: wrap type in a union with null so the AI can
    // output null for fields it can't extract, while strict mode is still happy
    // (all properties must be in required[] for strict mode)
    if (!requiredSet.has(key)) {
      sanitizedProp = makeNullable(sanitizedProp);
    }

    sanitizedProperties[key] = sanitizedProp;
  }

  return {
    type: 'object',
    properties: sanitizedProperties,
    // Strict mode requires ALL properties in required[]
    required: allPropertyNames,
    additionalProperties: false,
  };
}

/**
 * Sanitize a single property for strict mode.
 */
function sanitizeProperty(prop: ToolParameterProperty): Record<string, unknown> {
  const result: Record<string, unknown> = { type: prop.type };

  if (prop.description) {
    result.description = prop.description;
  }

  if (prop.enum) {
    result.enum = prop.enum;
  }

  // Recurse into nested objects
  if (prop.type === 'object' && prop.properties) {
    const nestedNames = Object.keys(prop.properties);
    const nestedRequired = new Set(prop.required ?? []);
    const nestedProps: Record<string, unknown> = {};

    for (const [k, v] of Object.entries(prop.properties)) {
      let sanitized = sanitizeProperty(v);
      if (!nestedRequired.has(k)) {
        sanitized = makeNullable(sanitized);
      }
      nestedProps[k] = sanitized;
    }

    result.properties = nestedProps;
    result.required = nestedNames;
    result.additionalProperties = false;
  }

  // Recurse into array items
  if (prop.type === 'array' && prop.items) {
    result.items = sanitizeProperty(prop.items);
  }

  return result;
}

/**
 * Make a property nullable by converting its type to a union with null.
 * e.g., { type: "string" } → { type: ["string", "null"] }
 */
function makeNullable(prop: Record<string, unknown>): Record<string, unknown> {
  const currentType = prop.type;

  if (Array.isArray(currentType)) {
    // Already a union — add null if not present
    if (!currentType.includes('null')) {
      return { ...prop, type: [...currentType, 'null'] };
    }
    return prop;
  }

  if (currentType === 'null') {
    return prop;
  }

  return { ...prop, type: [currentType as string, 'null'] };
}

// Exported for testing
export {
  sanitizeSchemaForStrict as _sanitizeSchemaForStrict,
  buildResponseFormat as _buildResponseFormat,
  makeNullable as _makeNullable,
};

// ============================================================================
// PROMPT BUILDING
// ============================================================================

async function buildMessages(input: ParamExtractionInput): Promise<ChatMessage[]> {
  const systemPrompt = await buildSystemPrompt(input);
  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: buildUserPrompt(input) },
  ];
}

async function buildSystemPrompt(input: ParamExtractionInput): Promise<string> {
  // Build variable values
  const fieldDescriptions = Object.entries(input.toolInputSchema.properties)
    .map(([name, prop]) => {
      const parts = [`- **${name}** (${prop.type})`];
      if (prop.description) parts.push(`: ${prop.description}`);
      if (prop.enum) parts.push(` [allowed: ${prop.enum.join(', ')}]`);
      return parts.join('');
    })
    .join('\n');

  const requiredFields = input.toolInputSchema.required?.join(', ') ?? 'none';

  // Build field constraints string
  let fieldConstraints = '';
  if (input.parameterContext?.enriched) {
    const constraintLines: string[] = [];
    for (const [, constraint] of Object.entries(input.parameterContext.fieldConstraints)) {
      if (constraint.validValues.length > 0) {
        const displayValues = constraint.validValues.slice(0, 50);
        const truncated = constraint.validValues.length > 50
          ? ` (showing ${displayValues.length} of ${constraint.validValues.length})`
          : '';
        constraintLines.push(
          `- **${constraint.fieldName}**: valid values are: ${displayValues.map((v) => `"${v}"`).join(', ')}${truncated}` +
          (constraint.hintValue ? ` (user intent suggests: "${constraint.hintValue}")` : ''),
        );
      }
    }
    if (constraintLines.length > 0) {
      fieldConstraints = constraintLines.join('\n');
    }
  }

  // Try DB-backed template first
  try {
    const { resolveTemplate, renderTemplate } = await import('@/features/prompt-templates');
    const template = await resolveTemplate('param_extraction');
    if (template) {
      return renderTemplate(template.content, {
        toolSlug: input.action.toolSlug,
        fieldDescriptions,
        requiredFields,
        fieldConstraints,
      });
    }
  } catch {
    // Template system not available — fall through to inline
  }

  // Fallback: inline prompt
  let prompt = `Extract parameters for the tool "${input.action.toolSlug}".

## Tool parameters
${fieldDescriptions}

Required: ${requiredFields}

## Rules
1. Extract values from the user's message, intent, and hints below.
2. For required fields, always provide a value — infer from context if not explicitly stated.
3. For optional fields, set to null if no information is available.
4. When resolving references like "item 3" or "that one", use the context provided.
5. Match enum values exactly as listed above.
6. Return valid JSON matching the parameter schema.
7. Use correct JSON types: numbers must be numbers (not strings), booleans must be booleans.
   For example, a price of 200 must be \`200\`, not \`"200"\`.
8. IMPORTANT — Query/search field hygiene:
   The query field should contain the **descriptive terms** that define what the user is looking for.
   KEEP in the query: product type, descriptive qualifiers (e.g., "left-handed", "wireless", "leather", "organic", "waterproof").
   MOVE to filters: structured attributes that match a filter field (e.g., gender, brand, price range, size, color when a color filter exists).
   Example: "men's left-handed leather golf gloves under $100" → query: "left-handed leather golf gloves", filters: gender=Men + maxPrice≤100.
   When in doubt, keep the term in the query — an overly narrow query returns zero results, while a slightly broad query can still be filtered.`;

  if (fieldConstraints) {
    prompt += `\n\n## Filter field constraints\nWhen building filters, you MUST use one of the exact valid values listed below. Pick the value that best matches the user's intent.\n${fieldConstraints}`;
  }

  return prompt;
}

function buildUserPrompt(input: ParamExtractionInput): string {
  const parts: string[] = [];

  parts.push(`Message: "${input.userMessage}"`);
  parts.push(`Intent: ${input.action.intent}`);

  if (Object.keys(input.action.hints).length > 0) {
    parts.push(`Hints: ${JSON.stringify(input.action.hints)}`);
  }

  // Hint annotations — explain what the planner attempted but was removed
  if (input.hintAnnotations && input.hintAnnotations.length > 0) {
    parts.push(`\n## Note from validation\n${input.hintAnnotations.join('\n')}`);
  }

  // Context for resolving references
  if (input.resultMemoryIndex.length > 0) {
    const itemLines = input.resultMemoryIndex
      .map((entry) => {
        const snapshot = Object.entries(entry.snapshot)
          .map(([k, v]) => `${k}: ${v}`)
          .join(', ');
        return `- Item ${entry.ordinal}: ${snapshot} [id=${entry.resultId}]`;
      })
      .join('\n');
    parts.push(`\nVisible results:\n${itemLines}`);
  }

  // Previous action results (for dependent actions)
  if (input.previousActionResults && input.previousActionResults.length > 0) {
    const prevLines = input.previousActionResults
      .map((ar) => `- ${ar.toolSlug}: ${ar.result.success ? `${ar.result.resultCount ?? 0} results` : 'failed'}`)
      .join('\n');
    parts.push(`\nPrevious actions this turn:\n${prevLines}`);
  }

  // Validation errors from retry
  if (input.validationErrors && input.validationErrors.length > 0) {
    const errorLines = input.validationErrors
      .map((e) => `- ${e.field}: ${e.message}${e.expected ? ` (expected: ${e.expected})` : ''}`)
      .join('\n');
    parts.push(`\n## Previous extraction had errors — please fix:\n${errorLines}`);
  }

  return parts.join('\n');
}

// Exported for testing
export { buildSystemPrompt as _buildSystemPrompt, buildUserPrompt as _buildUserPrompt };

// ============================================================================
// PRODUCTION DEPENDENCY FACTORY
// ============================================================================

export function createProductionParamExtractionDeps(): ParamExtractionDeps {
  return {
    async chat(messages, options) {
      const { chat } = await import('@/features/ai-service/ai-service.service');
      return chat(messages, options);
    },
  };
}
