// src/features/pipeline/v2/response-synthesis.ts

/**
 * D3: Response Synthesis — Deterministic Pipeline V2
 *
 * Two sub-phases:
 *   D3a: Preset Selection — deterministic backend rules, no AI
 *   D3b: Text Synthesis — AI call with preset-aware prompting
 *
 * Runs BEFORE persistence so the AI response can be persisted in one transaction.
 *
 * See: docs/platform-evolution/DETERMINISTIC-PIPELINE-V2.md § D3
 */

import { createLogger } from '@/shared/logger/logger';
import type {
  SynthesisInput,
  SynthesisResult,
  ActionResult,
  ResponsePreset,
  PresetPayload,
  ModuleResult,
} from './v2.types';
import type { ToolDisplayConfig } from '@/db/schema/tools.schema';
import type { ChatMessage } from '@/features/ai-service/ai-service.types';
import type { ChatFn } from './turn-planner';
import type { PipelineStreamEvent } from '../pipeline.types';
import { classifyLlmFailure } from '../fallback-messages';

const logger = createLogger('v2:response-synthesis');

// ============================================================================
// DEPENDENCY INTERFACES
// ============================================================================

export interface SynthesisDeps {
  chat: ChatFn;
}

export interface SynthesisConfig {
  providerId?: string;
  modelId?: number;
  temperature: number;
  maxTokens: number;
}

const DEFAULT_CONFIG: SynthesisConfig = {
  temperature: 0.5,
  maxTokens: 1000,
};

// ============================================================================
// MODULE ENTRY POINT
// ============================================================================

/**
 * Synthesize the final response from action results and persona config.
 * Emits preset + content events via emit callback.
 */
