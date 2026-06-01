// src/features/search-experience/chat.utils.ts

/**
 * Shared Chat Utilities
 *
 * Common functions used by chat handlers for:
 * - Formatting search results for AI context
 * - Building chat messages from session history
 * - Executing searches against experience indexes
 */

import 'server-only';

import type { ChatMessage, ToolDefinition, StructuredOutputSchema } from '@/features/ai-service/ai-service.types';
import { createLogger } from '@/shared/logger/logger';

const logger = createLogger('chat-utils');
import * as searchService from '@/features/search/search.service';
import * as aiService from '@/features/ai-service/ai-service.service';
import type {
  SearchExperienceWithIndexes,
} from '@/features/search-experience/search-experience.types';
import { buildChatSystemPrompt } from '@/features/chat/prompt-builder';
import { getConversationSummaryPrompt } from '@/features/chat/prompts';

// ============================================================================
// TYPES
// ============================================================================

/** Chat message stored in session history */
export interface ChatSessionMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  metadata?: {
    toolsUsed?: string[];
    sourcesUsed?: Array<{ id: string; indexId: string; indexName: string; title?: string }>;
    usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
    presetData?: { preset: string; content: unknown };
  };
}

/** Conversation origin — initial search context when chat started */
export interface ChatSessionConversationOrigin {
  searchQuery: string;
  searchFilters?: Array<{ field: string; operator: string; value: unknown }>;
  focusedResultId?: string;
}

/** Active search context — current search results available to AI (max 6) */
export interface ChatSessionActiveSearchContext {
  query: string;
  source: 'initial' | 'tool';
  timestamp: string;
  results: Array<{ id: string; indexId: string; fields: Record<string, unknown> }>;
}

/** Conversation summary — generated when message count exceeds threshold */
export interface ChatSessionSummary {
  content: string;
  generatedAt: string;
  messagesCovered: number;
}

/** Structured response from AI for rendering UI presets */
export interface RenderUIInput {
  presetReasoning?: string;
  preset: 'markdown_rich' | 'single_card' | 'item_grid';
  text?: string;
  documentReferences?: string[];
  documentId?: string;
  highlights?: string[];
  documentIds?: string[];
  title?: string;
  summary?: string;
}

export interface SearchHit {
  id: string;
  score: number;
  source: Record<string, unknown>;
  highlights?: Record<string, string[]>;
}

export interface SearchExecutionResult {
  hits: SearchHit[];
  total: {
    value: number;
    relation: string;
  };
}

/**
 * Session data needed for building chat messages.
 * Uses the new context structure:
 * - conversationOrigin: permanent, lightweight (just the initial query)
 * - activeSearchContext: current search results (replaced on each search)
 * - conversationSummary: AI-generated summary of older messages
 * - messages: sliding window of recent messages
 */
export interface ChatSessionForMessages {
  messages: ChatSessionMessage[];
  conversationOrigin: ChatSessionConversationOrigin | null;
  activeSearchContext: ChatSessionActiveSearchContext | null;
  conversationSummary: ChatSessionSummary | null;
}

// ============================================================================
// SEARCH TOOL DEFINITION
// ============================================================================

/**
 * Information about a filterable field from the search index
 */
export interface FilterableField {
  fieldName: string;
  displayName: string;
  fieldType: string;
}

/**
 * Base search tool definition that AI can use to find information.
 * This is provided to the AI which decides when to use it based on the user's question.
 */
export const SEARCH_TOOL: ToolDefinition = {
  name: 'search',
  description:
    'Search the product catalog. Use simple queries like "pants" or "winter jackets". If search returns 0 results, try a simpler query without filters.',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description:
          'Simple search query - just the product type (e.g., "pants", "shoes", "jackets"). Keep it simple.',
      },
    },
    required: ['query'],
  },
};

/**
 * Build a search tool definition with optional filters based on available fields.
 * This creates a dynamic tool that includes filter parameters when facetable fields are available.
 */
