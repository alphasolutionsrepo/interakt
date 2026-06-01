// db/analytics-schema/index.ts

/**
 * Analytics Database Schema - Main Export
 *
 * This is a SEPARATE database from the main app database.
 * Used for analytics, usage tracking, and monitoring data.
 *
 * Drizzle config: drizzle.analytics.config.ts
 * Migrations: db/drizzle-analytics/
 */

// ============================================================================
// EXPORT ALL SCHEMAS
// ============================================================================

// AI Usage Analytics
export * from './ai-usage-analytics.schema';

// Search Analytics
export * from './search-analytics.schema';

// Admin Chat Sessions
export * from './admin-chat-sessions.schema';

// OpenTelemetry Spans
export * from './otel-spans.schema';

// Analytics Insights (pre-computed)
export * from './analytics-insights.schema';

// Import for schema object
import {
  aiUsageEvents,
  aiUsageSummary,
  providerHealth,
} from './ai-usage-analytics.schema';

import {
  analyticsSessions,
  searchEvents,
  searchResultClicks,
  aiToolExecutions,
  chatSessionAnalytics,
  popularQueries,
  zeroResultQueries,
  searchSummary,
} from './search-analytics.schema';

import { adminChatSessions } from './admin-chat-sessions.schema';

import { otelSpans } from './otel-spans.schema';

import {
  analyticsInsights,
  analyticsProcessingRuns,
} from './analytics-insights.schema';

// ============================================================================
// SCHEMA OBJECT FOR DRIZZLE
// ============================================================================

/**
 * Complete analytics schema object
 * Used by Drizzle for migrations and queries
 */
export const analyticsSchema = {
  // AI Usage (existing)
  aiUsageEvents,
  aiUsageSummary,
  providerHealth,

  // Search Analytics (new)
  analyticsSessions,
  searchEvents,
  searchResultClicks,
  aiToolExecutions,
  chatSessionAnalytics,
  popularQueries,
  zeroResultQueries,
  searchSummary,

  // Admin Chat Sessions
  adminChatSessions,

  // OpenTelemetry Spans
  otelSpans,

  // Analytics Insights (pre-computed)
  analyticsInsights,
  analyticsProcessingRuns,
};
