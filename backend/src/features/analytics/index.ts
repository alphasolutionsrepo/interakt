// src/features/analytics/index.ts

/**
 * Analytics Feature - Main Export
 *
 * Provides non-blocking analytics tracking for search and AI operations.
 *
 * USAGE:
 * ```typescript
 * import { trackSearch, trackAI, startAnalyticsCollector } from '@/features/analytics';
 *
 * // Start the collector on app init
 * startAnalyticsCollector();
 *
 * // Track events (fire-and-forget, never blocks)
 * trackSearch({ ... });
 * trackAI({ ... });
 * ```
 */

// ============================================================================
// TRACKING FUNCTIONS (Fire-and-Forget)
// ============================================================================

export {
  trackSearch,
  trackAI,
  trackToolExecution,
  trackClick,
} from './analytics-collector';

// ============================================================================
// LIFECYCLE MANAGEMENT
// ============================================================================

export {
  startAnalyticsCollector,
  stopAnalyticsCollector,
  isCollectorRunning,
  forceFlush,
} from './analytics-collector';

// ============================================================================
// MONITORING & CONFIGURATION
// ============================================================================

export {
  getQueueStats,
  getConfig,
  updateConfig,
  clearQueues,
} from './analytics-collector';

// ============================================================================
// QUERY SERVICE (Dashboard & API)
// ============================================================================

export {
  // Overview
  getOverviewMetrics,
  getSearchTrends,
  getPopularQueries,
  getZeroResultQueries,
  getSearchTypeBreakdown,
  getPerformanceMetrics,

  // AI & Tools (used by dashboard, not chat tools)
  getAIUsageMetrics,
  getToolUsageMetrics,

  // Recent events
  getRecentSearchEvents,
  getQuerySearchEvents,

  // Helpers
  getDateRange,
  getGranularityForRange,
} from './analytics-query.service';

export type {
  TimeRange,
  Granularity,
  DateRange,
  OverviewMetrics,
  SearchTrendPoint,
  PopularQueryResult,
  ZeroResultQueryResult,
  SearchTypeBreakdown,
  PerformanceMetrics,
  AIUsageMetrics,
  ToolUsageMetrics,
} from './analytics-query.service';

// ============================================================================
// AI TOOLS (for Analytics Chat)
// ============================================================================

export {
  analyticsToolDefinitions,
  executeAnalyticsTool,
} from './analytics-ai-tools';

export type { ToolExecutionResult } from './analytics-ai-tools';

// ============================================================================
// FEATURE FLAGS & CONFIGURATION
// ============================================================================

export {
  // Initialization
  initializeAnalyticsConfig,
  getAnalyticsConfig,
  getAnalyticsStatus,

  // Feature flag helpers
  analyticsFlags,
  isFeatureEnabled,

  // Runtime overrides
  setRuntimeOverride,
  clearRuntimeOverride,
  clearAllRuntimeOverrides,

  // Experience-specific overrides
  setExperienceOverride,
  clearExperienceOverride,

  // Bulk enable/disable
  enableUserTracking,
  disableUserTracking,
  disableAllAnalytics,
  enableAllAnalytics,

  // Admin API
  updateAnalyticsConfig,
} from './analytics-config';

export type { AnalyticsFeatureFlags, AnalyticsConfigOverrides } from './analytics-config';

// ============================================================================
// SESSION TRACKING
// ============================================================================

export {
  getOrCreateSession,
  updateSessionCounters,
  endSession,
  hashIP,
  generateSessionId,
  clearSessionCache,
  getSessionCacheStats,
} from './analytics-session.service';

export type { SessionInfo, SessionUpdateData } from './analytics-session.service';

// ============================================================================
// COST CALCULATION
// ============================================================================

export {
  calculateCost,
  calculateTotalCost,
  calculateBatchCosts,
  calculateBatchTotalCost,
  getModelPricing,
  refreshPricingCache,
  forceRefreshCache,
  getCacheStats as getCostCacheStats,
} from './analytics-cost.service';

export type { ModelPricing, CostEstimate } from './analytics-cost.service';

// ============================================================================
// ADMIN CHAT SESSIONS
// ============================================================================

export {
  createSession as createAdminChatSession,
  getSession as getAdminChatSession,
  listSessions as listAdminChatSessions,
  updateSession as updateAdminChatSession,
  addMessages as addAdminChatMessages,
  deleteSession as deleteAdminChatSession,
  getSessionCount as getAdminChatSessionCount,
} from './admin-chat-session.service';

export type {
  CreateSessionInput as CreateAdminChatSessionInput,
  UpdateSessionInput as UpdateAdminChatSessionInput,
  ListSessionsOptions as ListAdminChatSessionsOptions,
  AdminChatSession,
  AdminChatMessage,
  AdminChatAnalyticsData,
  AdminChatSessionSummary,
} from './admin-chat-session.service';

// ============================================================================
// TYPES
// ============================================================================

export type {
  // Event data types
  SearchEventData,
  AIEventData,
  ToolExecutionData,
  ClickEventData,
  SessionData,

  // Enum types
  TriggerType,
  SearchType,
  AIOperation,
  AIFeature,
  ToolCategory,
  InteractionType,
  SessionType,

  // Configuration types
  AnalyticsCollectorConfig,
  QueueStats,
} from './analytics.types';

// ============================================================================
// ANALYTICS PROCESSING (Pre-computed Insights)
// ============================================================================

export {
  runAnalyticsProcessing,
  getProcessingStatus,
} from './analytics-processing.service';

export type {
  ProcessingOptions,
  ProcessingResult,
} from './analytics-processing.service';

// ============================================================================
// CONVERSATION ANALYTICS
// ============================================================================

export {
  getConversationMetrics,
  getRetryAnalysis,
  getConversationDetail,
} from './conversation-analytics.service';

export type {
  ConversationMetrics,
  RetryAnalysis,
  ConversationDetail,
} from './conversation-analytics.service';
