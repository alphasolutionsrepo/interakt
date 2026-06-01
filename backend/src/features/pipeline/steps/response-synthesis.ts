// src/features/pipeline/steps/response-synthesis.ts

/**
 * Response Synthesis Step (Deterministic Pipeline)
 *
 * Uses AI to generate a natural language response. Supports two data paths:
 *
 * 1. Tool-selection path (current): reads tool output from ctx.shared.currentResults
 *    and selection context from ctx.stepResults['tool-selection']. Handles both
 *    direct responses (no tool) and tool-backed responses.
 *
 * 2. Intent-detection path (legacy): reads executionFacts from ctx.shared.executionFacts.
 *    Kept for backward compatibility with older pipeline configs.
 *
 * Learnings from old pipeline:
 * - Higher temperature (0.5) for natural language
 * - Structured JSON output for preset selection
 * - Retry once on parse failure, fallback to markdown_rich
 */

import type { Span } from '@opentelemetry/api';
import { streamChat } from '@/features/ai-service/ai-service.service';
import type { ChatMessage, ResponseFormat } from '@/features/ai-service/ai-service.types';
import type { StepHandler, PipelineContext, StepResult } from '../pipeline.types';
import type { ToolSelectionResult } from './tool-selection';
import type { ExecutionFacts } from './tool-execution';

// ============================================================================
// TYPES
// ============================================================================

type ResponsePreset = 'markdown_rich' | 'plain_text' | 'single_card' | 'item_grid' | 'comparison_table' | 'step_list' | 'summary_with_sources';

interface SynthesisConfig {
  temperature?: number;
  maxTokens?: number;
  maxRetries?: number;
  providerId?: string;
  modelId?: number;
  /** Enabled response presets for this experience */
  enabledPresets?: ResponsePreset[];
  /** Persona name and tone */
  personaName?: string;
  tone?: string;
  /** System instructions from persona config */
  systemInstructions?: string;
}

interface SynthesisResponse {
  preset: ResponsePreset;
  text: string;
  title?: string;
  documentIds?: string[];
  summary?: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const SYNTHESIS_JSON_SCHEMA: ResponseFormat = {
  type: 'json_schema',
  json_schema: {
    name: 'response_synthesis',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        preset: {
          type: 'string',
          enum: ['markdown_rich', 'plain_text', 'single_card', 'item_grid', 'comparison_table', 'step_list', 'summary_with_sources'],
        },
        text: { type: 'string' },
        title: { type: ['string', 'null'] },
        documentIds: { type: ['array', 'null'], items: { type: 'string' } },
        summary: { type: ['string', 'null'] },
      },
      required: ['preset', 'text'],
      additionalProperties: false,
    },
  },
};

// ============================================================================
// STEP HANDLER
// ============================================================================

export const responseSynthesisHandler: StepHandler = {
  type: 'response_synthesis',

  async execute(
    config: Record<string, unknown>,
    ctx: PipelineContext,
    span: Span,
  ): Promise<StepResult> {
    const cfg = config as unknown as SynthesisConfig;

    // Determine which path to use based on what ran upstream
    const selectionData = ctx.stepResults['tool-selection']?.data as unknown as ToolSelectionResult | undefined;
    const isNewPath = selectionData !== undefined;

    // Legacy path falls back to executionFacts
    const facts = (ctx.shared.executionFacts as ExecutionFacts | undefined) ?? { action: 'clarify' as const };
    const validationOverride = ctx.shared.validationOverride as { reason: string } | undefined;

    span.setAttribute('synthesis.path', isNewPath ? 'tool_selection' : 'legacy');

    const maxRetries = cfg.maxRetries ?? 1;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = isNewPath
          ? await callSynthesisFromSelection(selectionData!, cfg, ctx)
          : await callSynthesis(facts, validationOverride, cfg, ctx);

        // Validate and fix preset
        const preset = validatePreset(response.preset, cfg.enabledPresets);

        // Set response on context
        ctx.responseText = response.text;
        ctx.responseMetadata = {
          preset,
          title: response.title,
          documentIds: response.documentIds,
          summary: response.summary,
        };

        // Emit events
        ctx.emitEvent({ type: 'content', text: response.text });
        if (preset !== 'markdown_rich' && preset !== 'plain_text') {
          ctx.emitEvent({ type: 'preset', preset, data: response });
        }

        span.setAttribute('synthesis.preset', preset);
        span.setAttribute('synthesis.text_length', response.text.length);

        return {
          success: true,
          data: { preset, textLength: response.text.length },
          summary: `Synthesized ${preset} response (${response.text.length} chars)`,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt < maxRetries) continue;
      }
    }

    // Fallback: generate a basic response without AI
    const fallbackText = isNewPath
      ? generateFallbackFromSelection(selectionData!, ctx)
      : generateFallbackResponse(facts, validationOverride);
    ctx.responseText = fallbackText;
    ctx.responseMetadata = { preset: 'markdown_rich' };
    ctx.emitEvent({ type: 'content', text: fallbackText });

    span.setAttribute('synthesis.fallback', true);

    return {
      success: true,
      data: { preset: 'markdown_rich', fallback: true },
      summary: `Synthesis failed, used fallback: ${lastError?.message}`,
    };
  },
};