export function buildSearchTool(filterableFields?: FilterableField[]): ToolDefinition {
  // If no filterable fields, return the basic search tool
  if (!filterableFields || filterableFields.length === 0) {
    return SEARCH_TOOL;
  }

  // Build the description with available filter fields
  const filterFieldsDescription = filterableFields
    .map(f => `"${f.fieldName}" (${f.displayName || f.fieldName})`)
    .join(', ');

  return {
    name: 'search',
    description:
      'Search the product catalog. Use simple queries like "pants" or "winter jackets". If search returns 0 results, retry with a simpler query (no filters).',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            'Simple search query - just the product type (e.g., "pants", "shoes", "jackets"). Keep it simple.',
        },
        filters: {
          type: 'array',
          description: `OPTIONAL filters - ONLY use when user explicitly requests (e.g., "under $100"). Available: ${filterFieldsDescription}. If 0 results, retry WITHOUT filters. NEVER guess or invent filter values.`,
          items: {
            type: 'object',
            properties: {
              field: {
                type: 'string',
                description: `The field name to filter on. Must be one of: ${filterableFields.map(f => f.fieldName).join(', ')}`,
              },
              operator: {
                type: 'string',
                description: 'Filter operator. Use "eq" for exact match, "in" for multiple values, "gt"/"lt"/"gte"/"lte" for ranges.',
                enum: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'nin', 'contains'],
              },
              value: {
                type: 'string',
                description: 'The value to filter by. For "eq": use string. For "in"/"nin": use JSON array string like ["val1", "val2"]. For range operators (gt/lt/gte/lte): use number as string.',
              },
            },
            required: ['field', 'operator', 'value'],
          },
        },
      },
      required: ['query'],
    },
  };
}

/**
 * Extract filterable fields from a search experience's indexes.
 * Returns fields marked as isFacetable from the primary (or first) index.
 */
export function getFilterableFieldsFromExperience(
  experience: SearchExperienceWithIndexes
): FilterableField[] {
  // Get the primary index or first index
  const primaryIndex =
    experience.indexes.find((idx) => idx.role === 'primary') || experience.indexes[0];

  if (!primaryIndex) {
    return [];
  }

  // We need to get the full index with fields - this will be passed in from the handler
  // For now, return empty - the actual fields will be fetched by the handler
  return [];
}

// ============================================================================
// CHAT MESSAGE BUILDING
// ============================================================================

/**
 * Debug information about the chat context being sent to AI.
 * Used for debugging prompt/context issues.
 */
export interface ChatContextDebugInfo {
  systemPromptLength: number;
  systemPromptPreview: string;
  /** Whether conversation origin exists (the initial query) */
  hasConversationOrigin: boolean;
  originSearchQuery?: string;
  focusedResultId?: string;
  /** Active search context info */
  hasActiveSearchContext: boolean;
  activeSearchQuery?: string;
  activeSearchSource?: 'initial' | 'tool';
  activeResultCount: number;
  activeResultIds: string[];
  /** Whether a conversation summary exists */
  hasSummary: boolean;
  summaryMessagesCovered?: number;
  /** Message window info */
  historyMessageCount: number;
  newUserMessage: string;
}

/**
 * Result of building chat messages, includes debug info for analytics
 */
export interface BuildChatMessagesResult {
  messages: ChatMessage[];
  debugInfo: ChatContextDebugInfo;
}

/**
 * Build chat messages from session history.
 *
 * New context structure:
 * 1. System prompt with:
 *    - Core instructions
 *    - Domain context (indexes, custom instructions)
 *    - Conversation origin (if exists - just the initial query)
 *    - Active search context (current results - replaced on each search)
 * 2. Conversation summary (if exists - summarizes older pruned messages)
 * 3. Recent message history (sliding window)
 * 4. New user message
 *
 * Returns both the messages and debug info for verification/analytics.
 */
