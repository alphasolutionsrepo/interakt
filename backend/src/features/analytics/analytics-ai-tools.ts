// src/features/analytics/analytics-ai-tools.ts

/**
 * Analytics AI Tools
 *
 * These tools can be used by the AI chat to query analytics data.
 * Each tool is designed to answer specific questions about search and AI usage.
 */

import 'server-only';

import { getThresholds } from './analytics-thresholds';
import {
  getOverviewMetrics,
  getSearchTrends,
  getPopularQueries,
  getZeroResultQueries,
  getSearchTypeBreakdown,
  getPerformanceMetrics,
  getRecentSearchEvents,
  getQuerySearchEvents,
  type TimeRange,
} from './index';
import { getConversationDetail } from './conversation-analytics.service';

// ============================================================================
// RESULT CACHING (5 minute TTL)
// ============================================================================

interface CacheEntry {
  data: unknown;
  timestamp: number;
}

const toolResultCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function getCacheKey(toolName: string, args: Record<string, unknown>): string {
  return `${toolName}:${JSON.stringify(args)}`;
}

function getCachedResult(key: string): unknown | null {
  const entry = toolResultCache.get(key);
  if (!entry) return null;

  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    toolResultCache.delete(key);
    return null;
  }

  return entry.data;
}

function setCachedResult(key: string, data: unknown): void {
  toolResultCache.set(key, { data, timestamp: Date.now() });

  // Clean old entries periodically (when cache gets large)
  if (toolResultCache.size > 100) {
    const now = Date.now();
    for (const [k, v] of toolResultCache.entries()) {
      if (now - v.timestamp > CACHE_TTL_MS) {
        toolResultCache.delete(k);
      }
    }
  }
}

// ============================================================================
// TOOL DEFINITIONS (for AI function calling)
// ============================================================================

