// db/analytics-schema/search-analytics.schema.ts

/**
 * SEARCH ANALYTICS SCHEMA
 * ------------------------------------------------------------------------
 * Tracks all search operations, sessions, tool executions, and clicks
 * for analytics, business intelligence, and AI-powered insights.
 *
 * DATABASE: Analytics DB (separate from main app DB)
 * CONFIG: drizzle.analytics.config.ts
 * ------------------------------------------------------------------------
 */

import {
  pgTable,
  varchar,
  timestamp,
  json,
  uuid,
  boolean,
  integer,
  text,
  real,
  index,
  unique,
} from 'drizzle-orm/pg-core';
import { InferSelectModel, InferInsertModel } from 'drizzle-orm';

// ============================================================================
// ANALYTICS SESSIONS TABLE
// ============================================================================

/**
 * Analytics Sessions
 * Links all events to a browsing/chat session for journey analysis
 */
export const analyticsSessions = pgTable(
  'analytics_sessions',
  {
    id: uuid('id').primaryKey().notNull().defaultRandom(),

    // External linking (from frontend)
    externalSessionId: varchar('external_session_id', { length: 255 }).notNull(),

    // Context
    experienceId: uuid('experience_id'),
    experienceSlug: varchar('experience_slug', { length: 255 }),

    // Source context
    source: varchar('source', { length: 20 }).notNull().default('api'), // 'api', 'playground', 'admin_test'

    // Session classification
    sessionType: varchar('session_type', { length: 20 }).notNull().default('search_only'), // 'search_only', 'chat', 'mixed'

    // Lifecycle
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    lastActivityAt: timestamp('last_activity_at', { withTimezone: true }).notNull().defaultNow(),

    // Client info
    originDomain: varchar('origin_domain', { length: 255 }),
    userAgent: text('user_agent'),
    ipHash: varchar('ip_hash', { length: 64 }), // Hashed for privacy

    // Aggregated counts (updated as events occur)
    totalSearches: integer('total_searches').default(0),
    totalAiRequests: integer('total_ai_requests').default(0),
    totalToolExecutions: integer('total_tool_executions').default(0),

    // Outcome tracking (for future conversion funnels)
    outcomeAchieved: boolean('outcome_achieved').default(false),
    outcomeType: varchar('outcome_type', { length: 50 }), // 'purchase', 'info_found', etc.

    // Timestamps
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    externalSessionIdx: index('idx_analytics_sessions_external').on(table.externalSessionId),
    experienceIdIdx: index('idx_analytics_sessions_experience').on(table.experienceId),
    startedAtIdx: index('idx_analytics_sessions_started').on(table.startedAt),
    sessionTypeIdx: index('idx_analytics_sessions_type').on(table.sessionType),
    lastActivityIdx: index('idx_analytics_sessions_last_activity').on(table.lastActivityAt),
  })
);

export type AnalyticsSession = InferSelectModel<typeof analyticsSessions>;
export type InsertAnalyticsSession = InferInsertModel<typeof analyticsSessions>;

// ============================================================================
// SEARCH EVENTS TABLE
// ============================================================================

/**
 * Search Events
 * Records every search operation with full context
 */