export function buildChatMessages(
  session: ChatSessionForMessages,
  newMessage: string,
  experience: SearchExperienceWithIndexes,
  maxContextMessages: number
): BuildChatMessagesResult {
  const messages: ChatMessage[] = [];

  // Initialize debug info
  const debugInfo: ChatContextDebugInfo = {
    systemPromptLength: 0,
    systemPromptPreview: '',
    hasConversationOrigin: !!session.conversationOrigin,
    originSearchQuery: session.conversationOrigin?.searchQuery,
    focusedResultId: session.conversationOrigin?.focusedResultId,
    hasActiveSearchContext: !!session.activeSearchContext,
    activeSearchQuery: session.activeSearchContext?.query,
    activeSearchSource: session.activeSearchContext?.source,
    activeResultCount: session.activeSearchContext?.results?.length ?? 0,
    activeResultIds: session.activeSearchContext?.results?.map(r => r.id) ?? [],
    hasSummary: !!session.conversationSummary,
    summaryMessagesCovered: session.conversationSummary?.messagesCovered,
    historyMessageCount: 0,
    newUserMessage: newMessage,
  };

  // Build system prompt using the prompt builder
  // Now uses activeSearchContext instead of initial results embedded in system prompt
  const systemPrompt = buildChatSystemPrompt({
    experience,
    conversationOrigin: session.conversationOrigin ?? undefined,
    activeSearchContext: session.activeSearchContext ?? undefined,
  });

  messages.push({ role: 'system', content: systemPrompt });

  // Capture debug info
  debugInfo.systemPromptLength = systemPrompt.length;
  debugInfo.systemPromptPreview = systemPrompt.substring(0, 500) + (systemPrompt.length > 500 ? '...' : '');

  // Add conversation summary if exists (from older pruned messages)
  if (session.conversationSummary) {
    messages.push({
      role: 'system',
      content: `<conversation_summary>
The following is a summary of the earlier conversation:
${session.conversationSummary.content}
</conversation_summary>`,
    });
  }

  // Get recent messages for context (sliding window - no search context per message anymore)
  const historyMessages = session.messages
    .filter((m) => m.role !== 'system')
    .slice(-maxContextMessages);

  debugInfo.historyMessageCount = historyMessages.length;

  // Add history messages (no per-message search context - it's now in activeSearchContext)
  for (const msg of historyMessages) {
    messages.push({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    });
  }

  // Add the new user message
  messages.push({ role: 'user', content: newMessage });

  // Log debug info for troubleshooting
  logger.debug('Chat context built', {
    experienceId: experience.id,
    ...debugInfo,
  });

  return { messages, debugInfo };
}

// ============================================================================
// SEARCH EXECUTION
// ============================================================================

/**
 * Filter clause for AI tool calls
 */
export interface AIToolFilter {
  field: string;
  operator: string;
  value: unknown;
}

/**
 * Execute search against the experience's indexes.
 * Uses the primary index or first available index.
 * Supports optional filters from AI tool calls.
 * Uses hybrid config from experience if configured.
 */