export async function synthesizeResponse(
  input: SynthesisInput,
  deps: SynthesisDeps,
  emit: (event: PipelineStreamEvent) => void,
  config: Partial<SynthesisConfig> = {},
): Promise<ModuleResult<SynthesisResult>> {
  const startTime = Date.now();
  const cfg = { ...DEFAULT_CONFIG, ...config };

  try {
    // D3a: Preset selection (backend, no AI)
    const { preset, presetPayload, debug: presetDebug } = selectPreset(input);

    // Emit self-contained preset event BEFORE text streaming
    if (preset !== 'rich_text' && presetPayload) {
      emit({ type: 'preset', preset, data: presetPayload });
    }

    // D3b: Text synthesis (AI call)
    let responseText: string;

    if (input.directResponse && !input.actionResults.length) {
      // Direct response or clarification — lighter AI call
      responseText = await synthesizeDirectResponse(input, deps.chat, cfg);
    } else {
      // Full synthesis from action results
      responseText = await synthesizeFromResults(input, preset, deps.chat, cfg);
    }

    // Emit content
    emit({ type: 'content', text: responseText });

    // Build suggested actions from remaining unexecuted actions
    const suggestedActions = input.remainingActions.map((a) => a.intent);

    const durationMs = Date.now() - startTime;

    const result: SynthesisResult = {
      responseText,
      preset,
      presetPayload,
      responseMetadata: {
        sources: extractSources(input.actionResults),
        suggestedActions: suggestedActions.length > 0 ? suggestedActions : undefined,
      },
      presetDebug,
    };

    logger.info('Response synthesized', {
      preset,
      textLength: responseText.length,
      suggestedActions: suggestedActions.length,
      durationMs,
    });

    return {
      success: true,
      data: result,
      summary: `Synthesized ${preset} response (${responseText.length} chars)`,
      durationMs,
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('Synthesis failed', err);

    // Fallback: prefer a provider-error-aware message (TPM, context length) when
    // the failure was an LLM call; otherwise fall back to the result-aware default.
    const fallbackText = classifyLlmFailure(err) ?? generateFallback(input);
    emit({ type: 'content', text: fallbackText });

    return {
      success: true, // Fallback is still a valid response
      data: {
        responseText: fallbackText,
        preset: 'rich_text',
        responseMetadata: {},
      },
      summary: `Synthesis failed, used fallback: ${err.message}`,
      durationMs,
    };
  }
}

// ============================================================================
// D3a: PRESET SELECTION (backend, deterministic)
// ============================================================================

/**
 * Select UI preset based on action results and tool display configs.
 *
 * Rules:
 * 1. No actions / direct response → rich_text
 * 2. Group successful results by toolSlug
 * 3. Filter to "visual groups" — tools that have a displayConfig
 * 4. 0 visual groups → rich_text
 * 5. 1 visual group → pick preset based on item count + tool's preferredPresets + enabledPresets
 * 6. 2+ visual groups → rich_text fallback (AI text synthesizes across multiple tool results)
 */
export interface PresetSelectionDebug {
  enabledPresets: string[];
  itemCount: number;
  visualGroupCount: number;
  reason: string;
  toolSlug?: string;
  toolPreferredPresets?: string[];
}

function selectPreset(input: SynthesisInput): {
  preset: ResponsePreset;
  presetPayload?: PresetPayload;
  debug: PresetSelectionDebug;
} {
  // Normalize legacy 'markdown_rich' → 'rich_text'
  const rawPresets = input.personaConfig.responseFormats?.enabledPresets ?? ['rich_text'];
  const enabledPresetsArr = rawPresets.map(p => p === 'markdown_rich' ? 'rich_text' : p);
  const enabledPresets = new Set<string>(enabledPresetsArr);
  const displayConfigs = input.toolSlugToDisplayConfig ?? {};

  const baseDebug: PresetSelectionDebug = {
    enabledPresets: enabledPresetsArr,
    itemCount: 0,
    visualGroupCount: 0,
    reason: '',
  };

  // No actions executed → rich_text
  if (input.directResponse || input.actionResults.length === 0) {
    return { preset: 'rich_text', debug: { ...baseDebug, reason: 'direct_response_or_no_actions' } };
  }

  const successfulResults = input.actionResults.filter((a) => a.result.success);
  if (successfulResults.length === 0) {
    return { preset: 'rich_text', debug: { ...baseDebug, reason: 'no_successful_results' } };
  }

  // Group successful results by toolSlug, keeping only tools with a displayConfig
  const visualGroups = new Map<string, { config: ToolDisplayConfig; actions: ActionResult[] }>();
  for (const action of successfulResults) {
    const config = displayConfigs[action.toolSlug];
    if (!config) continue;

    const existing = visualGroups.get(action.toolSlug);
    if (existing) {
      existing.actions.push(action);
    } else {
      visualGroups.set(action.toolSlug, { config, actions: [action] });
    }
  }

  baseDebug.visualGroupCount = visualGroups.size;

  // 0 visual groups → rich_text
  if (visualGroups.size === 0) {
    return { preset: 'rich_text', debug: { ...baseDebug, reason: 'no_tools_with_display_config' } };
  }

  // 2+ visual groups → rich_text fallback (AI synthesizes across multiple sources)
  if (visualGroups.size > 1) {
    return { preset: 'rich_text', debug: { ...baseDebug, reason: 'multiple_visual_groups_fallback' } };
  }

  // Exactly 1 visual group — build self-contained preset payload
  const [toolSlug, group] = [...visualGroups.entries()][0];
  const items = extractItems(group.actions);
  const totalCount = items.length;
  baseDebug.itemCount = totalCount;
  baseDebug.toolSlug = toolSlug;
  baseDebug.toolPreferredPresets = group.config.preferredPresets;

  if (totalCount === 0) {
    return { preset: 'rich_text', debug: { ...baseDebug, reason: 'no_items_extracted' } };
  }

  // Pick preset: comparison intent → tool preference → item count heuristics → fallback
  const comparisonIntent = isComparisonIntent(input.userMessage);
  const { preset, reason } = pickPresetForItems(totalCount, group.config, enabledPresets, comparisonIntent);
  baseDebug.reason = reason;

  if (preset === 'rich_text') {
    return { preset: 'rich_text', debug: baseDebug };
  }

  return {
    preset,
    presetPayload: {
      items,
      displayConfig: group.config,
    },
    debug: baseDebug,
  };
}

/**
 * Extract normalized items from action results.
 * Tool results may be:
 * - { results: [{ id, data: {...} }] } — search results
 * - { id, document: {...} } — lookup/find result (single document)
 * - A direct array
 * Each item's fields are nested under `.data` (search) or `.document` (lookup).
 */
function extractActionItems(action: ActionResult): Array<{ id?: string; fields: Record<string, unknown> }> {
  const data = action.result.data;

  // Lookup/find result: { id, document: {...} }
  if (data && !Array.isArray(data) && (data as any).document) {
    const doc = data as { id?: string; document: Record<string, unknown> };
    return [{ id: doc.id ?? undefined, fields: doc.document }];
  }

  // Search results: { results: [...] } or direct array — ordered by relevance.
  const rawItems: any[] = Array.isArray(data)
    ? data
    : (data as any)?.results ?? [];

  return rawItems.map((raw) => ({
    id: raw.id ?? undefined,
    fields: raw.data ?? raw, // data_source results nest fields in `.data`
  }));
}

function extractItems(actions: ActionResult[]): Array<{ id?: string; fields: Record<string, unknown> }> {
  const perAction = actions.map(extractActionItems);

  // When the agent ran MULTIPLE searches, it decomposed the request into one query per
  // thing the user asked about (e.g. "Day Cream vs Night Cream" → two searches). Show the
  // single best hit from each, so a 2-way comparison shows 2 items — not every fuzzy
  // neighbor. A single search is discovery: keep all of its hits.
  const selected =
    perAction.length > 1
      ? perAction.flatMap((items) => items.slice(0, 1))
      : (perAction[0] ?? []);

  // Dedupe by id (fall back to a field signature when id is absent).
  const seen = new Set<string>();
  const items: Array<{ id?: string; fields: Record<string, unknown> }> = [];
  for (const item of selected) {
    const key = item.id ?? JSON.stringify(item.fields);
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(item);
  }

  return items;
}

/**
 * Pick the best preset for a given item count, respecting tool preferences and enabled presets.
 */
function pickPresetForItems(
  count: number,
  config: ToolDisplayConfig,
  enabledPresets: Set<string>,
  comparisonIntent = false,
): { preset: ResponsePreset; reason: string } {
  // Comparison intent ("compare X and Y", "X vs Y") with 2+ items → comparison_table.
  // Checked before tool preference/heuristics, which would otherwise pick item_grid.
  if (comparisonIntent && count >= 2 && enabledPresets.has('comparison_table')) {
    return { preset: 'comparison_table', reason: 'intent:comparison→comparison_table' };
  }

  // Check tool's preferred presets first (ordered by preference)
  if (config.preferredPresets) {
    for (const pref of config.preferredPresets) {
      if (enabledPresets.has(pref) && isPresetValidForCount(pref, count)) {
        return { preset: pref, reason: `tool_preferred:${pref}` };
      }
    }
  }

  // Fallback heuristics based on item count
  if (count === 1 && enabledPresets.has('single_card')) return { preset: 'single_card', reason: 'heuristic:single_item→single_card' };
  if (count >= 2 && enabledPresets.has('item_grid')) return { preset: 'item_grid', reason: 'heuristic:multi_item→item_grid' };
  if (count >= 2 && enabledPresets.has('item_list')) return { preset: 'item_list', reason: 'heuristic:multi_item→item_list' };

  return { preset: 'rich_text', reason: 'fallback:no_matching_preset_for_count' };
}

/**
 * Check if a preset makes sense for the given item count.
 */
function isPresetValidForCount(preset: string, count: number): boolean {
  switch (preset) {
    case 'single_card': return count === 1;
    case 'item_grid': return count >= 2;
    case 'item_list': return count >= 1;
    case 'comparison_table': return count >= 2;
    default: return true;
  }
}

/**
 * Detect a side-by-side comparison request from the user's message.
 * Distinguishes "compare the X and the Y" / "X vs Y" / "difference between X and Y"
 * from cross-sell ("what bag goes with X"), which also runs multiple searches but
 * should render a grid, not a comparison table.
 */
function isComparisonIntent(message: string): boolean {
  const m = (message || '').toLowerCase();
  return (
    /\bcompare\b/.test(m) ||
    /\b(vs\.?|versus)\b/.test(m) ||
    /\bdifference(s)?\s+between\b/.test(m) ||
    /\bwhich\b.*\b(better|cheaper|warmer|nicer)\b/.test(m)
  );
}

// Exported for testing
export { selectPreset as _selectPreset, isComparisonIntent as _isComparisonIntent };

// ============================================================================
// D3b: TEXT SYNTHESIS (AI call)
// ============================================================================

/**
 * Preset-specific instructions for the AI.
 */
const PRESET_INSTRUCTIONS: Record<ResponsePreset, string> = {
  rich_text: 'Write the full response with inline formatting. You are the only output.',
  item_grid: 'The user sees a product grid alongside your text. Write a brief summary highlighting key findings or recommendations. Do NOT list individual items — the grid shows those.',
  single_card: 'The user sees a detailed card for this item. Write additional context, comparisons, or tips. Do NOT repeat the card fields.',
  item_list: 'The user sees a list of results. Write a summary of what was found and any notable patterns.',
  comparison_table: 'The user sees a side-by-side comparison table. Write a narrative helping them decide — call out key differences.',
  step_list: 'The user sees numbered steps. Write a brief intro and any caveats.',
  summary_with_sources: 'Write the summary narrative. Sources are shown as footnotes automatically.',
};

async function synthesizeFromResults(
  input: SynthesisInput,
  preset: ResponsePreset,
  chat: ChatFn,
  config: SynthesisConfig,
): Promise<string> {
  const persona = input.personaConfig;

  // Build what-was-done summary
  const actionSummary = input.actionResults
    .map((a) => {
      let status: string;
      if (!a.result.success) {
        status = `failed: ${a.result.error ?? 'unknown'}`;
      } else if ((a.result.data as any)?.document) {
        // Lookup/find result — single document found
        status = '1 document found';
      } else {
        status = `${a.result.resultCount ?? 0} results`;
      }
      return `- ${a.toolSlug}: ${a.intent} → ${status}`;
    })
    .join('\n');

  // Build result data (truncated to avoid token bloat)
  const resultData = input.actionResults
    .filter((a) => a.result.success && a.result.data)
    .map((a) => {
      const data = a.result.data;
      const items = Array.isArray(data) ? data : (data as any)?.results ?? [data];
      // Limit to first 10 items to control prompt size
      const truncated = items.slice(0, 10);
      return `### ${a.toolSlug}\n${JSON.stringify(truncated, null, 2)}`;
    })
    .join('\n\n');

  const pendingActions = input.remainingActions.length > 0
    ? input.remainingActions.map((a) => `- ${a.intent}`).join('\n')
    : '';

  // Try DB-backed template first
  let systemPrompt: string | undefined;
  try {
    const { resolveTemplate, renderTemplate } = await import('@/features/prompt-templates');
    const template = await resolveTemplate('response_synthesis', input.experienceId);
    if (template) {
      systemPrompt = renderTemplate(template.content, {
        personaInstructions: persona.systemInstructions,
        actionSummary,
        resultData,
        preset,
        presetInstructions: PRESET_INSTRUCTIONS[preset],
        pendingActions,
        tone: persona.tone ?? 'professional',
      });
    }
  } catch {
    // Template system not available — fall through to inline
  }

  // Fallback: inline prompt (identical to v1 template content)
  if (!systemPrompt) {
    systemPrompt = persona.systemInstructions;
    systemPrompt += `\n\n## What was done\n${actionSummary}`;
    systemPrompt += `\n\n## Results data\n${resultData}`;
    systemPrompt += `\n\n## Response format\nThe client will display a "${preset}" UI component alongside your text.\n${PRESET_INSTRUCTIONS[preset]}`;

    if (pendingActions) {
      systemPrompt += `\n\n## Pending actions\nThese actions were planned but not yet executed. Mention them as suggestions:\n${pendingActions}`;
    }

    systemPrompt += `\n\n## Rules
- Use ONLY the provided results. Do not invent or hallucinate information.
- Tone: ${persona.tone ?? 'professional'}
- If results are empty, say so honestly and suggest alternatives.`;
  }

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: input.userMessage },
  ];

  const aiResult = await chat(messages, {
    temperature: config.temperature,
    maxTokens: config.maxTokens,
    providerId: config.providerId,
    modelId: config.modelId,
    feature: 'response-synthesis',
  });

  return typeof aiResult.message.content === 'string'
    ? aiResult.message.content
    : '';
}

