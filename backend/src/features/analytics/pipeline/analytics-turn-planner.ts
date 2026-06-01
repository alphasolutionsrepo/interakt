// src/features/analytics/pipeline/analytics-turn-planner.ts

/**
 * D1: Analytics Turn Planner
 *
 * One AI call to decide which tools to use.
 * Sees only tool slugs + 1-line descriptions (NOT full schemas).
 * Outputs a structured plan with tool selections + parameter hints.
 */

import 'server-only';

import { createLogger } from '@/shared/logger/logger';
import type {
  ModuleResult,
  AnalyticsTurnContext,
  AnalyticsTurnPlan,
  AnalyticsToolSummary,
  ChatFn,
} from './analytics-pipeline.types';

const logger = createLogger('analytics-turn-planner');

// ============================================================================
// TOOL SUMMARIES (lightweight, ~600 tokens total)
// ============================================================================

export const ANALYTICS_TOOL_SUMMARIES: AnalyticsToolSummary[] = [
  // Pre-computed (need Refresh Insights)
  { slug: 'get_customer_intent_analysis', description: 'Clustered customer intent groups — what users are asking about', category: 'precomputed' },
  { slug: 'get_catalog_health', description: 'Zero-result rates and content gaps (retry-deduplicated)', category: 'precomputed' },
  { slug: 'get_ai_effectiveness', description: 'AI success rate, failure modes, response presets', category: 'precomputed' },
  { slug: 'get_demand_signals', description: 'Trending brands, categories, and search terms', category: 'precomputed' },
  { slug: 'get_cost_analysis', description: 'Token usage and per-conversation costs', category: 'precomputed' },
  { slug: 'get_proactive_insights', description: 'AI-detected issues, anomalies, and recommendations', category: 'precomputed' },
  { slug: 'get_guardrail_analytics', description: 'Query classification and guardrail filtering stats', category: 'precomputed' },
  // Live query (always fresh)
  { slug: 'get_search_overview', description: 'Total searches, unique queries, zero-result rate, latency', category: 'live' },
  { slug: 'get_search_trends', description: 'Search volume over time (time-series)', category: 'live' },
  { slug: 'get_popular_queries', description: 'Top search queries ranked by frequency', category: 'live' },
  { slug: 'get_zero_result_queries', description: 'Queries that always return no results (content gaps)', category: 'live' },
  { slug: 'get_search_type_breakdown', description: 'Lexical vs semantic vs hybrid distribution', category: 'live' },
  { slug: 'get_search_performance', description: 'Latency percentiles (p50, p95, p99)', category: 'live' },
  { slug: 'get_recent_searches', description: 'Most recent individual search events', category: 'live' },
  { slug: 'get_query_search_events', description: 'All events for a specific query (needs queryText in hints)', category: 'live', requiresParam: 'queryText' },
  // Special
  { slug: 'get_conversation_detail', description: 'Detailed span timeline for a trace (needs traceId in hints)', category: 'special', requiresParam: 'traceId' },
];

// ============================================================================
// RESPONSE FORMAT (strict JSON schema)
// ============================================================================

// Build response format with tool slugs as enum for strict validation
function buildPlanResponseFormat(tools: AnalyticsToolSummary[]) {
  const slugs = tools.map((t) => t.slug);

  return {
    type: 'json_schema' as const,
    json_schema: {
      name: 'analytics_turn_plan',
      strict: true,
      schema: {
        type: 'object',
        properties: {
          actions: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                toolSlug: { type: 'string', enum: slugs },
                hints: { type: 'string' }, // JSON string
                intent: { type: 'string' },
              },
              required: ['toolSlug', 'hints', 'intent'],
              additionalProperties: false,
            },
          },
          reasoning: { type: 'string' },
          directResponse: { type: 'boolean' },
        },
        required: ['actions', 'reasoning', 'directResponse'],
        additionalProperties: false,
      },
    },
  };
}

// ============================================================================
// SYSTEM PROMPT
// ============================================================================

