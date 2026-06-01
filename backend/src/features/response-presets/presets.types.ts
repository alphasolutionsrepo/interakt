// src/features/response-presets/presets.types.ts

/**
 * Response Presets Types
 *
 * Defines the structure of display presets that AI uses to format responses.
 * Each preset determines how chat responses are rendered in the frontend.
 */

// ============================================================================
// PRESET DEFINITION TYPES
// ============================================================================

/**
 * Definition of a response preset
 */
export interface ResponsePreset {
  /** Unique key identifier (e.g., 'markdown_rich', 'single_card') */
  key: string;
  /** Human-readable name for admin UI */
  name: string;
  /** Description explaining when this preset is used */
  description: string;
  /** Data template slugs that can use this preset. Use ['*'] for all. */
  categories: string[];
  /** JSON schema describing the expected response structure */
  responseSchema: ResponseSchema;
  /** Instructions included in the AI system prompt */
  promptInstructions: string;
}

/**
 * JSON Schema for preset response structure
 */
export interface ResponseSchema {
  type: PresetType;
  properties: Record<string, SchemaProperty>;
  required: string[];
}

export type PresetType = 'markdown_rich' | 'single_card' | 'item_grid' | 'comparison_table';

export interface SchemaProperty {
  type: 'string' | 'array' | 'object' | 'number' | 'boolean';
  description: string;
  items?: SchemaProperty;
  properties?: Record<string, SchemaProperty>;
}

// ============================================================================
// AI RESPONSE TYPES
// ============================================================================

/**
 * The structured response AI returns in chat
 */
export interface PresetResponse {
  /** The preset key used for this response */
  preset: PresetType;
  /** Preset-specific content */
  content: PresetContent;
}

export type PresetContent =
  | MarkdownRichContent
  | SingleCardContent
  | ItemGridContent
  | ComparisonTableContent;

/**
 * Markdown Rich Content
 * For explanations, general information, and text-heavy responses
 */
export interface MarkdownRichContent {
  /** Markdown formatted text */
  text: string;
  /** Document IDs referenced in the response */
  documentReferences?: string[];
}

/**
 * Single Card Content
 * For highlighting one specific item with AI commentary
 */
export interface SingleCardContent {
  /** Document ID to display */
  documentId: string;
  /** 2-4 key points about this item */
  highlights: string[];
  /** AI's commentary about why this item is relevant */
  summary: string;
}

/**
 * Item Grid Content
 * For showing multiple items in a grid layout
 */
export interface ItemGridContent {
  /** Document IDs to display (2-6 items) */
  documentIds: string[];
  /** Optional title for the grid */
  title?: string;
  /** AI's explanation of why these items were selected */
  summary: string;
}

/**
 * Comparison Table Content
 * For side-by-side comparisons (future use)
 */
export interface ComparisonTableContent {
  /** Document IDs to compare (2-4 items) */
  documentIds: string[];
  /** Comparison aspects with winners */
  comparisonPoints: Array<{
    aspect: string;
    winner?: string;
    explanation: string;
  }>;
  /** AI's overall recommendation */
  recommendation: string;
}

// ============================================================================
// VALIDATION TYPES
// ============================================================================

export interface PresetValidationResult {
  valid: boolean;
  preset?: PresetType;
  content?: PresetContent;
  errors?: string[];
}

export interface DocumentValidationResult {
  valid: boolean;
  missingIds: string[];
}