// ============================================================================
// AI CALL
// ============================================================================

async function callSynthesis(
  facts: ExecutionFacts,
  validationOverride: { reason: string } | undefined,
  cfg: SynthesisConfig,
  ctx: PipelineContext,
): Promise<SynthesisResponse> {
  const systemPrompt = buildSynthesisSystemPrompt(cfg);
  const userPrompt = buildSynthesisUserPrompt(facts, validationOverride, ctx);

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  let fullContent = '';
  for await (const chunk of streamChat(messages, {
    temperature: cfg.temperature ?? 0.5,
    maxTokens: cfg.maxTokens ?? 1000,
    providerId: cfg.providerId,
    modelId: cfg.modelId,
    responseFormat: SYNTHESIS_JSON_SCHEMA,
  })) {
    fullContent += chunk.content;
    if (chunk.done && chunk.usage) {
      ctx.tokenUsage.promptTokens += chunk.usage.inputTokens;
      ctx.tokenUsage.completionTokens += chunk.usage.outputTokens;
      ctx.tokenUsage.totalTokens += chunk.usage.totalTokens;
    }
  }

  return JSON.parse(fullContent) as SynthesisResponse;
}

// ============================================================================
// NEW PATH: TOOL-SELECTION-BASED SYNTHESIS
// ============================================================================

async function callSynthesisFromSelection(
  selection: ToolSelectionResult,
  cfg: SynthesisConfig,
  ctx: PipelineContext,
): Promise<SynthesisResponse> {
  const systemPrompt = buildSynthesisSystemPrompt(cfg);
  const userPrompt = buildSynthesisUserPromptFromSelection(selection, ctx);

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  let fullContent = '';
  for await (const chunk of streamChat(messages, {
    temperature: cfg.temperature ?? 0.5,
    maxTokens: cfg.maxTokens ?? 1000,
    providerId: cfg.providerId,
    modelId: cfg.modelId,
    responseFormat: SYNTHESIS_JSON_SCHEMA,
    feature: 'response-synthesis',
    sessionId: ctx.sessionId,
  })) {
    fullContent += chunk.content;
    if (chunk.done && chunk.usage) {
      ctx.tokenUsage.promptTokens += chunk.usage.inputTokens;
      ctx.tokenUsage.completionTokens += chunk.usage.outputTokens;
      ctx.tokenUsage.totalTokens += chunk.usage.totalTokens;
    }
  }

  return JSON.parse(fullContent) as SynthesisResponse;
}

function buildSynthesisUserPromptFromSelection(
  selection: ToolSelectionResult,
  ctx: PipelineContext,
): string {
  const parts: string[] = [];

  parts.push(`User message: "${ctx.userMessage}"`);

  if (selection.isDirectResponse) {
    parts.push('Type: Direct response (no tool was called)');
    parts.push('Generate a conversational response appropriate to the user\'s message (greeting, general answer, capability explanation, etc.)');
    return parts.join('\n');
  }

  parts.push(`Tool called: ${selection.toolSlug}`);
  parts.push(`Tool reasoning: ${selection.reasoning}`);

  const results = ctx.shared.currentResults as unknown[] | undefined;
  const resultCount = ctx.shared.resultCount as number | undefined;
  const hasResults = ctx.shared.hasResults as boolean | undefined;

  if (hasResults && results?.length) {
    parts.push(`Results found: ${resultCount ?? results.length}`);
    const preview = JSON.stringify(results.slice(0, 6), null, 2);
    parts.push(`Top results:\n${preview}`);
  } else if (selection.toolId) {
    // Tool ran but no results (or non-list result)
    const rawOutput = ctx.shared.lastToolResults as Record<string, unknown> | undefined;
    if (rawOutput && Object.keys(rawOutput).length > 0) {
      parts.push(`Tool output:\n${JSON.stringify(rawOutput, null, 2)}`);
    } else {
      parts.push('Results: No results found');
    }
  }

  return parts.join('\n');
}

function generateFallbackFromSelection(
  selection: ToolSelectionResult,
  ctx: PipelineContext,
): string {
  if (selection.isDirectResponse) {
    return 'Hello! How can I help you today?';
  }

  const resultCount = ctx.shared.resultCount as number | undefined;
  const hasResults = ctx.shared.hasResults as boolean | undefined;

  if (!hasResults || !resultCount) {
    return `I searched using ${selection.toolSlug ?? 'the available tools'} but couldn't find results. Try refining your request.`;
  }

  return `Found ${resultCount} result(s) using ${selection.toolSlug ?? 'the available tools'}.`;
}

