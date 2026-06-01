// src/features/analytics/analytics.types.ts

/**
 * Analytics Types
 *
 * Type definitions for analytics events and tracking data.
 * These types define the structure of data collected for analytics.
 */

// ============================================================================
// ENUMS & CONSTANTS
// ============================================================================

/**
 * How a search was triggered
 */
export type TriggerType = 'user' | 'ai_tool' | 'ai_rag' | 'system';

/**
 * Search algorithm type
 */
export type SearchType = 'lexical' | 'semantic' | 'hybrid';

/**
 * AI operation type
 */
export type AIOperation = 'text' | 'chat' | 'embedding';

/**
 * AI feature context
 */
export type AIFeature =
  | 'chat'
  | 'summarize'
  | 'search_embedding'
  | 'reindex_embedding'
  | 'autocomplete'
  | 'api';

/**
 * Tool category for AI tool executions
 */
export type ToolCategory = 'retrieval' | 'action' | 'navigation';

/**
 * Click/interaction type
 */
export type InteractionType = 'click' | 'preview' | 'add_to_context';

/**
 * Session type classification
 */
export type SessionType = 'search_only' | 'chat' | 'mixed';

/**
 * Source of the analytics event — where the request originated
 */
export type AnalyticsSource = 'api' | 'playground' | 'admin_test';

// ============================================================================
// SEARCH EVENT DATA
// ============================================================================

/**
 * Data for tracking a search event
 */
export interface SearchEventData {
  // Request identification
  requestId: string;

  // Session linking (optional - frontend provides)
  sessionId?: string;

  // Source context — where the request originated
  source?: AnalyticsSource;

  // Trigger context
  triggerType: TriggerType;
  triggerSourceId?: string; // e.g., chat message ID if AI-triggered
  aiRequestId?: string; // Link to AI request if triggered by AI

  // Search configuration
  searchType: SearchType;
  indexIds: string[];
  experienceId?: string;
  experienceSlug?: string;

  // Query details
  queryText: string;
  queryLanguage?: string;

  // Filters & facets
  hasFilters?: boolean;
  filterFields?: string[];
  filterCount?: number;
  facetsRequested?: string[];

  // Results
  totalResults: number;
  resultsReturned: number;
  pageNumber?: number;
  topResultScore?: number;

  // Performance
  durationMs: number;
  esTookMs?: number;
  embeddingDurationMs?: number;

  // Status
  success: boolean;
  errorCode?: string;
  errorMessage?: string;

  // Additional metadata
  metadata?: Record<string, unknown>;
}

// ============================================================================
// AI EVENT DATA
// ============================================================================

/**
 * Data for tracking an AI operation
 */
export interface AIEventData {
  // Request identification
  requestId: string;

  // Session linking
  sessionId?: string;
  chatSessionId?: string;

  // Source context — where the request originated
  source?: AnalyticsSource;

  // Operation details
  operation: AIOperation;
  feature?: AIFeature;

  // Provider & model
  providerId: string;
  providerKey: string;
  modelId?: number;
  modelKey: string;

  // Token usage
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;

  // Performance
  durationMs: number;
  timeToFirstToken?: number; // For streaming

  // Status
  success: boolean;
  errorCode?: string;
  errorMessage?: string;

  // Context (for chat/summarization)
  messageCount?: number;
  contextDocumentsCount?: number;
  hasCustomInstructions?: boolean;

  // Tool usage
  toolsAvailable?: string[];
  toolsCalled?: string[];
  toolCallsCount?: number;

  // Embedding specific
  embeddingDimensions?: number;
  batchSize?: number;

  // Additional metadata
  metadata?: Record<string, unknown>;
}

// ============================================================================
// TOOL EXECUTION DATA
// ============================================================================

/**
 * Data for tracking AI tool execution
 */
export interface ToolExecutionData {
  // Request identification
  id?: string;

  // Links
  aiRequestId: string;
  sessionId?: string;

  // Tool identification
  toolName: string;
  toolCategory: ToolCategory;
  toolVersion?: string;

  // Execution details
  inputSummary?: Record<string, unknown>;
  outputSummary?: Record<string, unknown>;

  // Performance
  durationMs: number;

  // Status
  success: boolean;
  errorCode?: string;
  errorMessage?: string;

  // Linked events
  searchEventId?: string; // If tool was search
  actionEventId?: string; // Future: for cart/checkout actions

  // Additional metadata
  metadata?: Record<string, unknown>;
}

// ============================================================================
// CLICK EVENT DATA
// ============================================================================

/**
 * Data for tracking search result clicks
 */
export interface ClickEventData {
  // Links
  searchEventId: string;
  sessionId?: string;

  // Click details
  resultPosition: number; // 1-indexed
  documentId: string;
  interactionType: InteractionType;

  // Engagement
  dwellTimeMs?: number;

  // Additional metadata
  metadata?: Record<string, unknown>;
}

// ============================================================================
// SESSION DATA
// ============================================================================

/**
 * Data for analytics session
 */
export interface SessionData {
  // External linking
  externalSessionId: string;

  // Context
  experienceId?: string;
  experienceSlug?: string;

  // Session classification
  sessionType: SessionType;

  // Client info
  originDomain?: string;
  userAgent?: string;
  ipHash?: string;
}

// ============================================================================
// INTERNAL QUEUE TYPES
// ============================================================================

/**
 * Internal type for queued search events
 */
export interface QueuedSearchEvent extends SearchEventData {
  id: string;
  timestamp: Date;
  queryNormalized: string;
  queryLength: number;
  queryWordCount: number;
  isZeroResult: boolean;
}

/**
 * Internal type for queued AI events
 */
export interface QueuedAIEvent extends AIEventData {
  id: string;
  timestamp: Date;
  estimatedCostUsd: number | null;
}

/**
 * Internal type for queued tool events
 */
export interface QueuedToolEvent extends ToolExecutionData {
  id: string;
  timestamp: Date;
}

/**
 * Internal type for queued click events
 */
export interface QueuedClickEvent extends ClickEventData {
  id: string;
  timestamp: Date;
}

// ============================================================================
// COLLECTOR CONFIGURATION
// ============================================================================

/**
 * Configuration for the analytics collector
 */
export interface AnalyticsCollectorConfig {
  /** Batch size before auto-flush */
  batchSize: number;
  /** Flush interval in milliseconds */
  flushIntervalMs: number;
  /** Whether analytics is enabled */
  enabled: boolean;
  /** Whether to log queue stats */
  logStats: boolean;
}

/**
 * Queue statistics for monitoring
 */
export interface QueueStats {
  searchEvents: number;
  aiEvents: number;
  toolEvents: number;
  clickEvents: number;
  totalPending: number;
  lastFlushAt: Date | null;
  flushCount: number;
  failedFlushCount: number;
}