function buildPlannerPrompt(tools: AnalyticsToolSummary[]): string {
  const toolList = tools
    .map((t) => `- **${t.slug}**: ${t.description} [${t.category}]`)
    .join('\n');

  return `You are a turn planner for an analytics assistant. Decide which tools to use to answer the user's question.

## Available tools
${toolList}

## Rules
1. Select 1-3 tools from the list. Use exact slugs.
2. Tools marked [precomputed] require "Refresh Insights" to have been run.
3. For greetings, "thanks", "what can you do?" → set directResponse=true, empty actions.
4. Default timeRange: '7d' for precomputed tools, '24h' for live tools, unless user specifies.
5. hints must be a JSON string with tool parameters: { "timeRange": "7d", "limit": 10 }
6. For get_query_search_events, hints MUST include "queryText".
7. For get_conversation_detail, hints MUST include "traceId".
8. Prefer the most specific tool for the question:
   - "What are customers looking for?" → get_customer_intent_analysis
   - "What should I focus on?" / "Any issues?" → get_proactive_insights
   - "Is the AI helping?" → get_ai_effectiveness
   - "What's trending?" → get_demand_signals
   - "Top queries?" / "Most searched?" → get_popular_queries
   - "Show me search performance" → get_search_performance
   - "Content gaps?" / "Missing content?" → get_catalog_health
   - "How much is AI costing?" → get_cost_analysis
9. If unsure, pick ONE tool that best matches. Do not call multiple tools unless the question clearly spans multiple areas.`;
}

// ============================================================================
// MAIN
// ============================================================================

