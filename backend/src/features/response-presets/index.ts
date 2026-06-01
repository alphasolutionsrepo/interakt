// src/features/response-presets/index.ts

/**
 * Response Presets Module
 *
 * Exports all preset-related types, definitions, and services.
 */

// Types
export * from './presets.types';

// Definitions
export {
  RESPONSE_PRESETS,
  DEFAULT_PRESETS_BY_CATEGORY,
  ALL_PRESET_KEYS,
  MVP_PRESET_KEYS,
} from './presets.definition';

// Service functions
export {
  getAllPresets,
  getPresetByKey,
  getPresetsForCategory,
  getDefaultPresetsForCategory,
  getPresetsByKeys,
  validatePresetKeys,
  validatePresetsForCategory,
  parsePresetResponse,
  validateDocumentIds,
  presetToPlainText,
} from './presets.service';

// Prompt builders
export {
  buildPresetDecisionPrompt,
  buildPresetInstructions, // @deprecated - use buildPresetDecisionPrompt
  formatResultsForAIContext,
  formatFocusedResultContext,
} from './presets.prompts';