export const searchEvents = pgTable(
  'search_events',
  {
    id: uuid('id').primaryKey().notNull().defaultRandom(),
    requestId: uuid('request_id').notNull(),

    // Session linking
    sessionId: uuid('session_id'), // May be null if no session tracking

    timestamp: timestamp('timestamp', { withTimezone: true }).notNull().defaultNow(),

    // Source context - WHERE the request originated
    source: varchar('source', { length: 20 }).notNull().default('api'), // 'api', 'playground', 'admin_test'

    // Trigger context - KEY FOR DISTINGUISHING USER VS AI
    triggerType: varchar('trigger_type', { length: 20 }).notNull(), // 'user', 'ai_tool', 'ai_rag', 'system'
    triggerSourceId: varchar('trigger_source_id', { length: 255 }), // chat_message_id if AI-triggered
    aiRequestId: uuid('ai_request_id'), // FK to ai_usage_events if AI-triggered

    // Search configuration
    searchType: varchar('search_type', { length: 20 }).notNull(), // 'lexical', 'semantic', 'hybrid'
    indexIds: json('index_ids').$type<string[]>().notNull(),
    experienceId: uuid('experience_id'),
    experienceSlug: varchar('experience_slug', { length: 255 }),

    // Query analysis
    queryText: text('query_text').notNull(),
    queryNormalized: text('query_normalized').notNull(), // lowercase, trimmed
    queryLength: integer('query_length').notNull(),
    queryWordCount: integer('query_word_count').notNull(),
    queryLanguage: varchar('query_language', { length: 10 }), // Detected language

    // Filters & Facets
    hasFilters: boolean('has_filters').default(false),
    filterFields: json('filter_fields').$type<string[]>(),
    filterCount: integer('filter_count').default(0),
    facetsRequested: json('facets_requested').$type<string[]>(),

    // Results
    totalResults: integer('total_results').notNull(),
    resultsReturned: integer('results_returned').notNull(),
    pageNumber: integer('page_number').default(1),
    isZeroResult: boolean('is_zero_result').default(false),
    topResultScore: real('top_result_score'),

    // Performance
    durationMs: integer('duration_ms').notNull(),
    esTookMs: integer('es_took_ms'), // Elasticsearch query time
    embeddingDurationMs: integer('embedding_duration_ms'), // For semantic/hybrid

    // Status
    success: boolean('success').notNull(),
    errorCode: varchar('error_code', { length: 50 }),
    errorMessage: text('error_message'),

    // Extensible metadata
    metadata: json('metadata').$type<Record<string, unknown>>(),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    timestampIdx: index('idx_search_events_timestamp').on(table.timestamp),
    sessionIdIdx: index('idx_search_events_session').on(table.sessionId),
    sourceIdx: index('idx_search_events_source').on(table.source),
    triggerTypeIdx: index('idx_search_events_trigger').on(table.triggerType),
    searchTypeIdx: index('idx_search_events_search_type').on(table.searchType),
    experienceIdIdx: index('idx_search_events_experience').on(table.experienceId),
    isZeroResultIdx: index('idx_search_events_zero_result').on(table.isZeroResult),
    queryNormalizedIdx: index('idx_search_events_query_normalized').on(table.queryNormalized),

    // Composite indexes for common queries
    timestampTriggerIdx: index('idx_search_events_timestamp_trigger').on(
      table.timestamp,
      table.triggerType
    ),
    experienceTimestampIdx: index('idx_search_events_experience_timestamp').on(
      table.experienceId,
      table.timestamp
    ),
  })
);

export type SearchEvent = InferSelectModel<typeof searchEvents>;
export type InsertSearchEvent = InferInsertModel<typeof searchEvents>;

// ============================================================================
// SEARCH RESULT CLICKS TABLE
// ============================================================================

/**
 * Search Result Clicks
 * For click-through tracking (frontend integration ready)
 */
export const searchResultClicks = pgTable(
  'search_result_clicks',
  {
    id: uuid('id').primaryKey().notNull().defaultRandom(),

    searchEventId: uuid('search_event_id').notNull(),
    sessionId: uuid('session_id'),

    timestamp: timestamp('timestamp', { withTimezone: true }).notNull().defaultNow(),

    // Click details
    resultPosition: integer('result_position').notNull(), // 1-indexed
    documentId: varchar('document_id', { length: 255 }).notNull(),

    // Interaction type
    interactionType: varchar('interaction_type', { length: 20 }).notNull(), // 'click', 'preview', 'add_to_context'

    // Engagement (if trackable)
    dwellTimeMs: integer('dwell_time_ms'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    searchEventIdIdx: index('idx_clicks_search_event').on(table.searchEventId),
    sessionIdIdx: index('idx_clicks_session').on(table.sessionId),
    timestampIdx: index('idx_clicks_timestamp').on(table.timestamp),
    documentIdIdx: index('idx_clicks_document').on(table.documentId),
  })
);

export type SearchResultClick = InferSelectModel<typeof searchResultClicks>;
export type InsertSearchResultClick = InferInsertModel<typeof searchResultClicks>;

// ============================================================================
// AI TOOL EXECUTIONS TABLE
// ============================================================================

/**
 * AI Tool Executions
 * Track AI tool usage (search now, cart/checkout later)
 */