export async function executeSearch(
  query: string,
  experience: SearchExperienceWithIndexes,
  maxResults: number = 10,
  filters?: AIToolFilter[],
  sort?: Array<{ field: string; direction: 'asc' | 'desc' }>
): Promise<SearchExecutionResult> {
  // Search the primary index (or first available)
  const primaryIndex =
    experience.indexes.find((idx) => idx.role === 'primary') || experience.indexes[0];

  if (!primaryIndex) {
    throw new Error('No indexes configured for this search experience');
  }

  // Convert AI tool filters to search service filter format
  // Handle AI sometimes passing values in unexpected formats for 'in'/'nin' operators
  const searchFilters = filters?.map(f => {
    let normalizedValue = f.value;

    // Fix: Normalize 'in'/'nin' filter values to arrays
    if ((f.operator === 'in' || f.operator === 'nin') && typeof f.value === 'string') {
      const strValue = f.value.trim();

      // Try parsing as JSON array first (e.g., '["val1", "val2"]')
      if (strValue.startsWith('[')) {
        try {
          normalizedValue = JSON.parse(strValue);
        } catch {
          // Fall back to comma-separated parsing
          normalizedValue = strValue.split(',').map((v: string) => v.trim());
        }
      } else {
        // Split comma-separated string into array (e.g., "val1,val2,val3")
        normalizedValue = strValue.split(',').map((v: string) => v.trim());
      }

      logger.debug('Normalized filter value from string to array', {
        field: f.field,
        operator: f.operator,
        original: f.value,
        normalized: normalizedValue,
      });
    }

    return {
      field: f.field,
      operator: f.operator as 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'nin' | 'contains' | 'prefix' | 'exists' | 'missing' | 'range' | 'and' | 'or' | 'not',
      value: normalizedValue,
    };
  });

  // Extract hybrid config from experience's searchConfig (if set)
  const hybridConfig = experience.searchConfig?.hybridConfig;

  // Use defaultSearchType from experience config, or fall back to 'auto'
  const searchType = (experience.searchConfig?.defaultSearchType ?? 'auto') as 'lexical' | 'semantic' | 'hybrid' | 'auto';

  const result = await searchService.searchById(
    primaryIndex.searchIndexId,
    {
      query,
      searchType,
      pageSize: maxResults,
      filters: searchFilters,
      sort,
      highlight: {
        preTag: '<em>',
        postTag: '</em>',
      },
    },
    {
      experienceId: experience.id,
      experienceSlug: experience.slug,
      // Pass hybrid config override if experience has custom tuning
      hybridConfig: hybridConfig ? {
        lexicalWeight: hybridConfig.lexicalWeight,
        semanticWeight: hybridConfig.semanticWeight,
        rrfRankConstant: hybridConfig.rrfRankConstant,
        rrfWindowSize: hybridConfig.rrfWindowSize,
      } : undefined,
    }
  );

  return {
    hits: result.hits,
    total: result.total,
  };
}

// ============================================================================
// SEARCH RESULT FORMATTING
// ============================================================================

/**
 * Format search results for AI context (from tool execution).
 * Uses all fields from source (already filtered by includeInResponse on the index).
 */
export function formatSearchResultsForContext(hits: SearchHit[]): string {
  if (hits.length === 0) {
    return '<search_results>\nNo results found.\n</search_results>';
  }

  const formattedResults = hits
    .map((hit) => {
      const parts: string[] = [`[${hit.id}]`];

      // Include all non-empty fields from source
      for (const [key, value] of Object.entries(hit.source)) {
        if (key.startsWith('_')) continue; // Skip internal fields
        if (value === null || value === undefined || value === '') continue;

        const formattedValue = formatFieldValue(value);
        if (formattedValue) {
          parts.push(`${formatFieldName(key)}: ${formattedValue}`);
        }
      }

      return parts.join('\n');
    })
    .join('\n\n');

  return `<search_results>
${formattedResults}
</search_results>`;
}

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

  return truncateText(formatted, maxLength);
}

/**
 * Format search context from history for inclusion in conversation.
 * Very compact - just IDs and first text field for reference.
 */
export function formatSearchContextForHistory(searchContext: {
  query: string;
  resultCount: number;
  results: Array<{ id: string; fields: Record<string, unknown> }>;
}): string {
  if (!searchContext.results || searchContext.results.length === 0) {
    return '';
  }

  // Just ID and first meaningful field value
  const items = searchContext.results
    .slice(0, 5) // Limit to 5 for history
    .map((r) => {
      // Get first non-empty string field as identifier
      const firstField = Object.entries(r.fields).find(
        ([key, val]) => !key.startsWith('_') && typeof val === 'string' && val.trim()
      );
      const label = firstField ? truncateText(String(firstField[1]), 50) : 'Item';
      return `${r.id}: ${label}`;
    })
    .join('\n');

  return `Available from previous search:\n${items}`;
}

// ============================================================================
// TEXT UTILITIES
// ============================================================================

/**
 * Truncate text to max length with ellipsis.
 */
