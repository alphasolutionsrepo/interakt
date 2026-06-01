// src/features/chat/prompts/index.ts

/**
 * System Prompts
 *
 * Loads prompts from .md files at module initialization.
 * This happens once when the module is first imported, then cached in memory.
 */

import fs from 'fs';
import path from 'path';

// ============================================================================
// LOAD PROMPTS FROM FILES (at module init)
// ============================================================================

// Use process.cwd() for reliable path resolution in Next.js
const PROMPTS_DIR = path.join(process.cwd(), 'src/features/chat/prompts');

function loadPrompt(filename: string): string {
  const filePath = path.join(PROMPTS_DIR, filename);
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch (error) {
    console.error(`Failed to load prompt file: ${filename}`, error);
    return '';
  }
}

// Load once at module initialization
const CHAT_SYSTEM_PROMPT = loadPrompt('chat-system.md');
const SUMMARY_SYSTEM_PROMPT = loadPrompt('summary-system.md');
const CONVERSATION_SUMMARY_PROMPT = loadPrompt('conversation-summary.md');
const GENERATE_CUSTOM_INSTRUCTIONS_PROMPT = loadPrompt('generate-custom-instructions.md');

// ============================================================================
// EXPORTS
// ============================================================================

/**
 * Core chat system prompt.
 */
export function getChatSystemPrompt(): string {
  return CHAT_SYSTEM_PROMPT;
}

/**
 * Summary generation system prompt (for search results).
 */
export function getSummarySystemPrompt(): string {
  return SUMMARY_SYSTEM_PROMPT;
}

/**
 * Conversation summary prompt (for summarizing older messages).
 */
export function getConversationSummaryPrompt(): string {
  return CONVERSATION_SUMMARY_PROMPT;
}

/**
 * Prompt for generating custom instructions using AI.
 * Used to help users create tailored instructions based on their index data.
 */
export function getGenerateCustomInstructionsPrompt(): string {
  return GENERATE_CUSTOM_INSTRUCTIONS_PROMPT;
}
