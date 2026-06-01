// src/features/prompt-templates/prompt-template.defaults.ts

/**
 * System Default Prompt Templates
 *
 * These are the current hardcoded prompts converted to template format.
 * They become v1 seed rows in the prompt_templates table.
 *
 * Template syntax:
 * - {{variable}} — replaced at runtime with pipeline data
 * - {{#if variable}}...{{/if}} — conditional block (included when variable is truthy)
 * - <!-- section:id --> ... <!-- /section:id --> — marks admin-editable regions
 *
 * The full text (scaffolding + placeholders + editable sections) is the versioned artifact.
 */

import type { PromptTemplateMetadata } from '@/db/schema/prompt-templates.schema';
import type { PromptTemplateStep } from './prompt-template.types';

export interface SystemDefaultTemplate {
  step: PromptTemplateStep;
  label: string;
  content: string;
  metadata: PromptTemplateMetadata;
}

// ============================================================================
// TURN PLANNER (D1)
// ============================================================================

const TURN_PLANNER_TEMPLATE: SystemDefaultTemplate = {
  step: 'turn_planner',
  label: 'System default — turn planner v1',
  content: `You are a turn planner for an AI assistant.

## Your job
Analyze the user's message in the context of the conversation and decide
what actions to take using the available tools.

## Available tools
{{toolList}}

<!-- section:rules -->
## Rules
1. Select tool(s) from the available list. Use exact tool slugs.
2. Order actions logically — if action 2 needs results from action 1, mark dependsOnPrevious=true.
3. For greetings, "thank you", "what can you do?" → set directResponse=true, empty actions.
4. Only set needsClarification=true when the request is truly ambiguous and you cannot
   make a reasonable guess. If the user mentions a product category, topic, or keyword,
   ALWAYS search for it — do NOT ask for clarification. Prefer action over clarification.
5. Provide rough parameter hints in the hints field as a JSON string.
   These are NOT final parameters — just your understanding of what the user wants.
   Hints MUST match what the user actually asked for. Do not invert or change the meaning
   (e.g., if the user says "max $200", hints should reflect a maximum price of 200, not above 200).
   Only use parameter names that appear in the tool descriptions above — do NOT invent field names.
6. When the user references previous results ("item 2", "that shirt", "the red one"),
   resolve from the visible results below and include the resolved ID in hints.
7. Confidence: 0.9+ for clear requests, 0.7-0.89 for likely correct, below 0.7 for unclear.
8. When the user says "yes", "show me those", or similar confirmations referencing previous
   results or suggestions, use the SAME parameters/filters from the previous turn — do not change them.
9. For filter hints, use common attribute names (e.g., category: "jackets", color: "red").
   The backend will resolve exact valid field names and values automatically — you do not need to know the schema.
<!-- /section:rules -->

{{#if businessDomain}}
## Business domain
{{businessDomain}}
{{/if}}`,
  metadata: {
    variables: [
      { name: 'toolList', description: 'Formatted list of available tools with slugs and descriptions', source: 'pipeline_context' },
      { name: 'businessDomain', description: 'Business domain context from experience config (optional)', source: 'experience_config' },
    ],
    sections: [
      { id: 'rules', label: 'Planning Rules', startMarker: '<!-- section:rules -->', endMarker: '<!-- /section:rules -->', editable: true },
    ],
  },
};

// ============================================================================
// PARAM EXTRACTION (D2a)
// ============================================================================

const PARAM_EXTRACTION_TEMPLATE: SystemDefaultTemplate = {
  step: 'param_extraction',
  label: 'System default — param extraction v1',
  content: `Extract parameters for the tool "{{toolSlug}}".

## Tool parameters
{{fieldDescriptions}}

Required: {{requiredFields}}

<!-- section:rules -->
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
   When in doubt, keep the term in the query — an overly narrow query returns zero results, while a slightly broad query can still be filtered.
<!-- /section:rules -->

{{#if fieldConstraints}}
## Filter field constraints
When building filters, you MUST use one of the exact valid values listed below. Pick the value that best matches the user's intent.
{{fieldConstraints}}
{{/if}}`,
  metadata: {
    variables: [
      { name: 'toolSlug', description: 'The tool slug being extracted for', source: 'pipeline_context' },
      { name: 'fieldDescriptions', description: 'Formatted tool parameter descriptions with types and enums', source: 'tool_schema' },
      { name: 'requiredFields', description: 'Comma-separated list of required field names', source: 'tool_schema' },
      { name: 'fieldConstraints', description: 'Valid filter values from context enrichment (optional)', source: 'pipeline_context' },
    ],
    sections: [
      { id: 'rules', label: 'Extraction Rules', startMarker: '<!-- section:rules -->', endMarker: '<!-- /section:rules -->', editable: true },
    ],
  },
};

// ============================================================================
// RESPONSE SYNTHESIS (D3 — from results)
// ============================================================================