export function truncateText(text: string, maxLength: number): string {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

// ============================================================================
// UI RENDERING TOOL
// ============================================================================

import type {
  PresetContent,
  MarkdownRichContent,
  SingleCardContent,
  ItemGridContent,
} from '@/features/response-presets/presets.types';

/**
 * Tool for AI to render UI components.
 * This replaces the fragile "parse JSON from text" approach with proper tool calling.
 */
export const RENDER_UI_TOOL: ToolDefinition = {
  name: 'render_ui',
  description:
    'Render a UI component to display your response to the user. You MUST use this tool for ALL responses. Choose the appropriate preset based on what you want to show.',
  parameters: {
    type: 'object',
    properties: {
      preset: {
        type: 'string',
        enum: ['markdown_rich', 'single_card', 'item_grid'],
        description:
          'The UI preset to use. "item_grid" for showing 2-6 items, "single_card" for highlighting one item, "markdown_rich" for text explanations and general responses.',
      },
      // Markdown rich content
      text: {
        type: 'string',
        description:
          'For markdown_rich: The markdown formatted text to display. Use headers, bullet points, and bold for emphasis.',
      },
      documentReferences: {
        type: 'array',
        items: { type: 'string' },
        description: 'For markdown_rich: Document IDs mentioned in the text.',
      },
      // Single card content
      documentId: {
        type: 'string',
        description:
          'For single_card: The document ID to highlight. MUST exist in the search results.',
      },
      highlights: {
        type: 'array',
        items: { type: 'string' },
        description: 'For single_card: 2-4 key points about this item relevant to the user query.',
      },
      // Item grid content
      documentIds: {
        type: 'array',
        items: { type: 'string' },
        description:
          'For item_grid: 2-6 document IDs to display in a grid. All IDs MUST exist in the search results.',
      },
      title: {
        type: 'string',
        description: 'For item_grid: Optional title for the grid (e.g., "Top Picks for Winter").',
      },
      // Shared
      summary: {
        type: 'string',
        description:
          'Brief explanation or commentary. Required for single_card and item_grid. Explains why these items were selected.',
      },
    },
    required: ['preset'],
  },
};

// ============================================================================
// CHAT RESPONSE STRUCTURED OUTPUT SCHEMA
// ============================================================================

/**
 * Structured output schema for chat responses.
 * Replaces render_ui tool with response_format for more reliable output formatting.
 *
 * Uses OpenAI's Structured Outputs (json_schema) to ensure the AI always returns
 * a valid response in the expected format.
 *
 * Note: Preset selection LOGIC is in the system prompt (via buildPresetDecisionPrompt).
 * These descriptions focus on the FORMAT requirements for each preset.
 */
export const CHAT_RESPONSE_SCHEMA: StructuredOutputSchema = {
  name: 'chat_response',
  description: 'Structured response format for chat messages with UI preset selection',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      // Chain-of-thought: Force the model to reason about preset choice first
      presetReasoning: {
        type: 'string',
        description: 'First, reason about which preset to use: Does the user want THE best/cheapest one item? (single_card) Or multiple options to browse? (item_grid) Or is this just a greeting with no products? (markdown_rich)',
      },
      preset: {
        type: 'string',
        enum: ['markdown_rich', 'single_card', 'item_grid'],
        description: 'Based on your reasoning: "single_card" if recommending ONE best item, "item_grid" if showing multiple options, "markdown_rich" ONLY for greetings or zero products.',
      },
      // For markdown_rich preset
      text: {
        type: ['string', 'null'],
        description: 'For markdown_rich: Conversational markdown text. Be helpful and engaging, not robotic.',
      },
      documentReferences: {
        type: ['array', 'null'],
        items: { type: 'string' },
        description: 'For markdown_rich: Document IDs mentioned in text (if any).',
      },
      // For single_card preset
      documentId: {
        type: ['string', 'null'],
        description: 'For single_card: The document ID to highlight. MUST exist in search results.',
      },
      highlights: {
        type: ['array', 'null'],
        items: { type: 'string' },
        description: 'For single_card: 2-4 compelling reasons why this item is recommended. Be specific to the user\'s question.',
      },
      // For item_grid preset
      documentIds: {
        type: ['array', 'null'],
        items: { type: 'string' },
        description: 'For item_grid: 2-6 document IDs to display. All MUST exist in search results. Order by relevance.',
      },
      title: {
        type: ['string', 'null'],
        description: 'For item_grid: Optional engaging title (e.g., "Top Picks for You", "Best Value Options").',
      },
      // Shared field
      summary: {
        type: ['string', 'null'],
        description: 'For single_card/item_grid: Conversational explanation of your selection. Explain WHY these items match what the user is looking for. Be friendly and helpful.',
      },
    },
    required: ['presetReasoning', 'preset', 'text', 'documentReferences', 'documentId', 'highlights', 'documentIds', 'title', 'summary'],
    additionalProperties: false,
  },
};