export const aiToolExecutions = pgTable(
  'ai_tool_executions',
  {
    id: uuid('id').primaryKey().notNull().defaultRandom(),

    // Links
    aiRequestId: uuid('ai_request_id').notNull(), // FK to ai_usage_events
    sessionId: uuid('session_id'),

    timestamp: timestamp('timestamp', { withTimezone: true }).notNull().defaultNow(),

    // Tool identification
    toolName: varchar('tool_name', { length: 100 }).notNull(), // 'search', 'filter_search', 'add_to_cart', etc.
    toolCategory: varchar('tool_category', { length: 50 }).notNull(), // 'retrieval', 'action', 'navigation'
    toolVersion: varchar('tool_version', { length: 20 }).default('1.0'),

    // Execution details
    inputSummary: json('input_summary').$type<Record<string, unknown>>(), // Sanitized input
    outputSummary: json('output_summary').$type<Record<string, unknown>>(), // Sanitized output

    // Performance
    durationMs: integer('duration_ms').notNull(),

    // Status
    success: boolean('success').notNull(),
    errorCode: varchar('error_code', { length: 50 }),
    errorMessage: text('error_message'),

    // Linked events (for cross-referencing)
    searchEventId: uuid('search_event_id'), // If tool was search
    actionEventId: uuid('action_event_id'), // Future: for cart/checkout actions

    metadata: json('metadata').$type<Record<string, unknown>>(),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    aiRequestIdIdx: index('idx_tool_exec_ai_request').on(table.aiRequestId),
    sessionIdIdx: index('idx_tool_exec_session').on(table.sessionId),
    timestampIdx: index('idx_tool_exec_timestamp').on(table.timestamp),
    toolNameIdx: index('idx_tool_exec_tool_name').on(table.toolName),
    toolCategoryIdx: index('idx_tool_exec_category').on(table.toolCategory),
    searchEventIdIdx: index('idx_tool_exec_search_event').on(table.searchEventId),
  })
);

export type AIToolExecution = InferSelectModel<typeof aiToolExecutions>;
export type InsertAIToolExecution = InferInsertModel<typeof aiToolExecutions>;

// ============================================================================
// CHAT SESSION ANALYTICS TABLE
// ============================================================================

/**
 * Chat Session Analytics
 * Aggregated metrics per chat session
 */
export const chatSessionAnalytics = pgTable(
  'chat_session_analytics',
  {
    id: uuid('id').primaryKey().notNull().defaultRandom(),

    // Links
    chatSessionId: varchar('chat_session_id', { length: 255 }).notNull().unique(),
    analyticsSessionId: uuid('analytics_session_id'),
    experienceId: uuid('experience_id'),

    // Lifecycle
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    endReason: varchar('end_reason', { length: 20 }), // 'user_ended', 'timeout', 'error', 'converted'
    durationSeconds: integer('duration_seconds'),

    // Conversation metrics
    totalMessages: integer('total_messages').default(0),
    userMessagesCount: integer('user_messages_count').default(0),
    assistantMessagesCount: integer('assistant_messages_count').default(0),
    avgUserMessageLength: real('avg_user_message_length'),
    avgResponseTimeMs: real('avg_response_time_ms'),

    // Tool usage
    totalToolCalls: integer('total_tool_calls').default(0),
    uniqueToolsUsed: json('unique_tools_used').$type<string[]>(),
    toolCallsBreakdown: json('tool_calls_breakdown').$type<Record<string, number>>(),

    // AI costs
    totalTokensUsed: integer('total_tokens_used').default(0),
    totalInputTokens: integer('total_input_tokens').default(0),
    totalOutputTokens: integer('total_output_tokens').default(0),
    estimatedCostUsd: real('estimated_cost_usd'),

    // Outcomes
    searchesPerformed: integer('searches_performed').default(0),
    actionsCompleted: integer('actions_completed').default(0), // Future
    outcomeAchieved: boolean('outcome_achieved').default(false),
    outcomeType: varchar('outcome_type', { length: 50 }),

    metadata: json('metadata').$type<Record<string, unknown>>(),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    chatSessionIdIdx: index('idx_chat_analytics_chat_session').on(table.chatSessionId),
    analyticsSessionIdIdx: index('idx_chat_analytics_analytics_session').on(
      table.analyticsSessionId
    ),
    experienceIdIdx: index('idx_chat_analytics_experience').on(table.experienceId),
    startedAtIdx: index('idx_chat_analytics_started').on(table.startedAt),
    endReasonIdx: index('idx_chat_analytics_end_reason').on(table.endReason),
  })
);

export type ChatSessionAnalytics = InferSelectModel<typeof chatSessionAnalytics>;
export type InsertChatSessionAnalytics = InferInsertModel<typeof chatSessionAnalytics>;

// ============================================================================
// POPULAR QUERIES TABLE
// ============================================================================

/**
 * Popular Queries
 * Daily aggregation of search queries
 */
