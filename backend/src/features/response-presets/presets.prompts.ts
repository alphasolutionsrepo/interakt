// src/features/response-presets/presets.prompts.ts

/**
 * Preset Prompt Builder
 *
 * Generates AI system prompt instructions from enabled presets.
 * These instructions tell the AI how to format its responses.
 */

import type { ResponsePreset } from './presets.types';

// ============================================================================
// PRESET DECISION PROMPT - Concise guidance for preset selection
// ============================================================================

/**
 * Preset selection rules - maps preset keys to their decision criteria.
 * Keep these concise - detailed schema enforcement happens via JSON schema.
 */
const PRESET_DECISION_RULES: Record<string, { priority: number; rule: string }> = {
  single_card: {
    priority: 1,
    rule: '**single_card**: Recommending ONE best/cheapest/recommended item → Show it with highlights',
  },
  item_grid: {
    priority: 2,
    rule: '**item_grid**: Showing multiple products (2-6 items) → Grid layout',
  },
  comparison_table: {
    priority: 3,
    rule: '**comparison_table**: Comparing specific items side-by-side',
  },
  markdown_rich: {
    priority: 99,
    rule: '**markdown_rich**: Text only - for greetings OR when NO products found',
  },
};

/**
 * Build concise preset decision instructions for the system prompt.
 *
 * Design principles:
 * - Keep it SHORT - detailed format rules are in the JSON schema
 * - Focus on WHEN to use each preset, not HOW to format
 * - Scales well as presets are added (just add to PRESET_DECISION_RULES)
 * - Only includes enabled presets + markdown_rich fallback
 *
 * @param enabledPresetKeys - Array of preset keys enabled for this experience
 */
export function buildPresetDecisionPrompt(enabledPresetKeys: string[]): string {
  // Always include markdown_rich as fallback
  const presetKeysToInclude = [...new Set([...enabledPresetKeys, 'markdown_rich'])];

  // Get rules for enabled presets, sorted by priority
  const rules = presetKeysToInclude
    .filter((key) => PRESET_DECISION_RULES[key])
    .map((key) => ({ key, ...PRESET_DECISION_RULES[key] }))
    .sort((a, b) => a.priority - b.priority)
    .map((p) => `- ${p.rule}`);

  return `<response_format>
## Choose Your Response Format

${rules.join('\n')}

**IMPORTANT**:
- If you have products/items to show → You MUST use single_card or item_grid (with documentIds)
- markdown_rich = text ONLY, no product cards - use ONLY for greetings or when you have ZERO products
- "Narrow down" or "top 3" requests with existing products → Use item_grid with selected documentIds
</response_format>`;
}

/**
 * @deprecated Use buildPresetDecisionPrompt instead.
 * Kept for backwards compatibility - will be removed in future version.
 */
export function buildPresetInstructions(enabledPresets: ResponsePreset[]): string {
  const enabledKeys = enabledPresets.map((p) => p.key);
  return buildPresetDecisionPrompt(enabledKeys);
}

// ============================================================================
// CONTEXT FORMATTING
// ============================================================================

/**
 * Format search results as context for the AI.
 * Uses all fields provided (already filtered by includeInResponse on the index).
 */
export function formatResultsForAIContext(
  results: Array<{
    id: string;
    indexId?: string;
    fields: Record<string, unknown>;
  }>
): string {
  if (results.length === 0) {
    return '';
  }

  const formattedResults = results.map((result) => {
    const parts: string[] = [`[${result.id}]`];

    // Include all non-empty fields (admin controls which fields via includeInResponse)
    for (const [key, value] of Object.entries(result.fields)) {
      if (key.startsWith('_')) continue; // Skip internal fields
      if (value === null || value === undefined || value === '') continue;

      const formattedValue = formatFieldValue(value);
      if (formattedValue) {
        parts.push(`${formatFieldName(key)}: ${formattedValue}`);
      }
    }

    return parts.join('\n');
  }).join('\n\n');

  return `<available_items>
${formattedResults}
</available_items>`;
}

/**
 * Format a single focused result for "Ask about this" context.
 * Uses all fields provided (already filtered by includeInResponse on the index).
 */
export function formatFocusedResultContext(
  result: {
    id: string;
    fields: Record<string, unknown>;
  }
): string {
  const details: string[] = [`[${result.id}]`];

  // Include all non-empty fields
  for (const [key, value] of Object.entries(result.fields)) {
    if (key.startsWith('_')) continue;
    if (value === null || value === undefined || value === '') continue;

    const formattedValue = formatFieldValue(value, 300); // Slightly longer for focused item
    if (formattedValue) {
      details.push(`${formatFieldName(key)}: ${formattedValue}`);
    }
  }

  return `<focused_item>
${details.join('\n')}
</focused_item>`;
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Format a field name from camelCase/snake_case to readable format.
 */
function formatFieldName(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .replace(/^\w/, (c) => c.toUpperCase())
    .trim();
}

/**
 * Format a field value for display, with truncation.
 */
function formatFieldValue(value: unknown, maxLength: number = 200): string {
  if (value === null || value === undefined) return '';

  let formatted: string;
  if (Array.isArray(value)) {
    formatted = value
      .slice(0, 5)
      .map((v) => (typeof v === 'object' ? JSON.stringify(v) : String(v)))
      .join(', ');
    if (value.length > 5) formatted += '...';
  } else if (typeof value === 'object') {
    formatted = JSON.stringify(value);
  } else {
    formatted = String(value);
  }

  return truncate(formatted, maxLength);
}

/**
 * Truncate text to max length with ellipsis.
 */
function truncate(text: string, maxLength: number): string {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}
