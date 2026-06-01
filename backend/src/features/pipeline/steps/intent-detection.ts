// src/features/pipeline/steps/intent-detection.ts

/**
 * Intent Detection Step (Structured Pipeline)
 *
 * Uses AI to classify user intent and extract structured action + constraints.
 * The AI returns a JSON schema response with action type, search query,
 * constraints, and confidence level.
 *
 * Learnings from old pipeline:
 * - Low temperature (0.1) for consistency
 * - Structured JSON output with strict schema
 * - Retry once on parse failure, fallback to 'clarify'
 * - Simple greeting detection skips AI call entirely
 */

import type { Span } from '@opentelemetry/api';
import { streamChat } from '@/features/ai-service/ai-service.service';
import type { ChatMessage, ResponseFormat } from '@/features/ai-service/ai-service.types';
import type { StepHandler, PipelineContext, StepResult } from '../pipeline.types';

// ============================================================================
// TYPES
// ============================================================================

export type IntentAction =
  | 'search'
  | 'refine'
  | 'rank'
  | 'compare'
  | 'explain'
  | 'knowledge'
  | 'clarify'
  | 'greet';

export interface DetectedIntent {
  action: IntentAction;
  confidence: 'high' | 'medium' | 'low';
  searchQuery?: string;
  constraints?: Array<{
    field: string;
    operator: string;
    value: unknown;
  }>;
  rankingCriteria?: string;
  itemReference?: string;
  itemReferences?: string[];
  target?: 'current_results' | 'focused_items' | 'new_search';
  offTopic?: boolean;
}

interface IntentDetectionConfig {
  temperature?: number;
  maxTokens?: number;
  maxRetries?: number;
  /** AI provider override */
  providerId?: string;
  modelId?: number;
  /** Business domains for off-topic detection */
  businessDomains?: string[];
}

// ============================================================================
// CONSTANTS
// ============================================================================

const GREETING_PATTERNS = [
  /^(hi|hey|hello|howdy|hola|greetings|good\s+(morning|afternoon|evening))[\s!.,?]*$/i,
  /^(what'?s\s+up|yo|sup)[\s!.,?]*$/i,
];

const INTENT_JSON_SCHEMA: ResponseFormat = {
  type: 'json_schema',
  json_schema: {
    name: 'intent_detection',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['search', 'refine', 'rank', 'compare', 'explain', 'knowledge', 'clarify', 'greet'],
        },
        confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
        searchQuery: { type: ['string', 'null'] },
        constraints: {
          type: ['array', 'null'],
          items: {
            type: 'object',
            properties: {
              field: { type: 'string' },
              operator: { type: 'string' },
              value: {},
            },
            required: ['field', 'operator', 'value'],
            additionalProperties: false,
          },
        },
        rankingCriteria: { type: ['string', 'null'] },
        itemReference: { type: ['string', 'null'] },
        itemReferences: { type: ['array', 'null'], items: { type: 'string' } },
        target: { type: ['string', 'null'], enum: ['current_results', 'focused_items', 'new_search', null] },
        offTopic: { type: 'boolean' },
      },
      required: ['action', 'confidence', 'offTopic'],
      additionalProperties: false,
    },
  },
};

// ============================================================================
// STEP HANDLER
// ============================================================================