export const popularQueries = pgTable(
  'popular_queries',
  {
    id: uuid('id').primaryKey().notNull().defaultRandom(),

    date: timestamp('date', { withTimezone: true }).notNull(),
    experienceId: uuid('experience_id'),

    queryNormalized: text('query_normalized').notNull(),

    // Metrics
    searchCount: integer('search_count').notNull(),
    zeroResultCount: integer('zero_result_count').default(0),
    avgResultsCount: real('avg_results_count'),
    clickThroughRate: real('click_through_rate'), // If tracking clicks

    // Trend (compared to previous period)
    trendDirection: varchar('trend_direction', { length: 10 }), // 'up', 'down', 'stable'
    trendPercent: real('trend_percent'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    dateIdx: index('idx_popular_queries_date').on(table.date),
    experienceIdIdx: index('idx_popular_queries_experience').on(table.experienceId),
    searchCountIdx: index('idx_popular_queries_count').on(table.searchCount),
    dateExperienceIdx: index('idx_popular_queries_date_experience').on(
      table.date,
      table.experienceId
    ),
    uniqueDateExperienceQuery: unique('unique_popular_query').on(
      table.date,
      table.experienceId,
      table.queryNormalized
    ),
  })
);

export type PopularQuery = InferSelectModel<typeof popularQueries>;
export type InsertPopularQuery = InferInsertModel<typeof popularQueries>;

// ============================================================================
// ZERO RESULT QUERIES TABLE
// ============================================================================

/**
 * Zero Result Queries
 * Content gap tracking for business intelligence
 */
export const zeroResultQueries = pgTable(
  'zero_result_queries',
  {
    id: uuid('id').primaryKey().notNull().defaultRandom(),

    queryNormalized: text('query_normalized').notNull().unique(),

    // Occurrence tracking
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull(),
    occurrenceCount: integer('occurrence_count').notNull().default(1),

    // Context
    experienceIds: json('experience_ids').$type<string[]>(), // Where it failed
    sampleQueries: json('sample_queries').$type<string[]>(), // Original queries (for case variations)

    // Admin review
    status: varchar('status', { length: 20 }).default('unreviewed'), // 'unreviewed', 'content_gap', 'irrelevant', 'fixed'
    notes: text('notes'),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    reviewedBy: varchar('reviewed_by', { length: 255 }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    statusIdx: index('idx_zero_result_status').on(table.status),
    occurrenceCountIdx: index('idx_zero_result_occurrence').on(table.occurrenceCount),
    lastSeenAtIdx: index('idx_zero_result_last_seen').on(table.lastSeenAt),
  })
);

export type ZeroResultQuery = InferSelectModel<typeof zeroResultQueries>;
export type InsertZeroResultQuery = InferInsertModel<typeof zeroResultQueries>;

// ============================================================================
// SEARCH SUMMARY TABLE
// ============================================================================

/**
 * Search Summary
 * Pre-aggregated search metrics for fast dashboard queries
 */
export const searchSummary = pgTable(
  'search_summary',
  {
    id: uuid('id').primaryKey().notNull().defaultRandom(),

    // Time bucketing
    timeBucket: timestamp('time_bucket', { withTimezone: true }).notNull(),
    granularity: varchar('granularity', { length: 20 }).notNull(), // 'hour', 'day', 'week', 'month'

    // Dimensions
    experienceId: uuid('experience_id'),
    indexId: uuid('index_id'),
    searchType: varchar('search_type', { length: 20 }),
    triggerType: varchar('trigger_type', { length: 20 }),

    // Counts
    totalSearches: integer('total_searches').notNull().default(0),
    uniqueQueries: integer('unique_queries').default(0),
    zeroResultCount: integer('zero_result_count').default(0),
    zeroResultRate: real('zero_result_rate'),

    // Performance
    avgDurationMs: real('avg_duration_ms'),
    p50DurationMs: integer('p50_duration_ms'),
    p95DurationMs: integer('p95_duration_ms'),
    p99DurationMs: integer('p99_duration_ms'),

    // Results
    avgResultsCount: real('avg_results_count'),

    // Filter usage
    searchesWithFilters: integer('searches_with_filters').default(0),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    timeBucketIdx: index('idx_search_summary_time_bucket').on(table.timeBucket),
    granularityIdx: index('idx_search_summary_granularity').on(table.granularity),
    experienceIdIdx: index('idx_search_summary_experience').on(table.experienceId),
    searchTypeIdx: index('idx_search_summary_search_type').on(table.searchType),
    triggerTypeIdx: index('idx_search_summary_trigger_type').on(table.triggerType),

    // Composite for dashboard queries
    timeBucketGranularityIdx: index('idx_search_summary_time_gran').on(
      table.timeBucket,
      table.granularity
    ),
    uniqueSummary: unique('unique_search_summary').on(
      table.timeBucket,
      table.granularity,
      table.experienceId,
      table.indexId,
      table.searchType,
      table.triggerType
    ),
  })
);

export type SearchSummary = InferSelectModel<typeof searchSummary>;
export type InsertSearchSummary = InferInsertModel<typeof searchSummary>;
