// src/features/pipeline/steps/tool-group-selection.ts

/**
 * Tool Group Selection Step (Deterministic Pipeline — Phase C)
 *
 * Pre-filter step that runs before Tool Selection when an experience has
 * many tools (≥ THRESHOLD). Narrows the full tool set to the groups most
 * relevant to the current query, reducing token cost and improving
 * tool-selection accuracy.
 *
 * Grouping strategy (Option C — structural):
 *   - data_source tools    → grouped by dataSourceId (all tools on the same
 *                            source share a group; label = first tool's name prefix)
 *   - standalone tools     → one group per executorType (http, ai_call, web_search,
 *                            mcp — synthetic, for tools materialized from
 *                            attached MCP connections)
 *
 * Flow:
 * 1. Build groups from ctx.shared.toolDefinitions
 * 2. If total tools < THRESHOLD → skip (write all tools as filteredToolDefinitions)
 * 3. Build one-sentence summary per group from its tools' descriptions
 * 4. Call a small AI classifier: "which groups are relevant to this query?"
 * 5. Write ctx.shared.filteredToolDefinitions = tools from relevant groups only
 *
 * The subsequent tool_selection step reads filteredToolDefinitions preferentially.
 */

import type { Span } from '@opentelemetry/api';
import { streamChat } from '@/features/ai-service/ai-service.service';
import type { ChatMessage, ResponseFormat, ToolDefinition } from '@/features/ai-service/ai-service.types';
import type { StepHandler, PipelineContext, StepResult } from '../pipeline.types';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Minimum number of tools before group selection activates */
const GROUP_SELECTION_THRESHOLD = 15;

// ============================================================================
// TYPES
// ============================================================================

export interface ToolGroup {
  /** Stable group key — dataSourceId for data_source tools, executorType for others */
  key: string;
  /** Human-readable label for the AI classifier */
  label: string;
  /** One-sentence summary built from member tool descriptions */
  summary: string;
  /** All tools in this group */
  tools: ToolDefinition[];
}

export interface ToolGroupSelectionResult {
  /** Keys of groups selected as relevant */
  selectedGroups: string[];
  /** Number of tools before filtering */
  totalTools: number;
  /** Number of tools after filtering */
  filteredTools: number;
  /** True when step was skipped (below threshold) */
  skipped: boolean;
}

interface ToolGroupSelectionConfig {
  /** Threshold override (default: GROUP_SELECTION_THRESHOLD) */
  threshold?: number;
  /** AI provider override */
  providerId?: string;
  modelId?: number;
}

// ============================================================================
// JSON SCHEMA for structured AI output
// ============================================================================

const GROUP_SELECTION_RESPONSE_FORMAT: ResponseFormat = {
  type: 'json_schema',
  json_schema: {
    name: 'tool_group_selection',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        selectedGroups: {
          type: 'array',
          items: { type: 'string' },
          description: 'Keys of the tool groups relevant to the user query',
        },
        reasoning: {
          type: 'string',
          description: 'Brief explanation of why these groups were selected',
        },
      },
      required: ['selectedGroups', 'reasoning'],
      additionalProperties: false,
    },
  },
};

// ============================================================================
// STEP HANDLER
// ============================================================================

export const toolGroupSelectionHandler: StepHandler = {
  type: 'tool_group_selection',

  async execute(
    config: Record<string, unknown>,
    ctx: PipelineContext,
    span: Span,
  ): Promise<StepResult> {
    const cfg = config as unknown as ToolGroupSelectionConfig;
    const threshold = cfg.threshold ?? GROUP_SELECTION_THRESHOLD;
    const allTools = (ctx.shared.toolDefinitions as ToolDefinition[] | undefined) ?? [];

    span.setAttribute('tool_group_selection.total_tools', allTools.length);
    span.setAttribute('tool_group_selection.threshold', threshold);

    // Below threshold — pass all tools through unchanged
    if (allTools.length < threshold) {
      ctx.shared.filteredToolDefinitions = allTools;
      span.setAttribute('tool_group_selection.skipped', true);

      const result: ToolGroupSelectionResult = {
        selectedGroups: [],
        totalTools: allTools.length,
        filteredTools: allTools.length,
        skipped: true,
      };
      return {
        success: true,
        data: result as unknown as Record<string, unknown>,
        summary: `Skipped — ${allTools.length} tools below threshold ${threshold}`,
      };
    }

    // Build groups
    const groups = buildToolGroups(allTools);
    span.setAttribute('tool_group_selection.group_count', groups.length);

    // Run classifier
    const { selectedGroups, reasoning } = await classifyGroups(groups, ctx, cfg);

    // Filter tools to selected groups only; always include standalone (non-data_source) tools
    // that weren't grouped — they're cheap to include and rarely cause noise.
    const selectedSet = new Set(selectedGroups);
    const filtered = allTools.filter(t => {
      const groupKey = getToolGroupKey(t);
      return selectedSet.has(groupKey);
    });

    // Fallback: if AI selected nothing (shouldn't happen, but be safe) → use all tools
    const finalFiltered = filtered.length > 0 ? filtered : allTools;

    ctx.shared.filteredToolDefinitions = finalFiltered;

    span.setAttribute('tool_group_selection.selected_groups', selectedGroups.join(', '));
    span.setAttribute('tool_group_selection.filtered_tools', finalFiltered.length);
    span.setAttribute('tool_group_selection.reasoning', reasoning.substring(0, 200));

    const result: ToolGroupSelectionResult = {
      selectedGroups,
      totalTools: allTools.length,
      filteredTools: finalFiltered.length,
      skipped: false,
    };

    return {
      success: true,
      data: result as unknown as Record<string, unknown>,
      summary: `Selected ${selectedGroups.length}/${groups.length} groups → ${finalFiltered.length}/${allTools.length} tools`,
    };
  },
};