async function synthesizeDirectResponse(
  input: SynthesisInput,
  chat: ChatFn,
  config: SynthesisConfig,
): Promise<string> {
  const persona = input.personaConfig;

  // Try DB-backed template first
  let systemPrompt: string | undefined;
  try {
    const { resolveTemplate, renderTemplate } = await import('@/features/prompt-templates');
    const template = await resolveTemplate('response_synthesis_direct', input.experienceId);
    if (template) {
      systemPrompt = renderTemplate(template.content, {
        personaInstructions: persona.systemInstructions,
        tone: persona.tone ?? 'professional',
        clarificationQuestion: input.clarificationQuestion ?? '',
      });
    }
  } catch {
    // Template system not available — fall through to inline
  }

  // Fallback: inline prompt
  if (!systemPrompt) {
    systemPrompt = persona.systemInstructions;
    systemPrompt += `\n\nTone: ${persona.tone ?? 'professional'}`;

    if (input.clarificationQuestion) {
      systemPrompt += `\n\nThe user's intent is unclear. Ask them this clarification question in your voice: "${input.clarificationQuestion}"`;
    }
  }

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: input.userMessage },
  ];

  const aiResult = await chat(messages, {
    temperature: config.temperature,
    maxTokens: config.maxTokens,
    providerId: config.providerId,
    modelId: config.modelId,
    feature: 'response-synthesis',
  });

  return typeof aiResult.message.content === 'string'
    ? aiResult.message.content
    : '';
}

