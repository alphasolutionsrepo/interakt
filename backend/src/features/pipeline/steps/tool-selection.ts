// src/features/pipeline/steps/tool-selection.ts

/**
 * Tool Selection Step (Deterministic Pipeline)
 *
 * Replaces the old intent_detection → action-enum → routing approach.
 *
 * The AI receives the user's message, session context, result memory
 * summary, and the full list of tool definitions (aiDescriptions + inputSchemas).
 * It selects the best tool and extracts the parameters needed to call it.
 *
 * Returns: { toolId, toolSlug, parameters, confidence, reasoning }
 *
 * Below the configured confidence threshold → routes to a clarification response.
 * No matching tool → routes to a clarification response.
 *
 * Design principles:
 * - No action enum. The AI reads aiDescription fields and picks directly.
 * - Confidence is explicit (prompted, not inferred from logprobs).
 * - Reasoning is recorded for observability (surfaced in trace panel).
 * - Direct responses (greetings, meta-queries) are a valid selection outcome.
 */

import type { Span } from '@opentelemetry/api';
import { streamChat } from '@/features/ai-service/ai-service.service';
import type { ChatMessage, ResponseFormat, ToolDefinition } from '@/features/ai-service/ai-service.types';
import type { StepHandler, PipelineContext, StepResult, ResultMemoryEntry } from '../pipeline.types';

// ============================================================================
// TYPES
// ============================================================================

export interface ToolSelectionResult {
  /** ID of the selected tool (null = direct response, no tool needed) */
  toolId: string | null;
  /** Slug of the selected tool (matches tool definition name) */
  toolSlug: string | null;
  /** Parameters extracted from the user message (validated in next step) */
  parameters: Record<string, unknown>;
  /** Confidence score 0.0–1.0 */
  confidence: number;
  /** Short reasoning string — recorded in trace, not shown to user */
  reasoning: string;
  /** True when the AI determined no tool is needed (greeting, meta-query) */
  isDirectResponse: boolean;
  /** Suggested clarification question (when confidence < threshold) */
  clarificationQuestion?: string;
}

interface ToolSelectionConfig {
  /** Confidence threshold below which we route to clarification (default: 0.70) */
  confidenceThreshold?: number;
  /** AI provider override */
  providerId?: string;
  modelId?: number;
  /** Business domain for context (e.g. "plumbing supplies, HVAC equipment") */
  businessDomain?: string;
}

// ============================================================================
// JSON SCHEMA for structured AI output
// ============================================================================

const TOOL_SELECTION_RESPONSE_FORMAT: ResponseFormat = {
  type: 'json_schema',
  json_schema: {
    name: 'tool_selection',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        toolSlug: {
          type: ['string', 'null'],
          description: 'Slug of the selected tool, or null if no tool is needed',
        },
        parameters: {
          type: 'object',
          description: 'Parameters to pass to the tool (empty object if no tool)',
          additionalProperties: {},
        },
        confidence: {
          type: 'number',
          description: 'Confidence in the selection from 0.0 to 1.0',
        },
        reasoning: {
          type: 'string',
          description: 'Brief explanation of why this tool was selected',
        },
        isDirectResponse: {
          type: 'boolean',
          description: 'True when the message requires no tool (greeting, meta-query, etc.)',
        },
        clarificationQuestion: {
          type: ['string', 'null'],
          description: 'Question to ask the user when the intent is unclear',
        },
      },
      required: ['toolSlug', 'parameters', 'confidence', 'reasoning', 'isDirectResponse', 'clarificationQuestion'],
      additionalProperties: false,
    },
  },
};

// ============================================================================
// STEP HANDLER
// ============================================================================

export const toolSelectionHandler: StepHandler = {
  type: 'tool_selection',

  async execute(
    config: Record<string, unknown>,
    ctx: PipelineContext,
    span: Span,
  ): Promise<StepResult> {
    const cfg = config as unknown as ToolSelectionConfig;
    const threshold = cfg.confidenceThreshold ?? 0.70;

    // Use pre-filtered tool definitions if tool_group_selection ran; fall back to full set
    const toolDefinitions = (
      ctx.shared.filteredToolDefinitions as ToolDefinition[] | undefined
      ?? ctx.shared.toolDefinitions as ToolDefinition[] | undefined
      ?? []
    );
    const toolNameToId = ctx.shared.toolNameToId as Record<string, string> | undefined ?? {};

    // Fast path: no tools assigned → direct response
    if (toolDefinitions.length === 0) {
      span.setAttribute('tool_selection.fast_path', 'no_tools');
      return {
        success: true,
        data: {
          toolId: null,
          toolSlug: null,
          parameters: {},
          confidence: 1.0,
          reasoning: 'No tools assigned to this experience',
          isDirectResponse: true,
        } satisfies ToolSelectionResult,
        summary: 'No tools assigned — direct response',
      };
    }

    const result = await callToolSelection(ctx, cfg, toolDefinitions);

    span.setAttribute('tool_selection.tool_slug', result.toolSlug ?? 'none');
    span.setAttribute('tool_selection.confidence', result.confidence);
    span.setAttribute('tool_selection.is_direct', result.isDirectResponse);
    span.setAttribute('tool_selection.reasoning', result.reasoning.substring(0, 200));

    // Resolve slug → id
    const toolId = result.toolSlug ? (toolNameToId[result.toolSlug] ?? null) : null;
    if (result.toolSlug && !toolId) {
      span.setAttribute('tool_selection.unknown_slug', result.toolSlug);
    }

    const selection: ToolSelectionResult = { ...result, toolId };

    // Below threshold → clarification
    if (!result.isDirectResponse && result.confidence < threshold) {
      span.setAttribute('tool_selection.below_threshold', true);
      const clarification = result.clarificationQuestion
        ?? "I'm not sure I understood that. Could you rephrase or give more detail?";

      ctx.responseText = clarification;
      ctx.emitEvent({ type: 'content', text: clarification });

      return {
        success: true,
        abort: true,
        data: { ...selection, routedToClarification: true },
        summary: `Confidence ${result.confidence.toFixed(2)} below threshold ${threshold} — clarification sent`,
      };
    }

    return {
      success: true,
      data: selection as unknown as Record<string, unknown>,
      summary: result.isDirectResponse
        ? 'Direct response (no tool needed)'
        : `Selected tool: ${result.toolSlug} (confidence: ${result.confidence.toFixed(2)})`,
    };
  },
};

