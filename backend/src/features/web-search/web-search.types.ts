// src/features/web-search/web-search.types.ts

/**
 * Web Search Types
 *
 * Types for the web search abstraction layer.
 * Currently backed by Tavily AI Search.
 */

// ============================================================================
// WEB SEARCH
// ============================================================================

/**
 * A single web search result.
 */
export interface WebSearchResult {
  /** Page title */
  title: string;
  /** Source URL */
  url: string;
  /** Content snippet */
  content: string;
  /** Relevance score (0-1) */
  score: number;
}

/**
 * Web search response from the search provider.
 */
export interface WebSearchResponse {
  /** Search results */
  results: WebSearchResult[];
  /** AI-generated answer (if requested) */
  answer?: string;
  /** Response time in milliseconds */
  responseTimeMs: number;
}

/**
 * Options for web search requests.
 */
export interface WebSearchOptions {
  /** Maximum number of results to return (default: 3) */
  maxResults?: number;
  /** Search depth: 'basic' is faster, 'advanced' is more thorough (default: 'basic') */
  searchDepth?: 'basic' | 'advanced';
  /** Whether to include an AI-generated answer (default: false) */
  includeAnswer?: boolean;
  /** Domains to exclude from results */
  excludeDomains?: string[];
}

// ============================================================================
// SAFETY CLASSIFICATION
// ============================================================================

/**
 * Categories of unsafe content.
 */
export type SafetyCategory =
  | 'illegal_activity'
  | 'violence_harm'
  | 'hate_speech'
  | 'adult_content'
  | 'pii_request'
  | 'self_harm'
  | 'dangerous_instructions'
  | 'fraud_deception';

/**
 * Result of safety classification.
 */
export interface SafetyClassification {
  /** Whether the query is safe to search */
  safe: boolean;
  /** Category of unsafe content (if unsafe) */
  category?: SafetyCategory;
  /** Reason for classification */
  reason: string;
}