/**
 * Parse and validate structured output from AI response.
 * Returns the parsed RenderUIInput or null if parsing fails.
 */
export function parseStructuredResponse(content: string): RenderUIInput | null {
  try {
    const parsed = JSON.parse(content);

    // Validate required preset field
    if (!parsed.preset || !['markdown_rich', 'single_card', 'item_grid'].includes(parsed.preset)) {
      return null;
    }

    return parsed as RenderUIInput;
  } catch {
    return null;
  }
}

/**
 * Validate that document IDs in render_ui input exist in available results.
 */
export function validateRenderUIDocumentIds(
  input: RenderUIInput,
  availableIds: Set<string>
): { valid: boolean; missingIds: string[] } {
  const idsToValidate: string[] = [];

  if (input.documentIds) {
    idsToValidate.push(...input.documentIds);
  }
  if (input.documentId) {
    idsToValidate.push(input.documentId);
  }

  const missingIds = idsToValidate.filter((id) => !availableIds.has(id));
  return { valid: missingIds.length === 0, missingIds };
}

/**
 * Build preset content from render_ui tool input.
 */
export function buildPresetContent(input: RenderUIInput): PresetContent {
  switch (input.preset) {
    case 'markdown_rich':
      return {
        text: input.text || '',
        documentReferences: input.documentReferences || [],
      } as MarkdownRichContent;

    case 'single_card':
      return {
        documentId: input.documentId || '',
        highlights: input.highlights || [],
        summary: input.summary || '',
      } as SingleCardContent;

    case 'item_grid':
      return {
        documentIds: input.documentIds || [],
        title: input.title,
        summary: input.summary || '',
      } as ItemGridContent;

    default:
      // Fallback to markdown
      return {
        text: input.text || input.summary || '',
        documentReferences: [],
      } as MarkdownRichContent;
  }
}

// ============================================================================
// CONVERSATION SUMMARY GENERATION
// ============================================================================

/**
 * Soft threshold - triggers async summary attempt (non-blocking).
 * Summary runs in background, may be skipped if conversation moves fast.
 */
export const SUMMARY_SOFT_THRESHOLD = 10;

/**
 * Hard threshold - forces synchronous summary (blocking).
 * User must wait for summary to complete. This is a safety net to prevent
 * unbounded message growth in fast-moving conversations.
 */
export const SUMMARY_HARD_THRESHOLD = 20;

/** Number of recent messages to keep after summarization */
export const MESSAGES_TO_KEEP_AFTER_SUMMARY = 4;

/**
 * Result of checking if summary is needed and potentially generating it
 */
export interface SummaryCheckResult {
  /** Whether summarization occurred */
  summarized: boolean;
  /** New summary (if generated) */
  newSummary?: ChatSessionSummary;
  /** Messages to keep (pruned if summarized) */
  messages: ChatSessionMessage[];
  /** Number of messages that were summarized */
  messagesSummarized?: number;
}

/**
 * Options for summary generation
 */
export interface CheckSummaryOptions {
  /**
   * Force summary generation even if below soft threshold.
   * Used when hard threshold is reached and we MUST summarize.
   */
  force?: boolean;
}