// ============================================================================
// AI CALL
// ============================================================================

async function callToolSelection(
  ctx: PipelineContext,
  cfg: ToolSelectionConfig,
  toolDefinitions: ToolDefinition[],
): Promise<ToolSelectionResult> {
  const systemPrompt = buildSystemPrompt(cfg, toolDefinitions);
  const userPrompt = buildUserPrompt(ctx);

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    // Last 4 turns for context (keeps token cost low)
    ...ctx.conversationHistory.slice(-4).map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
    { role: 'user', content: userPrompt },
  ];

  let fullContent = '';
  for await (const chunk of streamChat(messages, {
    temperature: 0.1,
    maxTokens: 600,
    providerId: cfg.providerId,
    modelId: cfg.modelId,
    responseFormat: TOOL_SELECTION_RESPONSE_FORMAT,
    feature: 'tool-selection',
    sessionId: ctx.sessionId,
  })) {
    fullContent += chunk.content;
    if (chunk.done && chunk.usage) {
      ctx.tokenUsage.promptTokens += chunk.usage.inputTokens;
      ctx.tokenUsage.completionTokens += chunk.usage.outputTokens;
      ctx.tokenUsage.totalTokens += chunk.usage.totalTokens;
    }
  }

  const parsed = JSON.parse(fullContent) as ToolSelectionResult;
  return parsed;
}

// ============================================================================
// PROMPT BUILDING
// ============================================================================

function buildSystemPrompt(cfg: ToolSelectionConfig, toolDefinitions: ToolDefinition[]): string {
  const toolList = toolDefinitions
    .map(t => `### ${t.name}\n${t.description}`)
    .join('\n\n');

  let prompt = `You are a tool selection assistant for an AI assistant.

Your job: given the user's message and conversation context, select the best tool to call
and extract the parameters needed to call it.

## Available Tools

${toolList}

## Instructions

1. Read each tool's description carefully to understand when it should be used.
2. Select the tool that best matches the user's intent.
3. Extract all parameters the tool needs from the user's message and context.
4. If the user's message requires no tool (greeting, "what can you do?", "thank you"),
   set isDirectResponse=true and toolSlug=null.
5. If you are genuinely unsure which tool to use or what the user wants, set
   confidence below 0.70 and provide a clarificationQuestion.

## Confidence Guidelines
- 0.90–1.00: Clear, unambiguous request matching one tool
- 0.70–0.89: Likely correct but some ambiguity
- 0.50–0.69: Unclear — provide a clarificationQuestion
- Below 0.50: Cannot determine intent — provide a clarificationQuestion

Always respond with valid JSON matching the schema.`;

  if (cfg.businessDomain) {
    prompt += `\n\n## Business Domain\nThis assistant operates in: ${cfg.businessDomain}.\nIf the user's message is clearly outside this domain, set isDirectResponse=true and provide a polite clarificationQuestion redirecting them.`;
  }

  return prompt;
}

function buildUserPrompt(ctx: PipelineContext): string {
  const parts: string[] = [`User message: "${ctx.userMessage}"`];

  // Add result memory context so AI can resolve ordinal references
  const { referenceIndex } = ctx.resultMemory;
  if (referenceIndex.length > 0) {
    const itemList = referenceIndex
      .map(e => `  Item ${e.ordinal}: ${formatSnapshot(e)}`)
      .join('\n');
    parts.push(`Currently visible results (for resolving "item 1", "option 3", etc.):\n${itemList}`);
  }

  // Add current search context
  const currentQuery = ctx.shared.currentQuery as string | undefined;
  const hasResults = ctx.shared.hasResults as boolean | undefined;
  const resultCount = ctx.shared.resultCount as number | undefined;

  if (currentQuery) {
    parts.push(`Current search query: "${currentQuery}"`);
  }
  if (hasResults) {
    parts.push(`User is currently viewing ${resultCount ?? 'some'} results`);
  }

  return parts.join('\n\n');
}

function formatSnapshot(entry: ResultMemoryEntry): string {
  const s = entry.snapshot;
  const parts: string[] = [];
  if (s.title) parts.push(String(s.title));
  if (s.name) parts.push(String(s.name));
  if (s.price !== undefined) parts.push(`$${s.price}`);
  if (s.id) parts.push(`id:${s.id}`);
  return parts.join(', ') || entry.resultId;
}