export async function planAnalyticsTurn(
  context: AnalyticsTurnContext,
  chat: ChatFn
): Promise<ModuleResult<AnalyticsTurnPlan>> {
  const startTime = Date.now();

  try {
    // Build messages
    const messages: Array<{ role: string; content: string }> = [
      { role: 'system', content: buildPlannerPrompt(context.availableTools) },
    ];

    // Add conversation summary if available
    if (context.conversationSummary) {
      messages.push({
        role: 'system',
        content: `## Previous conversation summary\n${context.conversationSummary}`,
      });
    }

    // Add session facts
    if (Object.keys(context.sessionFacts).length > 0) {
      const factsStr = Object.entries(context.sessionFacts)
        .map(([k, v]) => `- ${k}: ${v}`)
        .join('\n');
      messages.push({
        role: 'system',
        content: `## Session context\n${factsStr}`,
      });
    }

    // Add recent conversation history
    for (const msg of context.conversationHistory) {
      messages.push({ role: msg.role, content: msg.content });
    }

    // Add current user message
    messages.push({ role: 'user', content: context.userMessage });

    // Call AI with enum-constrained tool slugs
    const responseFormat = buildPlanResponseFormat(context.availableTools);
    const result = await chat(messages, {
      temperature: 0.1,
      maxTokens: 600,
      responseFormat,
      feature: 'analytics-planner',
    });

    // Parse response — handle string or content blocks
    const content = typeof result.message.content === 'string'
      ? result.message.content
      : Array.isArray(result.message.content)
        ? (result.message.content as Array<{ type: string; text?: string }>)
            .filter((b) => b.type === 'text')
            .map((b) => b.text || '')
            .join('')
        : String(result.message.content);

    // Parse JSON with fallback on truncation or malformed response
    let plan: {
      actions: Array<{ toolSlug: string; hints: string; intent: string }>;
      reasoning: string;
      directResponse: boolean;
    };

    try {
      plan = JSON.parse(content);
    } catch (parseError) {
      logger.warn('Failed to parse planner JSON, using keyword fallback', {
        contentLength: content.length,
        contentPreview: content.slice(0, 200),
      });
      // Fallback: try to match user message to a tool using keyword matching
      return {
        success: true,
        data: keywordFallbackPlan(context.userMessage, context.availableTools),
        summary: 'Used keyword fallback (JSON parse failed)',
        durationMs: Date.now() - startTime,
      };
    }

    // Auto-correct: directResponse=true but has actions
    if (plan.directResponse && plan.actions.length > 0) {
      logger.info('Auto-corrected directResponse=true with non-empty actions');
      plan.directResponse = false;
    }

    // Parse hints from JSON strings to objects
    const validSlugs = new Set(context.availableTools.map((t) => t.slug));
    const validActions = plan.actions
      .filter((action) => {
        if (!validSlugs.has(action.toolSlug)) {
          logger.warn('Planner selected invalid tool, skipping', { slug: action.toolSlug });
          return false;
        }
        return true;
      })
      .map((action) => {
        let hints: Record<string, unknown> = {};
        try {
          hints = JSON.parse(action.hints);
        } catch {
          logger.warn('Failed to parse hints, using empty', { hints: action.hints });
        }
        return {
          toolSlug: action.toolSlug,
          hints,
          intent: action.intent,
        };
      });

    // Edge case: no valid actions AND not a direct response → fallback to keyword match
    if (validActions.length === 0 && !plan.directResponse) {
      logger.warn('No valid actions in plan, using keyword fallback');
      return {
        success: true,
        data: keywordFallbackPlan(context.userMessage, context.availableTools),
        summary: 'Used keyword fallback (no valid actions in plan)',
        durationMs: Date.now() - startTime,
      };
    }

    const turnPlan: AnalyticsTurnPlan = {
      actions: validActions,
      reasoning: plan.reasoning,
      directResponse: plan.directResponse,
    };

    logger.info('Turn plan created', {
      actions: validActions.map((a) => a.toolSlug),
      directResponse: plan.directResponse,
      reasoning: plan.reasoning.slice(0, 100),
    });

    return {
      success: true,
      data: turnPlan,
      summary: plan.directResponse
        ? 'Direct response (no tools needed)'
        : `Plan: ${validActions.map((a) => a.toolSlug).join(', ')}`,
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    logger.error('Turn planner failed, using keyword fallback', { error });

    // Even on complete failure, try keyword matching rather than failing the whole pipeline
    return {
      success: true,
      data: keywordFallbackPlan(context.userMessage, context.availableTools),
      summary: `Planner failed, used keyword fallback: ${error instanceof Error ? error.message : 'Unknown'}`,
      durationMs: Date.now() - startTime,
    };
  }
}

// ============================================================================
// KEYWORD FALLBACK (when AI planner fails or returns invalid)
// ============================================================================

const KEYWORD_TOOL_MAP: Array<{ keywords: string[]; slug: string }> = [
  { keywords: ['customer', 'looking for', 'asking', 'intent', 'want'], slug: 'get_customer_intent_analysis' },
  { keywords: ['catalog', 'content gap', 'missing', 'zero result', 'failing'], slug: 'get_catalog_health' },
  { keywords: ['ai help', 'effective', 'success rate', 'ai performance'], slug: 'get_ai_effectiveness' },
  { keywords: ['trending', 'demand', 'brand', 'category', 'popular brand'], slug: 'get_demand_signals' },
  { keywords: ['cost', 'token', 'spending', 'expensive'], slug: 'get_cost_analysis' },
  { keywords: ['focus', 'issue', 'problem', 'insight', 'attention', 'fix'], slug: 'get_proactive_insights' },
  { keywords: ['guardrail', 'block', 'filter', 'classification'], slug: 'get_guardrail_analytics' },
  { keywords: ['overview', 'summary', 'overall', 'health'], slug: 'get_search_overview' },
  { keywords: ['trend', 'volume', 'over time', 'chart'], slug: 'get_search_trends' },
  { keywords: ['top quer', 'popular quer', 'most searched', 'top search'], slug: 'get_popular_queries' },
  { keywords: ['performance', 'latency', 'speed', 'response time', 'p95'], slug: 'get_search_performance' },
  { keywords: ['recent', 'latest', 'live', 'happening now'], slug: 'get_recent_searches' },
];

function keywordFallbackPlan(
  userMessage: string,
  availableTools: AnalyticsToolSummary[]
): AnalyticsTurnPlan {
  const lower = userMessage.toLowerCase();
  const validSlugs = new Set(availableTools.map((t) => t.slug));

  // Check for greetings
  if (/^(hi|hello|hey|thanks|thank you|what can you do)\b/i.test(lower)) {
    return {
      actions: [],
      reasoning: 'Greeting or general question detected via keyword fallback',
      directResponse: true,
    };
  }

  // Find best matching tool
  let bestSlug = 'get_search_overview'; // safe default
  let bestScore = 0;

  for (const entry of KEYWORD_TOOL_MAP) {
    if (!validSlugs.has(entry.slug)) continue;
    const score = entry.keywords.filter((kw) => lower.includes(kw)).length;
    if (score > bestScore) {
      bestScore = score;
      bestSlug = entry.slug;
    }
  }

  return {
    actions: [
      {
        toolSlug: bestSlug,
        hints: { timeRange: '7d' },
        intent: `Keyword-matched tool for: "${userMessage.slice(0, 60)}"`,
      },
    ],
    reasoning: `Keyword fallback selected ${bestSlug} (score: ${bestScore})`,
    directResponse: false,
  };
}