const RESPONSE_SYNTHESIS_TEMPLATE: SystemDefaultTemplate = {
  step: 'response_synthesis',
  label: 'System default — response synthesis v1',
  content: `{{personaInstructions}}

## What was done
{{actionSummary}}

## Results data
{{resultData}}

## Response format
The client will display a "{{preset}}" UI component alongside your text.
{{presetInstructions}}

{{#if pendingActions}}
## Pending actions
These actions were planned but not yet executed. Mention them as suggestions:
{{pendingActions}}
{{/if}}

<!-- section:rules -->
## Rules
- Ground every statement in the provided results. Each fact, number, feature, ingredient, or claim must come from the results above — never from your own knowledge of the subject.
- Comparisons to things not in the results: when the user asks how a result compares to something the results do NOT cover (a competitor, brand, category, procedure, or alternative), describe only what the results themselves say — including how they position relative to that thing. Do NOT describe, explain, or estimate the properties of the external thing from prior knowledge. If a point of comparison isn't in the results, say that detail isn't available instead of supplying it.
- Do not invent or hallucinate information. If results are empty, say so honestly and suggest alternatives.
- Tone: {{tone}}
<!-- /section:rules -->`,
  metadata: {
    variables: [
      { name: 'personaInstructions', description: 'System instructions from experience persona config', source: 'experience_config' },
      { name: 'actionSummary', description: 'What tools were called and their results', source: 'action_results' },
      { name: 'resultData', description: 'Truncated JSON of tool results (max 10 items per tool)', source: 'action_results' },
      { name: 'preset', description: 'UI preset type (rich_text, item_grid, etc.)', source: 'pipeline_context' },
      { name: 'presetInstructions', description: 'Preset-specific formatting guidance', source: 'pipeline_context' },
      { name: 'pendingActions', description: 'Unexecuted planned actions to suggest (optional)', source: 'pipeline_context' },
      { name: 'tone', description: 'Response tone from persona config', source: 'experience_config' },
    ],
    sections: [
      { id: 'rules', label: 'Synthesis Rules', startMarker: '<!-- section:rules -->', endMarker: '<!-- /section:rules -->', editable: true },
    ],
  },
};

// ============================================================================
// RESPONSE SYNTHESIS — DIRECT (D3 — no tool results)
// ============================================================================

const RESPONSE_SYNTHESIS_DIRECT_TEMPLATE: SystemDefaultTemplate = {
  step: 'response_synthesis_direct',
  label: 'System default — direct response synthesis v1',
  content: `{{personaInstructions}}

Tone: {{tone}}

{{#if clarificationQuestion}}
<!-- section:clarification -->
The user's intent is unclear. Ask them this clarification question in your voice: "{{clarificationQuestion}}"
<!-- /section:clarification -->
{{/if}}`,
  metadata: {
    variables: [
      { name: 'personaInstructions', description: 'System instructions from experience persona config', source: 'experience_config' },
      { name: 'tone', description: 'Response tone from persona config', source: 'experience_config' },
      { name: 'clarificationQuestion', description: 'Clarification question from planner (optional)', source: 'pipeline_context' },
    ],
    sections: [
      { id: 'clarification', label: 'Clarification Instruction', startMarker: '<!-- section:clarification -->', endMarker: '<!-- /section:clarification -->', editable: true },
    ],
  },
};

// ============================================================================
// RESPONSE SYNTHESIS — LIGHTWEIGHT (guardrail short-circuit)
// ============================================================================

const RESPONSE_SYNTHESIS_LIGHTWEIGHT_TEMPLATE: SystemDefaultTemplate = {
  step: 'response_synthesis_lightweight',
  label: 'System default — lightweight synthesis v1',
  content: `{{personaInstructions}}

Tone: {{tone}}

<!-- section:context -->
{{contextInstruction}}
<!-- /section:context -->`,
  metadata: {
    variables: [
      { name: 'personaInstructions', description: 'System instructions from experience persona config', source: 'experience_config' },
      { name: 'tone', description: 'Response tone from persona config', source: 'experience_config' },
      { name: 'contextInstruction', description: 'Classification-specific instruction (greeting/general/off_topic)', source: 'pipeline_context' },
    ],
    sections: [
      { id: 'context', label: 'Context Instruction', startMarker: '<!-- section:context -->', endMarker: '<!-- /section:context -->', editable: true },
    ],
  },
};

// ============================================================================
// ALL DEFAULTS
// ============================================================================

export const SYSTEM_DEFAULT_TEMPLATES: SystemDefaultTemplate[] = [
  TURN_PLANNER_TEMPLATE,
  PARAM_EXTRACTION_TEMPLATE,
  RESPONSE_SYNTHESIS_TEMPLATE,
  RESPONSE_SYNTHESIS_DIRECT_TEMPLATE,
  RESPONSE_SYNTHESIS_LIGHTWEIGHT_TEMPLATE,
];
