// src/features/response-presets/presets.service.ts

/**
 * Response Presets Service
 *
 * Provides methods to query, filter, and validate response presets.
 */

import { RESPONSE_PRESETS, DEFAULT_PRESETS_BY_CATEGORY, ALL_PRESET_KEYS } from './presets.definition';
import type {
  ResponsePreset,
  PresetType,
  PresetResponse,
  PresetContent,
  PresetValidationResult,
  DocumentValidationResult,
  MarkdownRichContent,
  SingleCardContent,
  ItemGridContent,
} from './presets.types';

// ============================================================================
// PRESET QUERIES
// ============================================================================

/**
 * Get all available presets
 */
export function getAllPresets(): ResponsePreset[] {
  return RESPONSE_PRESETS;
}

/**
 * Get a single preset by key
 */
export function getPresetByKey(key: string): ResponsePreset | undefined {
  return RESPONSE_PRESETS.find(p => p.key === key);
}

/**
 * Get presets available for a specific data template category
 */
export function getPresetsForCategory(categorySlug: string): ResponsePreset[] {
  return RESPONSE_PRESETS.filter(preset =>
    preset.categories.includes('*') || preset.categories.includes(categorySlug)
  );
}

/**
 * Get default preset keys for a category
 */
export function getDefaultPresetsForCategory(categorySlug: string): string[] {
  return DEFAULT_PRESETS_BY_CATEGORY[categorySlug] || DEFAULT_PRESETS_BY_CATEGORY['*'];
}

/**
 * Get presets by an array of keys
 */
export function getPresetsByKeys(keys: string[]): ResponsePreset[] {
  return keys
    .map(key => getPresetByKey(key))
    .filter((preset): preset is ResponsePreset => preset !== undefined);
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validate that preset keys exist
 */
export function validatePresetKeys(keys: string[]): { valid: boolean; invalid: string[] } {
  const invalid = keys.filter(key => !ALL_PRESET_KEYS.includes(key));
  return {
    valid: invalid.length === 0,
    invalid,
  };
}

/**
 * Validate that preset keys are available for a category
 */
export function validatePresetsForCategory(
  keys: string[],
  categorySlug: string
): { valid: boolean; unavailable: string[] } {
  const availablePresets = getPresetsForCategory(categorySlug);
  const availableKeys = availablePresets.map(p => p.key);
  const unavailable = keys.filter(key => !availableKeys.includes(key));

  return {
    valid: unavailable.length === 0,
    unavailable,
  };
}

/**
 * Parse and validate an AI response as a preset response
 */
export function parsePresetResponse(responseText: string): PresetValidationResult {
  // Try to extract JSON from the response
  let jsonContent: unknown;

  try {
    // First, try direct JSON parse
    jsonContent = JSON.parse(responseText);
  } catch {
    // Try to extract JSON from markdown code blocks
    const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      try {
        jsonContent = JSON.parse(jsonMatch[1].trim());
      } catch {
        // Fall through to fallback
      }
    }

    // Try to find JSON object in the text
    if (!jsonContent) {
      const objectMatch = responseText.match(/\{[\s\S]*\}/);
      if (objectMatch) {
        try {
          jsonContent = JSON.parse(objectMatch[0]);
        } catch {
          // Fall through to fallback
        }
      }
    }
  }

  // If we couldn't parse JSON, return as markdown_rich
  if (!jsonContent || typeof jsonContent !== 'object') {
    return {
      valid: true,
      preset: 'markdown_rich',
      content: {
        text: responseText,
        documentReferences: [],
      } as MarkdownRichContent,
    };
  }

  const parsed = jsonContent as Record<string, unknown>;

  // Validate preset field
  if (!parsed.preset || typeof parsed.preset !== 'string') {
    return {
      valid: true,
      preset: 'markdown_rich',
      content: {
        text: responseText,
        documentReferences: [],
      } as MarkdownRichContent,
    };
  }

  const preset = parsed.preset as PresetType;
  const content = parsed.content as Record<string, unknown> | undefined;

  if (!content) {
    return {
      valid: false,
      errors: ['Missing content field in response'],
    };
  }

  // Validate based on preset type
  switch (preset) {
    case 'markdown_rich':
      return validateMarkdownRich(content);
    case 'single_card':
      return validateSingleCard(content);
    case 'item_grid':
      return validateItemGrid(content);
    case 'comparison_table':
      // For now, fall back to markdown for comparison_table
      return {
        valid: true,
        preset: 'markdown_rich',
        content: {
          text: responseText,
          documentReferences: [],
        } as MarkdownRichContent,
      };
    default:
      return {
        valid: true,
        preset: 'markdown_rich',
        content: {
          text: responseText,
          documentReferences: [],
        } as MarkdownRichContent,
      };
  }
}