export const intentDetectionHandler: StepHandler = {
  type: 'intent_detection',

  async execute(
    config: Record<string, unknown>,
    ctx: PipelineContext,
    span: Span,
  ): Promise<StepResult> {
    const cfg = config as unknown as IntentDetectionConfig;

    // Fast path: simple greetings skip AI call
    if (isSimpleGreeting(ctx.userMessage)) {
      const intent: DetectedIntent = { action: 'greet', confidence: 'high', offTopic: false };
      span.setAttribute('intent.action', 'greet');
      span.setAttribute('intent.fast_path', true);
      return {
        success: true,
        data: { intent },
        summary: 'Greeting detected (fast path)',
      };
    }

    const maxRetries = cfg.maxRetries ?? 1;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const intent = await callIntentDetection(ctx, cfg);
        span.setAttribute('intent.action', intent.action);
        span.setAttribute('intent.confidence', intent.confidence);
        span.setAttribute('intent.off_topic', intent.offTopic ?? false);
        if (intent.searchQuery) span.setAttribute('intent.query', intent.searchQuery);

        return {
          success: true,
          data: { intent },
          summary: `Detected intent: ${intent.action} (${intent.confidence})`,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt < maxRetries) continue;
      }
    }

    // All retries exhausted — fallback to clarify
    span.setAttribute('intent.fallback', true);
    const fallbackIntent: DetectedIntent = {
      action: 'clarify',
      confidence: 'low',
      offTopic: false,
    };

    return {
      success: true,
      data: { intent: fallbackIntent, fallbackReason: lastError?.message },
      summary: `Intent detection failed, falling back to clarify: ${lastError?.message}`,
    };
  },
};

// ============================================================================
// AI CALL
// ============================================================================

async function callIntentDetection(
  ctx: PipelineContext,
  cfg: IntentDetectionConfig,
): Promise<DetectedIntent> {
  const systemPrompt = buildIntentSystemPrompt(cfg);
  const userPrompt = buildIntentUserPrompt(ctx);

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    // Include recent conversation for context
    ...ctx.conversationHistory.slice(-6).map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
    { role: 'user', content: userPrompt },
  ];

  let fullContent = '';
  for await (const chunk of streamChat(messages, {
    temperature: cfg.temperature ?? 0.1,
    maxTokens: cfg.maxTokens ?? 500,
    providerId: cfg.providerId,
    modelId: cfg.modelId,
    responseFormat: INTENT_JSON_SCHEMA,
  })) {
    fullContent += chunk.content;
    if (chunk.done && chunk.usage) {
      ctx.tokenUsage.promptTokens += chunk.usage.inputTokens;
      ctx.tokenUsage.completionTokens += chunk.usage.outputTokens;
      ctx.tokenUsage.totalTokens += chunk.usage.totalTokens;
    }
  }

  const parsed = JSON.parse(fullContent);
  return parsed as DetectedIntent;
}

// ============================================================================
// PROMPT BUILDING
// ============================================================================

function buildIntentSystemPrompt(cfg: IntentDetectionConfig): string {
  let prompt = `You are an intent detection system. Analyze the user's message and classify their intent.

Actions:
- search: User wants to find products/items with a new query
- refine: User wants to narrow existing results with additional filters
- rank: User wants to sort/reorder results (price, rating, relevance, etc.)
- compare: User wants to compare 2+ specific items
- explain: User wants details about a specific item
- knowledge: User has a general question not about specific products
- clarify: Message is ambiguous, ask for clarification
- greet: User is greeting or making small talk

Extract constraints as field/operator/value triples when present.
Set offTopic=true only if the message is clearly unrelated to the business domain.
Always respond with valid JSON matching the schema.`;

  if (cfg.businessDomains?.length) {
    prompt += `\n\nBusiness domains: ${cfg.businessDomains.join(', ')}. Set offTopic=true for queries clearly outside ALL listed domains. Be generous — only flag obviously irrelevant queries.`;
  }

  return prompt;
}

function buildIntentUserPrompt(ctx: PipelineContext): string {
  const parts = [`User message: "${ctx.userMessage}"`];

  // Add context about current state from shared
  const currentQuery = ctx.shared.currentQuery as string | undefined;
  const hasResults = ctx.shared.hasResults as boolean | undefined;
  const resultCount = ctx.shared.resultCount as number | undefined;

  if (currentQuery) {
    parts.push(`Current search query: "${currentQuery}"`);
  }
  if (hasResults) {
    parts.push(`User is viewing ${resultCount ?? 'some'} results`);
  }

  return parts.join('\n');
}

// ============================================================================
// HELPERS
// ============================================================================

function isSimpleGreeting(message: string): boolean {
  return GREETING_PATTERNS.some(p => p.test(message.trim()));
}