/**
 * Check if conversation needs summarization and generate if needed.
 *
 * Soft trigger: When total messages exceed SUMMARY_SOFT_THRESHOLD (10)
 * Hard trigger: When force=true (used at SUMMARY_HARD_THRESHOLD)
 * Action: Summarize older messages, keep recent MESSAGES_TO_KEEP_AFTER_SUMMARY (4)
 *
 * @param messages Current session messages
 * @param existingSummary Existing summary (if any) - will be included in new summary
 * @param experience Search experience for AI config
 * @param options Optional settings including force flag
 */
export async function checkAndGenerateSummary(
  messages: ChatSessionMessage[],
  existingSummary: ChatSessionSummary | null,
  experience: SearchExperienceWithIndexes,
  options: CheckSummaryOptions = {}
): Promise<SummaryCheckResult> {
  const { force = false } = options;

  // Filter out system messages for counting
  const conversationMessages = messages.filter(m => m.role !== 'system');

  // Check if we've exceeded the threshold (unless forced)
  if (!force && conversationMessages.length <= SUMMARY_SOFT_THRESHOLD) {
    return {
      summarized: false,
      messages,
    };
  }

  const triggerReason = force ? 'hard_threshold' : 'soft_threshold';

  logger.info('Generating conversation summary', {
    experienceId: experience.id,
    totalMessages: conversationMessages.length,
    threshold: force ? SUMMARY_HARD_THRESHOLD : SUMMARY_SOFT_THRESHOLD,
    triggerReason,
    existingSummary: !!existingSummary,
  });

  // Split messages: older ones to summarize, recent ones to keep
  const messagesToSummarize = conversationMessages.slice(0, -MESSAGES_TO_KEEP_AFTER_SUMMARY);
  const messagesToKeep = conversationMessages.slice(-MESSAGES_TO_KEEP_AFTER_SUMMARY);

  // Build the conversation text for summarization
  const conversationText = formatMessagesForSummary(messagesToSummarize, existingSummary);

  try {
    // Generate summary using AI
    const summaryContent = await generateConversationSummary(
      conversationText,
      experience
    );

    const newSummary: ChatSessionSummary = {
      content: summaryContent,
      generatedAt: new Date().toISOString(),
      messagesCovered: (existingSummary?.messagesCovered ?? 0) + messagesToSummarize.length,
    };

    logger.info('Conversation summary generated', {
      experienceId: experience.id,
      messagesSummarized: messagesToSummarize.length,
      messagesKept: messagesToKeep.length,
      totalCovered: newSummary.messagesCovered,
    });

    return {
      summarized: true,
      newSummary,
      messages: messagesToKeep,
      messagesSummarized: messagesToSummarize.length,
    };
  } catch (error) {
    logger.error('Failed to generate conversation summary', {
      experienceId: experience.id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    // On failure, don't summarize - keep all messages
    return {
      summarized: false,
      messages,
    };
  }
}

/**
 * Format messages for the summarization prompt
 */
function formatMessagesForSummary(
  messages: ChatSessionMessage[],
  existingSummary: ChatSessionSummary | null
): string {
  const parts: string[] = [];

  // Include existing summary if present
  if (existingSummary) {
    parts.push(`Previous conversation summary:\n${existingSummary.content}\n`);
    parts.push('---\n');
    parts.push('Additional conversation to include in the summary:\n');
  }

  // Format each message
  for (const msg of messages) {
    const role = msg.role === 'user' ? 'User' : 'Assistant';
    parts.push(`${role}: ${msg.content}`);
  }

  return parts.join('\n');
}

/**
 * Generate a summary of the conversation using AI
 */
async function generateConversationSummary(
  conversationText: string,
  experience: SearchExperienceWithIndexes
): Promise<string> {
  const systemPrompt = getConversationSummaryPrompt();

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `Please summarize this conversation:\n\n${conversationText}` },
  ];

  const response = await aiService.chat(messages, {
    providerId: experience.aiConfig.providerId ?? undefined,
    modelId: experience.aiConfig.modelId ?? undefined,
    maxTokens: 300, // Keep summary concise
    temperature: 0.3, // Lower temperature for factual summary
    feature: 'conversation_summary',
  });

  // Extract text content from the response message
  const content = response.message.content;
  if (typeof content === 'string') {
    return content;
  }
  // Handle array of content blocks - extract text from text blocks
  const textBlocks = content.filter((block): block is { type: 'text'; text: string } => block.type === 'text');
  return textBlocks.map(block => block.text).join('\n');
}