function validateMarkdownRich(content: Record<string, unknown>): PresetValidationResult {
  if (typeof content.text !== 'string') {
    return {
      valid: false,
      errors: ['markdown_rich requires text field'],
    };
  }

  const documentReferences = Array.isArray(content.documentReferences)
    ? content.documentReferences.filter((ref): ref is string => typeof ref === 'string')
    : [];

  return {
    valid: true,
    preset: 'markdown_rich',
    content: {
      text: content.text,
      documentReferences,
    } as MarkdownRichContent,
  };
}

function validateSingleCard(content: Record<string, unknown>): PresetValidationResult {
  const errors: string[] = [];

  if (typeof content.documentId !== 'string') {
    errors.push('single_card requires documentId field');
  }

  if (!Array.isArray(content.highlights)) {
    errors.push('single_card requires highlights array');
  }

  if (typeof content.summary !== 'string') {
    errors.push('single_card requires summary field');
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    preset: 'single_card',
    content: {
      documentId: content.documentId as string,
      highlights: (content.highlights as unknown[]).filter((h): h is string => typeof h === 'string'),
      summary: content.summary as string,
    } as SingleCardContent,
  };
}

function validateItemGrid(content: Record<string, unknown>): PresetValidationResult {
  const errors: string[] = [];

  if (!Array.isArray(content.documentIds)) {
    errors.push('item_grid requires documentIds array');
  } else if (content.documentIds.length < 2 || content.documentIds.length > 6) {
    errors.push('item_grid requires 2-6 document IDs');
  }

  if (typeof content.summary !== 'string') {
    errors.push('item_grid requires summary field');
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    preset: 'item_grid',
    content: {
      documentIds: (content.documentIds as unknown[]).filter((id): id is string => typeof id === 'string'),
      title: typeof content.title === 'string' ? content.title : undefined,
      summary: content.summary as string,
    } as ItemGridContent,
  };
}

/**
 * Validate that all document IDs in a preset response exist in the available results
 */
export function validateDocumentIds(
  presetContent: PresetContent,
  availableIds: string[]
): DocumentValidationResult {
  const referencedIds: string[] = [];

  if ('documentId' in presetContent && presetContent.documentId) {
    referencedIds.push(presetContent.documentId);
  }

  if ('documentIds' in presetContent && presetContent.documentIds) {
    referencedIds.push(...presetContent.documentIds);
  }

  if ('documentReferences' in presetContent && presetContent.documentReferences) {
    referencedIds.push(...presetContent.documentReferences);
  }

  const missingIds = referencedIds.filter(id => !availableIds.includes(id));

  return {
    valid: missingIds.length === 0,
    missingIds,
  };
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Convert a preset response to a plain text fallback
 */
export function presetToPlainText(response: PresetResponse): string {
  switch (response.preset) {
    case 'markdown_rich':
      return (response.content as MarkdownRichContent).text;

    case 'single_card': {
      const card = response.content as SingleCardContent;
      const highlights = card.highlights.map(h => `- ${h}`).join('\n');
      return `${card.summary}\n\nKey points:\n${highlights}`;
    }

    case 'item_grid': {
      const grid = response.content as ItemGridContent;
      const title = grid.title ? `**${grid.title}**\n\n` : '';
      return `${title}${grid.summary}\n\nShowing ${grid.documentIds.length} items.`;
    }

    default:
      return JSON.stringify(response.content);
  }
}
