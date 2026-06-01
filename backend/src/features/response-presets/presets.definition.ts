// src/features/response-presets/presets.definition.ts

/**
 * Response Presets Definitions
 *
 * Static definitions of all available display presets.
 * These are used to:
 * 1. Show available presets in admin UI (filtered by data template category)
 * 2. Generate AI prompt instructions
 * 3. Validate AI responses
 */

import type { ResponsePreset } from './presets.types';

// ============================================================================
// PRESET DEFINITIONS
// ============================================================================

export const RESPONSE_PRESETS: ResponsePreset[] = [
  // --------------------------------------------------------------------------
  // MARKDOWN RICH - Universal preset for text responses
  // --------------------------------------------------------------------------
  {
    key: 'markdown_rich',
    name: 'Rich Markdown',
    description: 'Formatted text with explanations, lists, and inline references. Best for general questions and detailed explanations.',
    categories: ['*'], // Available for all data types
    responseSchema: {
      type: 'markdown_rich',
      properties: {
        text: {
          type: 'string',
          description: 'Markdown formatted response text',
        },
        documentReferences: {
          type: 'array',
          description: 'Document IDs mentioned in the response',
          items: { type: 'string', description: 'Document ID' },
        },
      },
      required: ['text'],
    },
    promptInstructions: `Use the "markdown_rich" preset when:
- Providing explanations, summaries, or general information
- Answering questions that don't focus on specific items
- Comparing items in narrative form
- The user asks "why", "how", or "explain"

Format guidelines:
- Use headers (##) for sections when appropriate
- Use bullet points for lists
- Use **bold** for emphasis on key points
- Keep paragraphs concise and scannable
- When mentioning specific items, include their document ID in documentReferences`,
  },

  // --------------------------------------------------------------------------
  // SINGLE CARD - Highlight one specific item
  // --------------------------------------------------------------------------
  {
    key: 'single_card',
    name: 'Single Item Card',
    description: 'Highlight one specific item with key points and AI commentary. Best for "tell me about X" or "which one is best" queries.',
    categories: ['fashion-products', 'ecommerce', 'products', 'articles', 'documents'],
    responseSchema: {
      type: 'single_card',
      properties: {
        documentId: {
          type: 'string',
          description: 'The document ID to highlight (MUST exist in search results)',
        },
        highlights: {
          type: 'array',
          description: '2-4 key points about this item that are relevant to the user query',
          items: { type: 'string', description: 'A highlight point' },
        },
        summary: {
          type: 'string',
          description: 'Brief AI commentary explaining why this item is relevant or recommended',
        },
      },
      required: ['documentId', 'highlights', 'summary'],
    },
    promptInstructions: `Use the "single_card" preset when:
- The user asks about a specific item ("tell me about the third one")
- One item clearly stands out as the answer ("which is the warmest?")
- The user wants a recommendation and one item is best
- Responding to "Ask AI" about a specific product

Guidelines:
- documentId MUST be an ID from the provided search results
- Include 2-4 highlights that directly address the user's question
- Keep the summary focused and actionable (1-2 sentences)
- Never invent or guess document IDs`,
  },

  // --------------------------------------------------------------------------
  // ITEM GRID - Show multiple items
  // --------------------------------------------------------------------------
  {
    key: 'item_grid',
    name: 'Item Grid',
    description: 'Display multiple items in a visual grid. Best for "show me top N", "find similar", or browsing queries.',
    categories: ['fashion-products', 'ecommerce', 'products', 'articles'],
    responseSchema: {
      type: 'item_grid',
      properties: {
        documentIds: {
          type: 'array',
          description: '2-6 document IDs to display in the grid (MUST exist in search results)',
          items: { type: 'string', description: 'Document ID' },
        },
        title: {
          type: 'string',
          description: 'Optional title for the grid (e.g., "Top Picks for Winter")',
        },
        summary: {
          type: 'string',
          description: 'Brief explanation of why these items were selected',
        },
      },
      required: ['documentIds', 'summary'],
    },
    promptInstructions: `Use the "item_grid" preset when:
- The user asks for multiple items ("show me top 3", "find similar items")
- Presenting options for the user to choose from
- The query implies browsing or exploration
- Multiple items equally answer the question

Guidelines:
- Include 2-6 document IDs (no more, no less)
- All IDs MUST exist in the provided search results
- Order items by relevance (most relevant first)
- The summary should explain your selection criteria
- Title is optional but helpful for context`,
  },

  // --------------------------------------------------------------------------
  // COMPARISON TABLE - Side-by-side comparison (future)
  // --------------------------------------------------------------------------
  {
    key: 'comparison_table',
    name: 'Comparison Table',
    description: 'Side-by-side comparison of items with specific attributes. Best for "compare X vs Y" queries.',
    categories: ['fashion-products', 'ecommerce', 'products'],
    responseSchema: {
      type: 'comparison_table',
      properties: {
        documentIds: {
          type: 'array',
          description: '2-4 document IDs to compare',
          items: { type: 'string', description: 'Document ID' },
        },
        comparisonPoints: {
          type: 'array',
          description: 'Aspects to compare with optional winners',
          items: {
            type: 'object',
            description: 'A comparison point',
            properties: {
              aspect: { type: 'string', description: 'What is being compared (e.g., "Price", "Warmth")' },
              winner: { type: 'string', description: 'Document ID of the winner for this aspect (optional)' },
              explanation: { type: 'string', description: 'Brief explanation of the comparison' },
            },
          },
        },
        recommendation: {
          type: 'string',
          description: 'Overall recommendation based on the comparison',
        },
      },
      required: ['documentIds', 'comparisonPoints', 'recommendation'],
    },
    promptInstructions: `Use the "comparison_table" preset when:
- The user explicitly asks to compare items ("compare X and Y")
- The user is deciding between specific options
- A structured comparison would be more helpful than prose

Guidelines:
- Compare 2-4 items maximum
- Include 3-5 meaningful comparison points
- Winner is optional (not every aspect has a clear winner)
- Provide a clear recommendation at the end
- All document IDs MUST exist in the search results`,
  },
];

// ============================================================================
// CATEGORY MAPPINGS
// ============================================================================

/**
 * Default presets for each data template category
 * Used when admin hasn't explicitly configured presets
 */
export const DEFAULT_PRESETS_BY_CATEGORY: Record<string, string[]> = {
  'fashion-products': ['markdown_rich', 'single_card', 'item_grid'],
  'ecommerce': ['markdown_rich', 'single_card', 'item_grid'],
  'products': ['markdown_rich', 'single_card', 'item_grid'],
  'articles': ['markdown_rich', 'single_card', 'item_grid'],
  'documents': ['markdown_rich', 'single_card'],
  'knowledge-base': ['markdown_rich'],
  '*': ['markdown_rich'], // Fallback for unknown categories
};

/**
 * All available preset keys
 */
export const ALL_PRESET_KEYS = RESPONSE_PRESETS.map(p => p.key);

/**
 * MVP presets - start with these for initial implementation
 */
export const MVP_PRESET_KEYS = ['markdown_rich', 'single_card', 'item_grid'];