export function getAnalyticsToolDefinitions() {
  const t = getThresholds();
  return [
  {
    name: 'get_search_overview',
    description: `Get an overview of search analytics including total searches, unique queries, zero result rate, and average latency.

INTELLIGENT INTERPRETATION:
- Default timeRange is '24h' if user doesn't specify.
- ALWAYS mention the time period in your response: "In the last 24 hours..." or "Over the past 7 days..."
- If totalSearches is 0, tell the user "No searches have been recorded in this period" rather than showing zero metrics.
- If zeroResultRate > ${(t.zeroResultRate.warning * 100).toFixed(0)}%, this indicates content gaps worth investigating.
- After showing results, offer to check different periods or drill into specific metrics.

WHEN TO USE: General questions about search health, overview requests, or starting a conversation about analytics.`,
    parameters: {
      type: 'object',
      properties: {
        timeRange: {
          type: 'string',
          enum: ['1h', '24h', '7d', '30d', '90d'],
          description: 'Time range for the analytics. Default is 24h.',
        },
        experienceId: {
          type: 'string',
          description: 'Optional: Filter by specific search experience ID',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_search_trends',
    description: `Get search volume trends over time as time-series data for charting.

INTELLIGENT INTERPRETATION:
- Default timeRange is '24h' showing hourly data points.
- If the array is empty or all values are 0, tell the user "No search activity recorded in this period."
- Look for patterns: spikes might indicate marketing campaigns, drops might indicate issues.
- For trend questions, suggest using 7d or 30d for meaningful patterns.
- After showing results, offer: "Would you like me to compare this to the previous period?"

WHEN TO USE: Questions about search volume over time, patterns, anomalies, or "how has search been performing."`,
    parameters: {
      type: 'object',
      properties: {
        timeRange: {
          type: 'string',
          enum: ['1h', '24h', '7d', '30d', '90d'],
          description: 'Time range for the trends',
        },
        experienceId: {
          type: 'string',
          description: 'Optional: Filter by specific search experience ID',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_popular_queries',
    description: `Get the most popular search queries ranked by frequency.

INTELLIGENT INTERPRETATION:
- Default timeRange is '24h'.
- If the array is empty, tell the user "No searches recorded in this period."
- IMPORTANT: zeroResultCount shows how many times THIS SPECIFIC QUERY returned zero results out of total searchCount.
- A query can have BOTH successful searches AND failed searches. Example: "jacket" with 61 searches and 7 zero results means 54 searches returned results, but 7 times it returned nothing (possibly due to filters, typos in variations, or timing issues).
- This is DIFFERENT from get_zero_result_queries which only shows queries that ALWAYS fail.
- If zeroResultCount > 0, offer: "Would you like me to look at the specific search events for '[query]' to understand why some searches failed?"
- If a query has low avgResults, it might indicate poor relevance.

WHEN TO USE: Questions about top search queries by volume, popular searches, most searched terms, "show me top queries", "what are people searching for"
NOTE: For semantic intent grouping (clustered themes), use get_customer_intent_analysis instead.`,
    parameters: {
      type: 'object',
      properties: {
        timeRange: {
          type: 'string',
          enum: ['1h', '24h', '7d', '30d', '90d'],
          description: 'Time range for the query analysis',
        },
        experienceId: {
          type: 'string',
          description: 'Optional: Filter by specific search experience ID',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of queries to return (default 20)',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_zero_result_queries',
    description: `Get queries from the DEDUPLICATED zero-result queries table - these are queries tracked for content gap analysis.

IMPORTANT DATA SOURCE DIFFERENCE:
- This queries the zeroResultQueries table which is a ROLLUP/AGGREGATED table.
- It contains queries that have been flagged for content gap analysis.
- This is DIFFERENT from zeroResultCount in get_popular_queries, which shows real-time counts from raw search events.
- If a query sometimes returns results and sometimes doesn't, it may NOT appear here but WILL show a zeroResultCount in popular queries.

INTELLIGENT INTERPRETATION:
- Default timeRange is '24h'.
- If the array is empty, it could mean: (a) No queries have been flagged for content gaps, OR (b) All flagged queries have been resolved.
- This does NOT mean zero searches failed - check get_popular_queries for zeroResultCount to see intermittent failures.
- High occurrence counts indicate urgent content gaps to address.
- After showing results, offer: "Would you like suggestions on which content to add?"

WHEN TO USE: Questions about content gaps, queries that ALWAYS fail, "what content should we add."
NOT FOR: Understanding why a specific popular query sometimes fails (use get_query_search_events instead).`,
    parameters: {
      type: 'object',
      properties: {
        timeRange: {
          type: 'string',
          enum: ['1h', '24h', '7d', '30d', '90d'],
          description: 'Time range for the analysis',
        },
        experienceId: {
          type: 'string',
          description: 'Optional: Filter by specific search experience ID',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of queries to return (default 50)',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_search_type_breakdown',
    description: `Get breakdown of search types used (lexical, semantic, hybrid).

INTELLIGENT INTERPRETATION:
- Default timeRange is '24h'.
- If all values are 0, tell the user "No searches recorded in this period."
- High semantic usage indicates AI-powered search is working.
- High lexical-only might indicate simpler queries or fallback behavior.
- After showing results, offer: "Want to see how performance differs by search type?"

WHEN TO USE: Questions about search methods, AI vs keyword search, search technology distribution.`,
    parameters: {
      type: 'object',
      properties: {
        timeRange: {
          type: 'string',
          enum: ['1h', '24h', '7d', '30d', '90d'],
          description: 'Time range for the analysis',
        },
        experienceId: {
          type: 'string',
          description: 'Optional: Filter by specific search experience ID',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_search_performance',
    description: `Get detailed search performance metrics including latency percentiles (p50, p95, p99).

CRITICAL INTERPRETATION RULES:
- Default timeRange is '24h'.
- If ALL metrics are 0 (avgDurationMs=0, p50=0, p95=0, p99=0), this means NO SEARCHES occurred.
  DO NOT say "response time is 0ms" - instead say "No searches were recorded in this period."
- p50 (median) shows typical user experience.
- p95/p99 show worst-case scenarios - flag if > ${t.latency.acceptable}ms.
- avgEsDurationMs shows Elasticsearch time, avgEmbeddingDurationMs shows AI embedding time.
- After showing results, offer: "Would you like me to check a different time period (1h, 7d, 30d)?"

PERFORMANCE THRESHOLDS:
- < ${t.latency.excellent}ms: Excellent
- ${t.latency.excellent}-${t.latency.good}ms: Good
- ${t.latency.good}-${t.latency.acceptable}ms: Acceptable
- > ${t.latency.acceptable}ms: Needs attention

WHEN TO USE: Questions about response time, latency, speed, performance issues.`,
    parameters: {
      type: 'object',
      properties: {
        timeRange: {
          type: 'string',
          enum: ['1h', '24h', '7d', '30d', '90d'],
          description: 'Time range for the analysis',
        },
        experienceId: {
          type: 'string',
          description: 'Optional: Filter by specific search experience ID',
        },
      },
      required: [],
    },
  },
  // =========================================================================
  // BUSINESS-FOCUSED TOOLS (read from pre-computed analytics_insights)
  // =========================================================================
  {
    name: 'get_customer_intent_analysis',
    description: `Analyze what customers are asking about by showing clustered intent groups.

WHAT IT RETURNS:
- Semantically grouped clusters of customer intents (e.g., "Hockey Equipment Search", "Size Questions")
- Each cluster has: label, count, success rate, sample queries
- Shows total unique intents and how they're distributed

BUSINESS INTERPRETATION:
- High-count clusters = most common customer needs
- Low success rate on a cluster = content gap for that topic
- Many small clusters = diverse customer base
- Suggest focusing catalog improvements on high-count, low-success clusters

REQUIRES: Analytics processing must be run first (Refresh Insights button).
If data is not available, tell the admin to run "Refresh Insights" first.

WHEN TO USE: "What are customers looking for?", "What do users ask about?", "Show me customer intents", "What are users searching for?", "What are people asking?"
NOT FOR: Top search queries by count (use get_popular_queries), trending brands/categories (use get_demand_signals)`,
    parameters: {
      type: 'object',
      properties: {
        timeRange: {
          type: 'string',
          enum: ['24h', '7d', '30d'],
          description: 'Time range for the analysis. Default is 7d.',
        },
        experienceId: {
          type: 'string',
          description: 'Optional: Filter by specific experience ID',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_catalog_health',
    description: `Analyze catalog health with retry-deduplicated zero-result rates.

WHAT IT RETURNS:
- Real zero-result rate (deduplicated for AI retries) vs apparent rate
- Top queries returning no results
- Retry analysis: how many searches needed multiple attempts

BUSINESS INTERPRETATION:
- IMPORTANT: The "real" zero-result rate removes retry inflation. A conversation that retried 3 times and succeeded = 1 success, not "2 failures + 1 success"
- High real zero-result rate = genuine content gaps
- High retry rate = AI working harder, increasing costs and response times
- Top zero-result queries = specific gaps to fill

REQUIRES: Analytics processing must be run first.

WHEN TO USE: "Where is my catalog failing?", "What content am I missing?", "Are searches returning results?"`,
    parameters: {
      type: 'object',
      properties: {
        timeRange: {
          type: 'string',
          enum: ['24h', '7d', '30d'],
          description: 'Time range. Default is 7d.',
        },
        experienceId: {
          type: 'string',
          description: 'Optional: Filter by specific experience ID',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_ai_effectiveness',
    description: `Evaluate how well the AI assistant is serving customers.

WHAT IT RETURNS:
- Success rate, retry rate, failure modes (plan_failed, context_assembly_failed)
- Decision distribution: direct response vs tool call vs error
- Response preset distribution (item_grid, rich_text, etc.)
- Average conversation duration

BUSINESS INTERPRETATION:
- Success rate shows overall AI reliability
- High direct_response rate may mean AI is answering without searching (could be good or bad)
- Plan failures suggest complex queries the AI can't handle
- Preset distribution shows how the AI is formatting responses

REQUIRES: Analytics processing must be run first.

WHEN TO USE: "Is the AI helping?", "How effective is the AI?", "AI success rate", "How is the assistant performing?"`,
    parameters: {
      type: 'object',
      properties: {
        timeRange: {
          type: 'string',
          enum: ['24h', '7d', '30d'],
          description: 'Time range. Default is 7d.',
        },
        experienceId: {
          type: 'string',
          description: 'Optional: Filter by specific experience ID',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_demand_signals',
    description: `Show trending brands, categories, and search terms.

WHAT IT RETURNS:
- Top brands mentioned in search filters/queries
- Top categories being searched
- Most frequent search queries

BUSINESS INTERPRETATION:
- Rising brands = growing customer interest, ensure stock
- Top categories = where to focus merchandising
- Query patterns reveal what language customers use

REQUIRES: Analytics processing must be run first.

WHEN TO USE: "What's trending?", "Popular brands?", "What categories are hot?", "Demand signals", "Brand trends"
NOT FOR: What are users searching for (use get_customer_intent_analysis), top search queries (use get_popular_queries)`,
    parameters: {
      type: 'object',
      properties: {
        timeRange: {
          type: 'string',
          enum: ['24h', '7d', '30d'],
          description: 'Time range. Default is 7d.',
        },
        experienceId: {
          type: 'string',
          description: 'Optional: Filter by specific experience ID',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_cost_analysis',
    description: `Analyze AI token usage and cost metrics.

WHAT IT RETURNS:
- Total token usage (input/output breakdown)
- Per-conversation average and max token usage
- Retry waste: tokens spent on non-final retry attempts
- Total conversations processed

BUSINESS INTERPRETATION:
- High retry waste percentage = optimization opportunity
- Outlier conversations (max >> avg) may indicate loops or complex queries
- Token distribution between input/output shows conversation patterns

REQUIRES: Analytics processing must be run first.

WHEN TO USE: "How much is AI costing?", "Token usage?", "AI costs?", "Where are we spending tokens?"`,
    parameters: {
      type: 'object',
      properties: {
        timeRange: {
          type: 'string',
          enum: ['24h', '7d', '30d'],
          description: 'Time range. Default is 7d.',
        },
        experienceId: {
          type: 'string',
          description: 'Optional: Filter by specific experience ID',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_proactive_insights',
    description: `Get AI-detected issues, opportunities, and recommendations.

WHAT IT RETURNS:
- Prioritized list of insights with severity (critical/warning/info)
- Categories: search_quality, content_gap, ai_behavior, cost, demand
- Each insight has a title, description, metric, and suggested action

BUSINESS INTERPRETATION:
- Critical insights need immediate attention
- Warning insights are opportunities for improvement
- Info insights are observations about trends and patterns
- Always present the top 3-5 most important insights conversationally

REQUIRES: Analytics processing must be run first.
This tool should be called first when starting a new conversation.

WHEN TO USE: "What should I focus on?", "Any issues?", "What needs attention?", "Give me insights", or at the START of any new analytics conversation.`,
    parameters: {
      type: 'object',
      properties: {
        timeRange: {
          type: 'string',
          enum: ['24h', '7d', '30d'],
          description: 'Time range. Default is 7d.',
        },
        experienceId: {
          type: 'string',
          description: 'Optional: Filter by specific experience ID',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_guardrail_analytics',
    description: `Analyze guardrail classification and filtering behavior.

WHAT IT RETURNS:
- Classification distribution (domain/general/greeting/blocked)
- Block rate and blocklist match count
- Domain similarity statistics
- Short-circuit rate

BUSINESS INTERPRETATION:
- High block rate may mean legitimate queries are being filtered
- Low domain similarity scores suggest users asking off-topic questions
- Blocklist matches show specific terms being caught

REQUIRES: Analytics processing must be run first.

WHEN TO USE: "Are we blocking legitimate queries?", "Guardrail performance?", "How is content filtering working?"`,
    parameters: {
      type: 'object',
      properties: {
        timeRange: {
          type: 'string',
          enum: ['24h', '7d', '30d'],
          description: 'Time range. Default is 7d.',
        },
        experienceId: {
          type: 'string',
          description: 'Optional: Filter by specific experience ID',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_conversation_detail',
    description: `Get a detailed timeline view of a single conversation trace.

WHAT IT RETURNS:
- Full span timeline for a trace: user message → plan → tool calls → response
- Each span shows: operation, duration, status, tool results, AI reasoning

BUSINESS INTERPRETATION:
- Shows exactly what happened in a specific conversation
- Useful for debugging failed conversations or understanding AI behavior
- Look for: long durations, failed tool calls, unexpected outcomes

This is a LIVE query (not pre-computed) — it reads directly from span data.

WHEN TO USE: "Show me conversation X", "What happened in trace Y?", "Debug this conversation"`,
    parameters: {
      type: 'object',
      properties: {
        traceId: {
          type: 'string',
          description: 'The trace ID of the conversation to inspect',
        },
      },
      required: ['traceId'],
    },
  },
  {
    name: 'get_recent_searches',
    description: `Get the most recent search events showing real-time activity.

INTELLIGENT INTERPRETATION:
- This shows live/recent data, not aggregated metrics.
- If the array is empty, tell the user "No recent searches found."
- Look for patterns in trigger types (user vs AI-initiated).
- Failed searches (success=false) indicate issues worth investigating.
- After showing results, offer: "Want me to analyze the overall search performance?"

WHEN TO USE: Questions about recent activity, live searches, "what's happening now."`,
    parameters: {
      type: 'object',
      properties: {
        experienceId: {
          type: 'string',
          description: 'Optional: Filter by specific search experience ID',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of events to return (default 20)',
        },
      },
      required: [],
    },
  },

  {
    name: 'get_query_search_events',
    description: `Get all individual search events for a specific query term. This shows EVERY search that was made with this query, including which ones succeeded and which returned zero results.

THIS IS THE TOOL TO USE when:
- The user asks "why did X searches for 'jacket' fail?"
- The user wants to understand intermittent failures for a popular query
- The user sees zeroResultCount > 0 in popular queries and wants details

WHAT IT RETURNS:
- Each individual search event with: timestamp, query text, search type, trigger type, total results, whether it was a zero result, and if filters were used
- This lets you see PATTERNS: maybe zero results happen when filters are applied, or only for certain search types

INTELLIGENT INTERPRETATION:
- Compare searches that returned results vs zero results
- Look for patterns: Did zero results happen with filters? With certain search types?
- triggerType shows if it was user, AI tool, or AI RAG initiated
- hasFilters=true with isZeroResult=true might indicate filters are too restrictive
- After showing results, suggest: "Would you like me to look for patterns in why some searches failed?"`,
    parameters: {
      type: 'object',
      properties: {
        queryText: {
          type: 'string',
          description: 'The exact query text to search for (case-insensitive)',
        },
        timeRange: {
          type: 'string',
          enum: ['1h', '24h', '7d', '30d', '90d'],
          description: 'Time range for the analysis. Default is 7d.',
        },
        experienceId: {
          type: 'string',
          description: 'Optional: Filter by specific search experience ID',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of events to return (default 50)',
        },
      },
      required: ['queryText'],
    },
  },

  // =========================================================================
  // RESPONSE FORMATTING TOOL
  // =========================================================================
  {
    name: 'respond_with_analytics',
    description: `REQUIRED: Call this tool to format your final response after analyzing data from other tools.

This ensures consistent, intelligent responses with proper context and follow-up suggestions.

HOW TO USE:
1. First, call the appropriate data tool(s) to get analytics data
2. Analyze the results
3. Call this tool with your interpretation

RULES FOR summary:
- Be conversational, not robotic
- Include the time period: "In the last 24 hours..."
- Provide insight, not just data repetition
- If no data: explain what that means, don't just say "0"

RULES FOR dataStatus:
- 'has_data': Normal data exists to discuss
- 'no_data': All metrics are zero/empty - no activity in the period
- 'sparse_data': Very little data - might want longer period
- 'anomaly': Something unusual detected worth highlighting

RULES FOR suggestedFollowUps:
- Provide 1-3 natural follow-up questions
- Make them specific to the data context
- Examples: "Check a longer time period", "See the breakdown by search type"`,
    parameters: {
      type: 'object',
      properties: {
        summary: {
          type: 'string',
          description:
            'Brief 1-2 sentence insight about the data. Be conversational. Include the time period. Interpret, do not just restate numbers.',
        },
        dataStatus: {
          type: 'string',
          enum: ['has_data', 'no_data', 'sparse_data', 'anomaly'],
          description: 'Classification of the data state to guide UI presentation',
        },
        timePeriodUsed: {
          type: 'string',
          description: 'The time period that was queried (e.g., "last 24 hours", "past 7 days")',
        },
        suggestedFollowUps: {
          type: 'array',
          items: { type: 'string' },
          description: '1-3 natural follow-up questions the user might want to ask',
        },
      },
      required: ['summary', 'dataStatus', 'timePeriodUsed'],
    },
  },
];
}

/** @deprecated Use getAnalyticsToolDefinitions() instead */
export const analyticsToolDefinitions = getAnalyticsToolDefinitions();

// ============================================================================
// DATA TYPE MAPPING
// ============================================================================

/**
 * Maps tool names to their data types for rich rendering
 */
export const TOOL_DATA_TYPES: Record<string, string> = {
  // Existing search tools
  get_search_overview: 'overview_metrics',
  get_search_trends: 'search_trends',
  get_popular_queries: 'popular_queries',
  get_zero_result_queries: 'zero_result_queries',
  get_search_type_breakdown: 'search_type_breakdown',
  get_search_performance: 'performance_metrics',
  get_recent_searches: 'recent_searches',
  get_query_search_events: 'query_search_events',
  // New business-focused tools
  get_customer_intent_analysis: 'customer_intents',
  get_catalog_health: 'catalog_health',
  get_ai_effectiveness: 'ai_effectiveness',
  get_demand_signals: 'demand_signals',
  get_cost_analysis: 'cost_analysis',
  get_proactive_insights: 'proactive_insights',
  get_guardrail_analytics: 'guardrail_analytics',
  get_conversation_detail: 'conversation_detail',
  // Response formatting tool
  respond_with_analytics: 'response_metadata',
};

// ============================================================================
// TOOL EXECUTION
// ============================================================================

export interface ToolExecutionResult {
  success: boolean;
  data?: unknown;
  /** Raw structured data for rich rendering */
  rawData?: unknown;
  /** Data type identifier for frontend rendering */
  dataType?: string;
  error?: string;
}

/**
 * Execute an analytics tool by name with given arguments
 * Results are cached for 5 minutes to avoid repeated queries
 * Returns both formatted text (for AI) and raw data (for rich rendering)
 */
export async function executeAnalyticsTool(
  toolName: string,
  args: Record<string, unknown>
): Promise<ToolExecutionResult> {
  // Check cache first
  const cacheKey = getCacheKey(toolName, args);
  const cached = getCachedResult(cacheKey);
  if (cached !== null) {
    const cachedData = cached as { formatted: string; raw: unknown };
    return {
      success: true,
      data: cachedData.formatted,
      rawData: cachedData.raw,
      dataType: TOOL_DATA_TYPES[toolName],
    };
  }

  try {
    const timeRange = (args.timeRange as TimeRange) || '24h';
    const experienceId = args.experienceId as string | undefined;
    const limit = (args.limit as number) || undefined;

    console.log(`[analytics-tool] ${toolName} experienceId=${experienceId ?? 'null'} timeRange=${timeRange}`);

    let formatted: string;
    let raw: unknown;

    switch (toolName) {
      case 'get_search_overview': {
        const data = await getOverviewMetrics(timeRange, experienceId);
        formatted = formatOverviewForAI(data);
        raw = data;
        break;
      }

      case 'get_search_trends': {
        const data = await getSearchTrends(timeRange, experienceId);
        formatted = formatTrendsForAI(data);
        raw = data;
        break;
      }

      case 'get_popular_queries': {
        const data = await getPopularQueries(timeRange, experienceId, limit || 20);
        formatted = formatPopularQueriesForAI(data);
        raw = data;
        break;
      }

      case 'get_zero_result_queries': {
        const data = await getZeroResultQueries(timeRange, experienceId, limit || 50);
        formatted = formatZeroResultsForAI(data);
        raw = data;
        break;
      }

      case 'get_search_type_breakdown': {
        const data = await getSearchTypeBreakdown(timeRange, experienceId);
        formatted = formatSearchTypesForAI(data);
        raw = data;
        break;
      }

      case 'get_search_performance': {
        const data = await getPerformanceMetrics(timeRange, experienceId);
        formatted = formatPerformanceForAI(data);
        raw = data;
        break;
      }

      // =================================================================
      // NEW BUSINESS-FOCUSED TOOLS (read from pre-computed insights)
      // =================================================================

      case 'get_customer_intent_analysis':
      case 'get_catalog_health':
      case 'get_ai_effectiveness':
      case 'get_demand_signals':
      case 'get_cost_analysis':
      case 'get_proactive_insights':
      case 'get_guardrail_analytics': {
        const insightTimeRange = (['24h', '7d', '30d'].includes(timeRange) ? timeRange : '7d') as string;
        const insightType = TOOL_TO_INSIGHT_TYPE[toolName];
        const result = await getPreComputedInsight(insightType, insightTimeRange, experienceId);
        if (!result) {
          return {
            success: true,
            data: 'No pre-computed analytics data available. The admin needs to click "Refresh Insights" on the analytics page to process the latest data before this tool can provide results.',
            rawData: { empty: true, reason: 'not_processed' },
            dataType: TOOL_DATA_TYPES[toolName],
          };
        }
        formatted = formatInsightForAI(toolName, result);
        raw = result;
        break;
      }

      case 'get_conversation_detail': {
        const traceId = args.traceId as string;
        if (!traceId) {
          return { success: false, error: 'traceId is required' };
        }
        const detail = await getConversationDetail(traceId);
        if (!detail) {
          return {
            success: true,
            data: `No conversation found for trace ID "${traceId}".`,
            rawData: null,
            dataType: 'conversation_detail',
          };
        }
        formatted = formatConversationDetailForAI(detail);
        raw = detail;
        break;
      }

      case 'get_recent_searches': {
        const data = await getRecentSearchEvents(limit || 20, experienceId);
        formatted = formatRecentSearchesForAI(data);
        raw = data;
        break;
      }

      case 'get_query_search_events': {
        const queryText = args.queryText as string;
        if (!queryText) {
          return { success: false, error: 'queryText is required' };
        }
        const queryTimeRange = (args.timeRange as TimeRange) || '7d';
        const data = await getQuerySearchEvents(queryText, queryTimeRange, experienceId, limit || 50);
        formatted = formatQuerySearchEventsForAI(data, queryText);
        raw = data;
        break;
      }

      // =====================================================================
      // RESPONSE FORMATTING TOOL
      // =====================================================================

      case 'respond_with_analytics': {
        // This tool doesn't fetch data - it formats the AI's response
        // The input IS the data we want to pass through
        const responseData = {
          summary: args.summary as string,
          dataStatus: args.dataStatus as string,
          timePeriodUsed: args.timePeriodUsed as string,
          suggestedFollowUps: (args.suggestedFollowUps as string[]) || [],
        };
        // Return immediately without caching - this is a pass-through
        return {
          success: true,
          data: responseData.summary, // The summary becomes the AI's response text
          rawData: responseData,
          dataType: 'response_metadata',
        };
      }

      default:
        return {
          success: false,
          error: `Unknown tool: ${toolName}`,
        };
    }

    // Cache both formatted and raw data
    setCachedResult(cacheKey, { formatted, raw });

    return {
      success: true,
      data: formatted,
      rawData: raw,
      dataType: TOOL_DATA_TYPES[toolName],
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ============================================================================
// FORMATTING HELPERS (for AI-friendly output)
// ============================================================================

function formatOverviewForAI(data: Awaited<ReturnType<typeof getOverviewMetrics>>): string {
  return `Search Analytics Overview:
- Total Searches: ${data.totalSearches.toLocaleString()}
- Unique Queries: ${data.uniqueQueries.toLocaleString()}
- Zero Result Rate: ${(data.zeroResultRate * 100).toFixed(1)}%
- Average Search Latency: ${data.avgSearchDurationMs.toFixed(0)}ms

Searches by Trigger:
- User-initiated: ${data.searchesByTrigger.user.toLocaleString()}
- AI Tool: ${data.searchesByTrigger.ai_tool.toLocaleString()}
- AI RAG: ${data.searchesByTrigger.ai_rag.toLocaleString()}
- System: ${data.searchesByTrigger.system.toLocaleString()}

Total AI Requests: ${data.totalAIRequests.toLocaleString()}
Average AI Latency: ${data.avgAIDurationMs.toFixed(0)}ms`;
}

function formatTrendsForAI(
  data: Awaited<ReturnType<typeof getSearchTrends>>
): string {
  if (data.length === 0) {
    return 'No search trend data available for this period.';
  }

  const total = data.reduce((sum, p) => sum + p.totalSearches, 0);
  const avgPerPeriod = total / data.length;
  const zeroResultTotal = data.reduce((sum, p) => sum + p.zeroResults, 0);

  let summary = `Search Trends (${data.length} data points):
- Total Searches: ${total.toLocaleString()}
- Average per period: ${avgPerPeriod.toFixed(1)}
- Total Zero Results: ${zeroResultTotal.toLocaleString()}

`;

  // Show first and last few data points
  const points = data.slice(0, 5);
  summary += 'Recent data points:\n';
  for (const p of points) {
    summary += `- ${new Date(p.timestamp).toLocaleString()}: ${p.totalSearches} searches, ${p.zeroResults} zero results\n`;
  }

  return summary;
}

function formatPopularQueriesForAI(
  data: Awaited<ReturnType<typeof getPopularQueries>>
): string {
  if (data.length === 0) {
    return 'No popular queries found for this period.';
  }

  const lines: string[] = [];
  for (let i = 0; i < data.length; i++) {
    const q = data[i];
    const zeroInfo = q.zeroResultCount > 0 ? `, ${q.zeroResultCount} zero results` : '';
    lines.push(`${i + 1}. "${q.query}" - ${q.searchCount} searches, ${Math.round(q.avgResults)} avg results${zeroInfo}`);
  }

  return `**Top ${data.length} Search Queries:**\n\n${lines.join('\n')}`;
}

function formatZeroResultsForAI(
  data: Awaited<ReturnType<typeof getZeroResultQueries>>
): string {
  if (data.length === 0) {
    return 'No zero result queries found for this period. All searches are returning results!';
  }

  let result = `Zero Result Queries (${data.length} content gaps found):\n\n`;

  for (let i = 0; i < data.length; i++) {
    const q = data[i];
    result += `${i + 1}. "${q.query}" - ${q.occurrenceCount} occurrences (${q.status})\n`;
  }

  return result;
}

function formatSearchTypesForAI(
  data: Awaited<ReturnType<typeof getSearchTypeBreakdown>>
): string {
  const total = data.lexical + data.semantic + data.hybrid;

  if (total === 0) {
    return 'No search type data available for this period.';
  }

  const pct = (n: number) => ((n / total) * 100).toFixed(1);

  return `Search Type Distribution:
- Lexical (keyword-based): ${data.lexical.toLocaleString()} (${pct(data.lexical)}%)
- Semantic (AI/vector): ${data.semantic.toLocaleString()} (${pct(data.semantic)}%)
- Hybrid (combined): ${data.hybrid.toLocaleString()} (${pct(data.hybrid)}%)

Total: ${total.toLocaleString()} searches`;
}

function formatPerformanceForAI(
  data: Awaited<ReturnType<typeof getPerformanceMetrics>>
): string {
  return `Search Performance Metrics:
- Average Latency: ${data.avgDurationMs.toFixed(0)}ms
- p50 (Median): ${data.p50DurationMs}ms
- p95: ${data.p95DurationMs}ms
- p99: ${data.p99DurationMs}ms

Breakdown:
- Elasticsearch time: ${data.avgEsDurationMs.toFixed(0)}ms
- Embedding generation: ${data.avgEmbeddingDurationMs.toFixed(0)}ms

${
  data.p95DurationMs > 500
    ? '⚠️ p95 latency is above 500ms - consider optimizing queries or infrastructure.'
    : '✓ Performance looks healthy.'
}`;
}

function formatRecentSearchesForAI(
  data: Awaited<ReturnType<typeof getRecentSearchEvents>>
): string {
  if (data.length === 0) {
    return 'No recent searches found.';
  }

  let result = `Recent ${data.length} Searches:\n\n`;

  for (const event of data) {
    const status = event.success ? '✓' : '✗';
    result += `${status} [${event.triggerType}] "${event.query}"
   - ${event.totalResults} results, ${event.durationMs}ms, ${event.searchType}
   - ${new Date(event.timestamp).toLocaleString()}\n`;
  }

  return result;
}

function formatQuerySearchEventsForAI(
  data: Awaited<ReturnType<typeof getQuerySearchEvents>>,
  queryText: string
): string {
  if (data.length === 0) {
    return `No search events found for query "${queryText}" in this time period.`;
  }

  const totalSearches = data.length;
  const zeroResultSearches = data.filter((e) => e.isZeroResult).length;
  const successfulSearches = totalSearches - zeroResultSearches;
  const searchesWithFilters = data.filter((e) => e.hasFilters).length;
  const zeroResultsWithFilters = data.filter((e) => e.isZeroResult && e.hasFilters).length;

  // Group by search type
  const bySearchType: Record<string, { total: number; zeroResults: number }> = {};
  for (const event of data) {
    if (!bySearchType[event.searchType]) {
      bySearchType[event.searchType] = { total: 0, zeroResults: 0 };
    }
    bySearchType[event.searchType].total++;
    if (event.isZeroResult) {
      bySearchType[event.searchType].zeroResults++;
    }
  }

  // Group by trigger type
  const byTriggerType: Record<string, { total: number; zeroResults: number }> = {};
  for (const event of data) {
    if (!byTriggerType[event.triggerType]) {
      byTriggerType[event.triggerType] = { total: 0, zeroResults: 0 };
    }
    byTriggerType[event.triggerType].total++;
    if (event.isZeroResult) {
      byTriggerType[event.triggerType].zeroResults++;
    }
  }

  let result = `Search Events for "${queryText}"
================================
Total Searches: ${totalSearches}
- Successful (returned results): ${successfulSearches}
- Zero Results: ${zeroResultSearches} (${((zeroResultSearches / totalSearches) * 100).toFixed(1)}%)

Filter Analysis:
- Searches with filters: ${searchesWithFilters}
- Zero results WITH filters: ${zeroResultsWithFilters}
- Zero results WITHOUT filters: ${zeroResultSearches - zeroResultsWithFilters}
${zeroResultsWithFilters > 0 && zeroResultsWithFilters === zeroResultSearches ? '\n⚠️ ALL zero-result searches had filters applied - filters may be too restrictive!' : ''}

By Search Type:
`;

  for (const [type, stats] of Object.entries(bySearchType)) {
    const failRate = stats.total > 0 ? ((stats.zeroResults / stats.total) * 100).toFixed(1) : '0';
    result += `- ${type}: ${stats.total} searches, ${stats.zeroResults} zero results (${failRate}% fail rate)\n`;
  }

  result += `\nBy Trigger Type:\n`;
  for (const [type, stats] of Object.entries(byTriggerType)) {
    const failRate = stats.total > 0 ? ((stats.zeroResults / stats.total) * 100).toFixed(1) : '0';
    result += `- ${type}: ${stats.total} searches, ${stats.zeroResults} zero results (${failRate}% fail rate)\n`;
  }

  // Show sample of zero-result events
  const zeroResultEvents = data.filter((e) => e.isZeroResult).slice(0, 5);
  if (zeroResultEvents.length > 0) {
    result += `\nSample Zero-Result Events:\n`;
    for (const event of zeroResultEvents) {
      const filterInfo = event.hasFilters ? ` [filters: ${event.filterFields?.join(', ') || 'yes'}]` : '';
      result += `- ${new Date(event.timestamp).toLocaleString()}: ${event.searchType}, ${event.triggerType}${filterInfo}\n`;
    }
  }

  return result;
}

// ============================================================================
// PRE-COMPUTED INSIGHT HELPERS
// ============================================================================

const TOOL_TO_INSIGHT_TYPE: Record<string, string> = {
  get_customer_intent_analysis: 'intent_clusters',
  get_catalog_health: 'catalog_health',
  get_ai_effectiveness: 'ai_effectiveness',
  get_demand_signals: 'demand_signals',
  get_cost_analysis: 'cost_analysis',
  get_proactive_insights: 'proactive_insights',
  get_guardrail_analytics: 'guardrail_analytics',
};

async function getPreComputedInsight(
  insightType: string,
  timeRange: string,
  experienceId?: string
): Promise<Record<string, unknown> | null> {
  const { analyticsDB } = await import('@/db/index');
  const { analyticsInsights } = await import('@/db/analytics-schema');
  const { eq, and, sql } = await import('drizzle-orm');

  if (!analyticsDB) return null;

  console.log(`[getPreComputedInsight] type=${insightType} timeRange=${timeRange} experienceId=${experienceId ?? 'null'}`);

  // Try experience-specific data first
  const [result] = await analyticsDB
    .select({ data: analyticsInsights.data })
    .from(analyticsInsights)
    .where(
      and(
        experienceId
          ? eq(analyticsInsights.experienceId, experienceId)
          : sql`${analyticsInsights.experienceId} IS NULL`,
        eq(analyticsInsights.insightType, insightType),
        eq(analyticsInsights.timeRange, timeRange)
      )
    )
    .limit(1);

  console.log(`[getPreComputedInsight] found=${!!result} empty=${result ? (result.data as any)?.empty : 'n/a'}`);

  if (result) {
    const data = result.data as Record<string, unknown>;
    if (!data.empty) return data;
  }

  return null;
}

function formatInsightForAI(
  toolName: string,
  data: Record<string, unknown>
): string {
  switch (toolName) {
    case 'get_customer_intent_analysis': {
      const clusters = (data.clusters || []) as Array<{
        label: string;
        count: number;
        avgOutcomeSuccess: number;
        topQueries: string[];
      }>;
      if (clusters.length === 0) return 'No customer intents found.';
      let result = `Customer Intent Analysis (${data.totalIntents} total, ${data.uniqueIntents} unique):\n\n`;
      for (let i = 0; i < clusters.length; i++) {
        const c = clusters[i];
        result += `${i + 1}. "${c.label}" — ${c.count} queries, ${(c.avgOutcomeSuccess * 100).toFixed(0)}% success\n`;
        if (c.topQueries?.length) {
          result += `   Sample queries: ${c.topQueries.slice(0, 3).map((q: string) => `"${q}"`).join(', ')}\n`;
        }
      }
      return result;
    }

    case 'get_catalog_health': {
      const realRate = Number(data.realZeroResultRate ?? 0);
      const apparentRate = Number(data.apparentZeroResultRate ?? 0);
      const queries = (data.topZeroResultQueries || []) as Array<{ query: string; count: number }>;
      let result = `Catalog Health:\n`;
      result += `- Real zero-result rate: ${(realRate * 100).toFixed(1)}% (after retry deduplication)\n`;
      result += `- Apparent zero-result rate: ${(apparentRate * 100).toFixed(1)}% (raw, inflated by retries)\n`;
      result += `- Total searches: ${data.totalSearches}, Deduplicated: ${data.totalDedupedSearches}\n`;
      result += `- Retries: ${data.retryCount} (${((Number(data.retryRate ?? 0)) * 100).toFixed(1)}% retry rate)\n`;
      if (queries.length > 0) {
        result += `\nTop zero-result queries:\n`;
        for (const q of queries.slice(0, 10)) {
          result += `- "${q.query}" (${q.count} times)\n`;
        }
      }
      return result;
    }

    case 'get_ai_effectiveness': {
      const successRate = Number(data.successRate ?? 0);
      const outcomes = (data.outcomes || {}) as Record<string, number>;
      const decisions = (data.decisions || {}) as Record<string, number>;
      let result = `AI Effectiveness:\n`;
      result += `- Success rate: ${(successRate * 100).toFixed(1)}%\n`;
      result += `- Total conversations: ${data.totalConversations}\n`;
      result += `- Retry rate: ${((Number(data.retryRate ?? 0)) * 100).toFixed(1)}%\n`;
      result += `- Avg duration: ${data.avgDurationMs}ms\n`;
      result += `\nOutcomes: ${Object.entries(outcomes).map(([k, v]) => `${k}=${v}`).join(', ')}\n`;
      result += `Decisions: ${Object.entries(decisions).map(([k, v]) => `${k}=${v}`).join(', ')}\n`;
      return result;
    }

    case 'get_demand_signals': {
      const brands = (data.topBrands || []) as Array<{ name: string; count: number }>;
      const categories = (data.topCategories || []) as Array<{ name: string; count: number }>;
      const queries = (data.topQueries || []) as Array<{ query: string; count: number }>;
      if (brands.length === 0 && categories.length === 0 && queries.length === 0) {
        return 'No demand signal data found. Brand and category filters may not be in use, and no search queries were recorded in this period.';
      }
      let result = `Demand Signals:\n\n`;
      if (brands.length > 0) {
        result += `Top Brands:\n`;
        for (const b of brands.slice(0, 10)) {
          result += `- ${b.name}: ${b.count} searches\n`;
        }
      }
      if (categories.length > 0) {
        result += `\nTop Categories:\n`;
        for (const c of categories.slice(0, 10)) {
          result += `- ${c.name}: ${c.count} searches\n`;
        }
      }
      if (queries.length > 0) {
        result += `\nTop Search Queries:\n`;
        for (const q of queries.slice(0, 10)) {
          result += `- "${q.query}": ${q.count} searches\n`;
        }
      }
      return result;
    }

    case 'get_cost_analysis': {
      let result = `Cost Analysis:\n`;
      result += `- Total tokens: ${Number(data.totalTokens ?? 0).toLocaleString()}\n`;
      result += `  - Input: ${Number(data.totalInputTokens ?? 0).toLocaleString()}\n`;
      result += `  - Output: ${Number(data.totalOutputTokens ?? 0).toLocaleString()}\n`;
      result += `- Conversations: ${data.totalConversations}\n`;
      result += `- Avg tokens/conversation: ${Number(data.avgTokensPerConversation ?? 0).toLocaleString()}\n`;
      result += `- Max tokens in single conversation: ${Number(data.maxTokensPerConversation ?? 0).toLocaleString()}\n`;
      result += `- Retry token waste: ${Number(data.retryTokenWaste ?? 0).toLocaleString()} (${((Number(data.retryWastePercentage ?? 0)) * 100).toFixed(1)}%)\n`;
      return result;
    }

    case 'get_proactive_insights': {
      const insights = (data.insights || []) as Array<{
        severity: string;
        title: string;
        description: string;
        suggestedAction?: string;
      }>;
      if (insights.length === 0) return 'No notable insights detected. Everything looks healthy!';
      let result = `Proactive Insights (${insights.length} findings):\n\n`;
      for (let i = 0; i < insights.length; i++) {
        const ins = insights[i];
        const icon = ins.severity === 'critical' ? '[CRITICAL]' : ins.severity === 'warning' ? '[WARNING]' : '[INFO]';
        result += `${icon} ${ins.title}\n   ${ins.description}\n`;
        if (ins.suggestedAction) {
          result += `   Action: ${ins.suggestedAction}\n`;
        }
        result += '\n';
      }
      return result;
    }

    case 'get_guardrail_analytics': {
      const dist = (data.classificationDistribution || []) as Array<{
        classification: string;
        count: number;
        percentage: number;
      }>;
      let result = `Guardrail Analytics:\n`;
      result += `- Total classified: ${data.totalClassified}\n`;
      result += `- Blocked: ${data.blockedCount} (${((Number(data.blockedRate ?? 0)) * 100).toFixed(1)}%)\n`;
      result += `- Avg domain similarity: ${Number(data.avgDomainSimilarity ?? 0).toFixed(3)}\n`;
      result += `\nClassification distribution:\n`;
      for (const d of dist) {
        result += `- ${d.classification}: ${d.count} (${(d.percentage * 100).toFixed(1)}%)\n`;
      }
      return result;
    }

    default:
      return JSON.stringify(data, null, 2);
  }
}

function formatConversationDetailForAI(
  detail: NonNullable<Awaited<ReturnType<typeof getConversationDetail>>>
): string {
  let result = `Conversation Trace: ${detail.traceId}\n${'='.repeat(50)}\n\n`;

  for (const span of detail.spans) {
    const status = span.statusCode === 'OK' ? '✓' : span.statusCode === 'ERROR' ? '✗' : '○';
    result += `${status} ${span.operationName} (${span.durationMs}ms)\n`;

    if (span.userMessage) result += `  User: "${span.userMessage}"\n`;
    if (span.planReasoning) result += `  Plan: ${span.planReasoning.slice(0, 200)}\n`;
    if (span.toolName) {
      result += `  Tool: ${span.toolName} → ${span.toolSuccess === 'true' ? 'success' : 'failed'}`;
      if (span.resultCount !== undefined) result += ` (${span.resultCount} results)`;
      result += '\n';
    }
    if (span.outcome) result += `  Outcome: ${span.outcome}\n`;
    if (span.preset) result += `  Preset: ${span.preset}\n`;
    result += '\n';
  }

  return result;
}

