// src/features/chat/index.ts

/**
 * Chat Feature - Public Exports
 *
 * Manages AI-powered features:
 * - Summary generation (handleSummarize)
 * - Chat utilities used by AI Experiences
 *
 * Dependencies:
 * - search-experience: for experience config, auth middleware
 * - ai-service: for low-level AI primitives (chat, stream, embed)
 * - analytics: for tracking and tracing
 * - response-presets: for preset formatting
 */

// ============================================================================
// Chat Utilities (used by AI Experiences pipeline)
// ============================================================================

export {
  SEARCH_TOOL,
  RENDER_UI_TOOL,
  buildSearchTool,
  buildChatMessages,
  executeSearch,
  formatSearchResultsForContext,
  validateRenderUIDocumentIds,
  buildPresetContent,
  checkAndGenerateSummary,
  applySummaryWithMerge,
  truncateText,
  SUMMARY_SOFT_THRESHOLD,
  SUMMARY_HARD_THRESHOLD,
  CHAT_RESPONSE_SCHEMA,
  parseStructuredResponse,
  type FilterableField,
  type AIToolFilter,
} from './chat.utils';

// ============================================================================
// API Handlers
// ============================================================================

export {
  handleSummarize,
} from './chat.api.handlers';