// ============================================================================
// PROMPT BUILDING
// ============================================================================

function buildSynthesisSystemPrompt(cfg: SynthesisConfig): string {
  const enabledPresets = cfg.enabledPresets ?? ['markdown_rich'];
  const presetList = enabledPresets.join(', ');

  let prompt = `You are a response synthesis AI. Given execution facts about what was done for the user's request, generate a natural, helpful response.

Choose the most appropriate response preset from: ${presetList}

Preset guidelines:
- markdown_rich: General purpose, supports headers, lists, bold. Use for most responses.
- plain_text: Short, direct answers. Use for greetings, clarifications, simple answers.
- single_card: Highlight one specific item. Use for explain actions.
- item_grid: Display multiple items in a grid layout. Use for search results (3+ items).
- comparison_table: Side-by-side comparison. Use for compare actions.
- step_list: Ordered steps/instructions. Use for how-to responses.
- summary_with_sources: Answer with source citations. Use for knowledge answers.

Include documentIds when referencing specific items from the results.
Respond with valid JSON matching the schema.`;

  if (cfg.systemInstructions) {
    prompt += `\n\nAdditional instructions:\n${cfg.systemInstructions}`;
  }
  if (cfg.tone) {
    prompt += `\n\nTone: ${cfg.tone}`;
  }
  if (cfg.personaName) {
    prompt += `\nYou are "${cfg.personaName}".`;
  }

  return prompt;
}

function buildSynthesisUserPrompt(
  facts: ExecutionFacts,
  validationOverride: { reason: string } | undefined,
  ctx: PipelineContext,
): string {
  const parts: string[] = [];

  parts.push(`User message: "${ctx.userMessage}"`);
  parts.push(`Action: ${facts.action}`);

  if (validationOverride) {
    parts.push(`Note: Original action was corrected. Reason: ${validationOverride.reason}`);
  }

  if (facts.query) parts.push(`Query: "${facts.query}"`);
  if (facts.resultCount !== undefined) parts.push(`Results found: ${facts.resultCount}`);

  if (facts.results?.length) {
    const preview = JSON.stringify(facts.results.slice(0, 6), null, 2);
    parts.push(`Top results:\n${preview}`);
  }

  if (facts.constraints?.length) {
    parts.push(`Active filters: ${JSON.stringify(facts.constraints)}`);
  }

  if (facts.constraintsRelaxed) {
    parts.push(`Note: Some filters were relaxed to find results.`);
  }

  if (facts.comparisonItems?.length) {
    parts.push(`Items to compare:\n${JSON.stringify(facts.comparisonItems, null, 2)}`);
  }

  if (facts.itemDetails) {
    parts.push(`Item details:\n${JSON.stringify(facts.itemDetails, null, 2)}`);
  }

  if (facts.knowledgeAnswer) {
    parts.push(`Knowledge base answer: ${facts.knowledgeAnswer}`);
  }

  if (facts.rankingCriteria) {
    parts.push(`Ranked by: ${facts.rankingCriteria}`);
  }

  if (facts.error) {
    parts.push(`Error: ${facts.error}`);
  }

  return parts.join('\n');
}

// ============================================================================
// HELPERS
// ============================================================================

function validatePreset(
  preset: string,
  enabledPresets?: ResponsePreset[],
): ResponsePreset {
  const valid: ResponsePreset[] = enabledPresets ?? ['markdown_rich'];
  if (valid.includes(preset as ResponsePreset)) {
    return preset as ResponsePreset;
  }
  return valid[0] ?? 'markdown_rich';
}

function generateFallbackResponse(
  facts: ExecutionFacts,
  validationOverride?: { reason: string },
): string {
  if (validationOverride) return validationOverride.reason;

  switch (facts.action) {
    case 'greet':
      return 'Hello! How can I help you today?';
    case 'clarify':
      return facts.error ?? 'Could you please clarify what you\'re looking for?';
    case 'search':
    case 'refine':
      if (facts.error) return `I encountered an issue with the search: ${facts.error}`;
      if (!facts.resultCount) return `No results found for "${facts.query}". Try adjusting your search.`;
      return `Found ${facts.resultCount} results for "${facts.query}".`;
    case 'compare':
      return `Here's a comparison of ${facts.comparisonItems?.length ?? 0} items.`;
    case 'explain':
      return facts.itemDetails ? 'Here are the details for this item.' : 'I couldn\'t find the item you\'re asking about.';
    case 'knowledge':
      return facts.knowledgeAnswer ?? 'I don\'t have specific information about that.';
    default:
      return 'I\'m here to help. What would you like to know?';
  }
}
