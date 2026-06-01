// src/features/search-experience/prompt-builder.ts

/**
 * System Prompt Builder
 *
 * Builds final system prompts with clear structure:
 *
 * 1. Core Instructions (from chat-system.md) - How the AI should behave
 * 2. Domain Context (from index names) - What data the AI has access to
 * 3. Custom Instructions (admin-configured) - Specific persona/rules for this experience
 * 4. Response Format Instructions - How to choose presets for visual responses
 * 5. Available Context (search results) - Data the AI can reference
 */

import type {
  SearchExperienceWithIndexes,
} from '@/features/search-experience/search-experience.types';
import type {
  ChatSessionConversationOrigin,
  ChatSessionActiveSearchContext,
} from './chat.utils';
import {
  formatResultsForAIContext,
  formatFocusedResultContext,
  buildPresetDecisionPrompt,
  MVP_PRESET_KEYS,
} from '@/features/response-presets';
import { getChatSystemPrompt, getSummarySystemPrompt } from '@/features/chat/prompts';

// ============================================================================
// DOMAIN CONTEXT BUILDER
// ============================================================================

/**
 * Build domain context from index names.
 * Just a hint for the AI - detailed context should come from custom instructions.
 */
function buildDomainContext(experience: SearchExperienceWithIndexes): string {
  const indexNames = experience.indexes
    .map((idx) => idx.searchIndex.displayName || idx.searchIndex.name)
    .filter(Boolean);

  if (indexNames.length === 0) {
    return '';
  }

  return `<domain>
You are an assistant with access to: ${indexNames.join(', ')}
</domain>`;
}

// ============================================================================
// CUSTOM INSTRUCTIONS BUILDER
// ============================================================================

/**
 * Format admin-provided custom instructions.
 * These allow customization of persona, tone, and specific rules.
 */
function buildCustomInstructions(customInstructions: string | undefined): string {
  if (!customInstructions?.trim()) {
    return '';
  }

  return `<custom_instructions>
## Experience-Specific Instructions

${customInstructions.trim()}
</custom_instructions>`;
}

// ============================================================================
// CHAT PROMPT BUILDER
// ============================================================================

export interface BuildChatPromptOptions {
  experience: SearchExperienceWithIndexes;
  /** Conversation origin - the initial search query when chat started (permanent, lightweight) */
  conversationOrigin?: ChatSessionConversationOrigin;
  /** Active search context - current search results (replaced on each search, max 6) */
  activeSearchContext?: ChatSessionActiveSearchContext;
}

/**
 * Build the complete system prompt for chat.
 *
 * Structure (in order of importance/positioning):
 * 1. Core Instructions - Fundamental behavior rules
 * 2. Domain Context - What the AI has access to
 * 3. Custom Instructions - Experience-specific persona/rules
 * 4. Response Format - How to choose presets for visual responses
 * 5. Conversation Origin - The search query that started this conversation (permanent)
 * 6. Focused Item - Specific item user is asking about (if any)
 * 7. Active Search Context - Current search results available for reference (replaceable)
 */
export function buildChatSystemPrompt(options: BuildChatPromptOptions): string {
  const {
    experience,
    conversationOrigin,
    activeSearchContext,
  } = options;

  const parts: string[] = [];

  // 1. Core Instructions (from markdown file) - Most important, goes first
  parts.push(getChatSystemPrompt());

  // 2. Domain Context - What data this AI works with
  const domainContext = buildDomainContext(experience);
  if (domainContext) {
    parts.push(domainContext);
  }

  // 3. Custom Instructions - Admin-configured persona/rules
  const customInstructions = buildCustomInstructions(
    (experience.aiConfig as unknown as { chat?: { customInstructions?: string } })?.chat?.customInstructions
  );
  if (customInstructions) {
    parts.push(customInstructions);
  }

  // 4. Response Format Instructions - How to choose presets
  // Use experience's enabled presets, or default to MVP presets
  const enabledPresets = (experience.aiConfig as unknown as { chat?: { enabledPresets?: string[] } })?.chat?.enabledPresets ?? MVP_PRESET_KEYS;
  parts.push(buildPresetDecisionPrompt(enabledPresets));

  // 5. Conversation Origin - How the conversation started (permanent, lightweight)
  if (conversationOrigin?.searchQuery) {
    parts.push(`<conversation_origin>
This conversation started from a search for: "${conversationOrigin.searchQuery}"
</conversation_origin>`);
  }

  // 6. Focused Item - If user clicked "Ask AI" on a specific item
  if (conversationOrigin?.focusedResultId && activeSearchContext?.results) {
    const focusedResult = activeSearchContext.results.find(
      (r) => r.id === conversationOrigin.focusedResultId
    );
    if (focusedResult) {
      parts.push(formatFocusedResultContext(focusedResult));
    }
  }

  // 7. Active Search Context - Current search results to reference (max 6, replaced on each search)
  if (activeSearchContext?.results && activeSearchContext.results.length > 0) {
    const contextHeader = activeSearchContext.source === 'initial'
      ? `Search results for "${activeSearchContext.query}" (from search page):`
      : `Search results for "${activeSearchContext.query}" (from your search):`;

    parts.push(`<active_search_context>
${contextHeader}
${formatResultsForAIContext(activeSearchContext.results)}
</active_search_context>`);
  }

  return parts.join('\n\n');
}

// ============================================================================
// SUMMARY PROMPT BUILDER
// ============================================================================

export interface BuildSummaryPromptOptions {
  experience: SearchExperienceWithIndexes;
}

/**
 * Build the complete system prompt for summary generation.
 */
export function buildSummarySystemPrompt(options: BuildSummaryPromptOptions): string {
  const { experience } = options;

  const parts: string[] = [];

  // 1. Core Summary Instructions
  parts.push(getSummarySystemPrompt());

  // 2. Domain Context
  const domainContext = buildDomainContext(experience);
  if (domainContext) {
    parts.push(domainContext);
  }

  // 3. Custom Instructions (if any)
  const customInstructions = buildCustomInstructions(
    experience.aiConfig.summary.customInstructions
  );
  if (customInstructions) {
    parts.push(customInstructions);
  }

  return parts.join('\n\n');
}

// ============================================================================
// EXPORTS FOR TESTING/INSPECTION
// ============================================================================

/**
 * Get the core instructions (for documentation/UI display).
 */
export function getCoreInstructions(): { chat: string; summary: string } {
  return {
    chat: getChatSystemPrompt(),
    summary: getSummarySystemPrompt(),
  };
}