// ============================================================================
// FALLBACK
// ============================================================================

function generateFallback(input: SynthesisInput): string {
  if (input.directResponse) {
    return input.clarificationQuestion ?? "I'm here to help! What can I do for you?";
  }

  const successCount = input.actionResults.filter((a) => a.result.success).length;
  if (successCount === 0) {
    return "I wasn't able to complete the requested actions. Could you try rephrasing your request?";
  }

  const totalResults = input.actionResults
    .filter((a) => a.result.success)
    .reduce((sum, a) => sum + (a.result.resultCount ?? 0), 0);

  return totalResults > 0
    ? `I found ${totalResults} results for your request.`
    : "I completed the action but didn't find any results. Try a different search?";
}

// ============================================================================
// HELPERS
// ============================================================================

function extractSources(actionResults: ActionResult[]): string[] {
  return actionResults
    .filter((a) => a.result.success)
    .map((a) => a.toolSlug);
}

// ============================================================================
// LIGHTWEIGHT SYNTHESIS (short-circuit path)
// ============================================================================

/**
 * Generate a lightweight AI response for messages that don't need the full pipeline.
 * Used for greetings, general smalltalk, and off-topic polite declines.
 *
 * One AI call, maxTokens=150, no conversation history, no tool results.
 */
export async function synthesizeLightweightResponse(
  input: {
    userMessage: string;
    experienceId?: string;
    personaConfig: { name?: string; tone?: string; systemInstructions: string };
    classification: 'greeting' | 'general' | 'off_topic';
    allowedDomains?: string[];
  },
  deps: SynthesisDeps,
  config?: Partial<SynthesisConfig>,
): Promise<string> {
  const persona = input.personaConfig;
  const tone = persona.tone ?? 'professional';
  const cfg = { ...DEFAULT_CONFIG, ...config, maxTokens: 150 };

  let contextInstruction: string;
  switch (input.classification) {
    case 'greeting':
      contextInstruction = 'The user sent a greeting. Respond warmly as your persona. Be brief (1-2 sentences).';
      break;
    case 'general': {
      const domains = input.allowedDomains?.join(', ') ?? 'our products and services';
      contextInstruction = `The user's message is not directly about your domain (${domains}). If it is harmless smalltalk (e.g. "thanks", "how are you", "what can you do"), respond briefly and steer toward how you can help with ${domains}. If the topic is unrelated or inappropriate, politely decline and mention what you CAN help with. Never provide advice on topics outside your domain. Be brief (1-2 sentences).`;
      break;
    }
    case 'off_topic': {
      const domains = input.allowedDomains?.join(', ') ?? 'our products and services';
      contextInstruction = `The user asked about something outside your domain. Politely let them know you specialize in ${domains} and offer to help with that instead. Be brief (1-2 sentences).`;
      break;
    }
  }

  // Try DB-backed template first
  let systemPrompt: string | undefined;
  try {
    const { resolveTemplate, renderTemplate } = await import('@/features/prompt-templates');
    const template = await resolveTemplate('response_synthesis_lightweight', input.experienceId);
    if (template) {
      systemPrompt = renderTemplate(template.content, {
        personaInstructions: persona.systemInstructions,
        tone,
        contextInstruction,
      });
    }
  } catch {
    // Template system not available — fall through to inline
  }

  // Fallback: inline prompt
  if (!systemPrompt) {
    systemPrompt = `${persona.systemInstructions}\n\nTone: ${tone}\n\n${contextInstruction}`;
  }

  try {
    const aiResult = await deps.chat(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: input.userMessage },
      ],
      {
        temperature: cfg.temperature,
        maxTokens: cfg.maxTokens,
        providerId: cfg.providerId,
        modelId: cfg.modelId,
        feature: 'lightweight-synthesis',
      },
    );

    const text = typeof aiResult.message.content === 'string'
      ? aiResult.message.content
      : '';

    logger.info('Lightweight synthesis complete', {
      classification: input.classification,
      textLength: text.length,
    });

    return text;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('Lightweight synthesis failed', err);

    // Fallback per classification
    switch (input.classification) {
      case 'greeting':
        return "Hello! How can I help you today?";
      case 'general':
        return "I'm here to help! Feel free to ask me anything.";
      case 'off_topic':
        return "I'm sorry, that's outside my area of expertise. I can only help with topics related to our products and services.";
    }
  }
}

// ============================================================================
// PRODUCTION DEPENDENCY FACTORY
// ============================================================================

export function createProductionSynthesisDeps(): SynthesisDeps {
  return {
    async chat(messages, options) {
      const { chat } = await import('@/features/ai-service/ai-service.service');
      return chat(messages, options);
    },
  };
}