// ============================================================================
// ASYNC SUMMARY MERGE LOGIC
// ============================================================================

/**
 * Result of applying summary with merge logic
 */
export interface ApplySummaryResult {
  /** Whether the summary was applied */
  applied: boolean;
  /** Reason if not applied */
  reason?: 'no_summary' | 'merged' | 'applied_directly';
  /** Final message count after apply */
  finalMessageCount?: number;
  /** Number of new messages that were preserved during merge */
  newMessagesPreserved?: number;
}

/**
 * Apply a completed summary to the session, merging any new messages that
 * arrived while the summary was being generated.
 *
 * This prevents race conditions where:
 * 1. Summary starts with messages [1-11]
 * 2. User sends messages 12, 13 while summary generates
 * 3. Summary completes and would overwrite with [8-11], losing 12-13
 *
 * With merge logic:
 * - We detect that 2 new messages arrived (12, 13)
 * - We apply summary but preserve: [SUMMARY] + [8-11] + [12-13]
 *
 * @param sessionId - The session to update
 * @param summaryResult - The generated summary result
 * @param originalMessageCount - Message count when summary started
 * @param getSession - Function to fetch current session state
 * @param updateSession - Function to update session
 */
export async function applySummaryWithMerge(
  sessionId: string,
  summaryResult: SummaryCheckResult,
  originalMessageCount: number,
  getSession: () => Promise<{ messages: ChatSessionMessage[]; conversationSummary: ChatSessionSummary | null } | null>,
  updateSession: (updates: {
    messages: ChatSessionMessage[];
    messageCount: number;
    conversationSummary: ChatSessionSummary;
  }) => Promise<void>
): Promise<ApplySummaryResult> {
  // If no summary was generated, nothing to apply
  if (!summaryResult.summarized || !summaryResult.newSummary) {
    return { applied: false, reason: 'no_summary' };
  }

  // Fetch current session state
  const currentSession = await getSession();
  if (!currentSession) {
    logger.warn('Session not found when applying summary', { sessionId });
    return { applied: false, reason: 'no_summary' };
  }

  // Calculate how many NEW messages arrived while summarizing
  const currentMessageCount = currentSession.messages.filter(m => m.role !== 'system').length;
  const newMessagesSinceStart = currentMessageCount - originalMessageCount;

  if (newMessagesSinceStart > 0) {
    // New messages arrived - merge them with summarized state
    const newMessages = currentSession.messages.slice(-newMessagesSinceStart);
    const mergedMessages = [...summaryResult.messages, ...newMessages];

    logger.info('Applying summary with merge - preserving new messages', {
      sessionId,
      originalCount: originalMessageCount,
      currentCount: currentMessageCount,
      newMessagesPreserved: newMessagesSinceStart,
      summaryMessagesKept: summaryResult.messages.length,
      finalCount: mergedMessages.length,
    });

    await updateSession({
      messages: mergedMessages,
      messageCount: mergedMessages.length,
      conversationSummary: summaryResult.newSummary,
    });

    return {
      applied: true,
      reason: 'merged',
      finalMessageCount: mergedMessages.length,
      newMessagesPreserved: newMessagesSinceStart,
    };
  } else {
    // No new messages - apply summary directly
    logger.info('Applying summary directly - no new messages', {
      sessionId,
      originalCount: originalMessageCount,
      finalCount: summaryResult.messages.length,
    });

    await updateSession({
      messages: summaryResult.messages,
      messageCount: summaryResult.messages.length,
      conversationSummary: summaryResult.newSummary,
    });

    return {
      applied: true,
      reason: 'applied_directly',
      finalMessageCount: summaryResult.messages.length,
    };
  }
}