// ============================================================================
// GROUPING LOGIC
// ============================================================================

/**
 * Derive a stable group key for a tool.
 * - data_source tools: keyed by dataSourceId (all operations on same source = one group)
 * - standalone tools: keyed by executorType
 */
function getToolGroupKey(tool: ToolDefinition): string {
  if (tool.executorType === 'data_source' && tool.dataSourceId) {
    return `ds:${tool.dataSourceId}`;
  }
  return `type:${tool.executorType ?? 'unknown'}`;
}

/**
 * Build ToolGroup objects from a flat list of ToolDefinitions.
 * Groups are keyed by getToolGroupKey and labeled for the AI prompt.
 */
function buildToolGroups(tools: ToolDefinition[]): ToolGroup[] {
  const map = new Map<string, ToolDefinition[]>();

  for (const tool of tools) {
    const key = getToolGroupKey(tool);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(tool);
  }

  const groups: ToolGroup[] = [];

  for (const [key, groupTools] of map.entries()) {
    const label = deriveGroupLabel(key, groupTools);
    const summary = buildGroupSummary(groupTools);
    groups.push({ key, label, summary, tools: groupTools });
  }

  return groups;
}

/**
 * Derive a human-readable label for a group.
 * - data_source groups: infer from common tool name prefix (e.g. "products_search" → "Products")
 * - type groups: use executor type label
 */
function deriveGroupLabel(key: string, tools: ToolDefinition[]): string {
  if (key.startsWith('ds:')) {
    // Use the common prefix from the first tool's name (e.g. "products_search" → "Products")
    const firstName = tools[0]?.name ?? '';
    const prefix = firstName.split('_')[0];
    return prefix ? prefix.charAt(0).toUpperCase() + prefix.slice(1) : key;
  }

  const TYPE_LABELS: Record<string, string> = {
    http: 'HTTP APIs',
    mcp: 'MCP Servers',
    ai_call: 'AI Responders',
    web_search: 'Web Search',
    unknown: 'Other Tools',
  };

  const typePart = key.replace('type:', '');
  return TYPE_LABELS[typePart] ?? typePart;
}

/**
 * Build a one-sentence summary for a group from its tools' descriptions.
 * Limits to first two descriptions to keep the classifier prompt short.
 */
function buildGroupSummary(tools: ToolDefinition[]): string {
  const snippets = tools
    .slice(0, 2)
    .map(t => {
      // Take just the first sentence of the description
      const firstSentence = t.description.split(/[.!?]/)[0]?.trim() ?? t.description;
      return firstSentence;
    });
  return snippets.join('; ') + '.';
}

// ============================================================================
// AI CLASSIFIER
// ============================================================================

async function classifyGroups(
  groups: ToolGroup[],
  ctx: PipelineContext,
  cfg: ToolGroupSelectionConfig,
): Promise<{ selectedGroups: string[]; reasoning: string }> {
  const groupList = groups
    .map(g => `- key: "${g.key}" | label: "${g.label}" | summary: ${g.summary}`)
    .join('\n');

  const systemPrompt = `You are a routing assistant. Given a user query, select the tool groups that are likely to contain the right tool for answering it.

Available groups:
${groupList}

Rules:
- Select all groups that are plausibly relevant. It is better to include too many than too few.
- If the query is conversational or requires no tools, return an empty array.
- Return only the group keys, exactly as listed.`;

  const userPrompt = `User query: "${ctx.userMessage}"`;

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  let fullContent = '';
  for await (const chunk of streamChat(messages, {
    temperature: 0.1,
    maxTokens: 300,
    providerId: cfg.providerId,
    modelId: cfg.modelId,
    responseFormat: GROUP_SELECTION_RESPONSE_FORMAT,
    feature: 'tool-group-selection',
    sessionId: ctx.sessionId,
  })) {
    fullContent += chunk.content;
    if (chunk.done && chunk.usage) {
      ctx.tokenUsage.promptTokens += chunk.usage.inputTokens;
      ctx.tokenUsage.completionTokens += chunk.usage.outputTokens;
      ctx.tokenUsage.totalTokens += chunk.usage.totalTokens;
    }
  }

  const parsed = JSON.parse(fullContent) as { selectedGroups: string[]; reasoning: string };
  return parsed;
}
