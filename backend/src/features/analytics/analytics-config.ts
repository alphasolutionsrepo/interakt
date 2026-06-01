// src/features/analytics/analytics-config.ts

/**
 * Analytics Feature Flags & Configuration
 *
 * Controls what analytics data is collected. Designed for:
 * 1. Testing - easily turn features on/off during development
 * 2. Privacy - disable user-facing tracking if needed
 * 3. Performance - disable expensive tracking in high-load scenarios
 *
 * Configuration Hierarchy:
 * - Environment variables (highest priority, global)
 * - Database settings (per-experience or system-wide)
 * - Runtime overrides (for testing)
 */

import { createLogger } from '@/shared/logger/logger';

const logger = createLogger('analytics-config');

// ============================================================================
// TYPES
// ============================================================================

export interface AnalyticsFeatureFlags {
  // Master switch - if false, no analytics collected at all
  enabled: boolean;

  // Core tracking (internal, no user consent needed)
  trackSearchEvents: boolean; // Search queries, results, performance
  trackAIUsage: boolean; // Token usage, costs, performance
  trackToolExecutions: boolean; // AI tool calls (search, etc.)
  trackErrors: boolean; // Error events for debugging

  // User-facing tracking (may require consent)
  trackSessions: boolean; // Session linking across events
  trackClicks: boolean; // Click-through on search results
  trackUserAgent: boolean; // Browser/device info
  trackIPHash: boolean; // Hashed IP for geo (privacy-safe)

  // Advanced features
  enableRealTimeFeed: boolean; // Live search feed on dashboard
  enableAggregationJobs: boolean; // Background pre-computation
  enableAnalyticsChat: boolean; // AI-powered analytics queries

  // Privacy
  redactUserMessages: boolean; // Redact user messages in conversation analytics

}

// Separate interface for non-boolean analytics settings
export interface AnalyticsSettings {
  analyticsChatWindowSize: number;
  analyticsChatSummaryThreshold: number;
}

export interface AnalyticsConfigOverrides {
  // Per-experience overrides (from database)
  experienceOverrides?: Map<string, Partial<AnalyticsFeatureFlags>>;

  // Runtime overrides (for testing)
  runtimeOverrides?: Partial<AnalyticsFeatureFlags>;
}

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

const DEFAULT_FLAGS: AnalyticsFeatureFlags = {
  // Master switch
  enabled: true,

  // Core tracking - ON by default (internal analytics)
  trackSearchEvents: true,
  trackAIUsage: true,
  trackToolExecutions: true,
  trackErrors: true,

  // User-facing tracking - OFF by default (needs explicit opt-in)
  trackSessions: false,
  trackClicks: false,
  trackUserAgent: false,
  trackIPHash: false,

  // Advanced features - ON by default
  enableRealTimeFeed: true,
  enableAggregationJobs: true,
  enableAnalyticsChat: true,

  // Privacy - OFF by default (admin-only interface, messages visible)
  redactUserMessages: false,

};

const ANALYTICS_SETTINGS: AnalyticsSettings = {
  analyticsChatWindowSize: 5,
  analyticsChatSummaryThreshold: 10,
};

// ============================================================================
// CONFIGURATION STATE
// ============================================================================

let currentConfig: AnalyticsFeatureFlags = { ...DEFAULT_FLAGS };
const configOverrides: AnalyticsConfigOverrides = {};
let configInitialized = false;

// ============================================================================
// ENVIRONMENT VARIABLE PARSING
// ============================================================================

function parseEnvFlags(): Partial<AnalyticsFeatureFlags> {
  const flags: Partial<AnalyticsFeatureFlags> = {};

  // Master switch
  if (process.env.ENABLE_ANALYTICS !== undefined) {
    flags.enabled = process.env.ENABLE_ANALYTICS === 'true';
  }

  // Core tracking
  if (process.env.ANALYTICS_TRACK_SEARCH !== undefined) {
    flags.trackSearchEvents = process.env.ANALYTICS_TRACK_SEARCH === 'true';
  }
  if (process.env.ANALYTICS_TRACK_AI !== undefined) {
    flags.trackAIUsage = process.env.ANALYTICS_TRACK_AI === 'true';
  }
  if (process.env.ANALYTICS_TRACK_TOOLS !== undefined) {
    flags.trackToolExecutions = process.env.ANALYTICS_TRACK_TOOLS === 'true';
  }
  if (process.env.ANALYTICS_TRACK_ERRORS !== undefined) {
    flags.trackErrors = process.env.ANALYTICS_TRACK_ERRORS === 'true';
  }

  // User-facing tracking (privacy-sensitive)
  if (process.env.ANALYTICS_TRACK_SESSIONS !== undefined) {
    flags.trackSessions = process.env.ANALYTICS_TRACK_SESSIONS === 'true';
  }
  if (process.env.ANALYTICS_TRACK_CLICKS !== undefined) {
    flags.trackClicks = process.env.ANALYTICS_TRACK_CLICKS === 'true';
  }
  if (process.env.ANALYTICS_TRACK_USER_AGENT !== undefined) {
    flags.trackUserAgent = process.env.ANALYTICS_TRACK_USER_AGENT === 'true';
  }
  if (process.env.ANALYTICS_TRACK_IP_HASH !== undefined) {
    flags.trackIPHash = process.env.ANALYTICS_TRACK_IP_HASH === 'true';
  }

  // Advanced features
  if (process.env.ANALYTICS_REALTIME_FEED !== undefined) {
    flags.enableRealTimeFeed = process.env.ANALYTICS_REALTIME_FEED === 'true';
  }
  if (process.env.ANALYTICS_AGGREGATION_JOBS !== undefined) {
    flags.enableAggregationJobs = process.env.ANALYTICS_AGGREGATION_JOBS === 'true';
  }
  if (process.env.ANALYTICS_CHAT !== undefined) {
    flags.enableAnalyticsChat = process.env.ANALYTICS_CHAT === 'true';
  }

  return flags;
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize analytics configuration
 * Called once on app startup
 */
export function initializeAnalyticsConfig(): void {
  if (configInitialized) {
    logger.warn('Analytics config already initialized');
    return;
  }

  // Start with defaults
  currentConfig = { ...DEFAULT_FLAGS };

  // Apply environment variable overrides
  const envFlags = parseEnvFlags();
  currentConfig = { ...currentConfig, ...envFlags };

  configInitialized = true;

  logger.info('Analytics config initialized', {
    enabled: currentConfig.enabled,
    trackSearchEvents: currentConfig.trackSearchEvents,
    trackAIUsage: currentConfig.trackAIUsage,
    trackSessions: currentConfig.trackSessions,
    trackClicks: currentConfig.trackClicks,
  });
}

// ============================================================================
// GETTERS
// ============================================================================

/**
 * Get current analytics configuration
 */
export function getAnalyticsConfig(): AnalyticsFeatureFlags & AnalyticsSettings {
  if (!configInitialized) {
    initializeAnalyticsConfig();
  }
  return { ...currentConfig, ...ANALYTICS_SETTINGS };
}

/**
 * Check if a specific feature is enabled
 */
export function isFeatureEnabled(
  feature: keyof AnalyticsFeatureFlags,
  experienceId?: string
): boolean {
  if (!configInitialized) {
    initializeAnalyticsConfig();
  }

  // Master switch check
  if (!currentConfig.enabled) {
    return false;
  }

  // Check runtime overrides first
  if (configOverrides.runtimeOverrides?.[feature] !== undefined) {
    return configOverrides.runtimeOverrides[feature] as boolean;
  }

  // Check experience-specific overrides
  if (experienceId && configOverrides.experienceOverrides?.has(experienceId)) {
    const expOverrides = configOverrides.experienceOverrides.get(experienceId);
    if (expOverrides?.[feature] !== undefined) {
      return expOverrides[feature] as boolean;
    }
  }

  // Fall back to current config
  return currentConfig[feature] as boolean;
}

/**
 * Quick check helpers for common flags
 */
export const analyticsFlags = {
  isEnabled: () => isFeatureEnabled('enabled'),
  canTrackSearch: (experienceId?: string) => isFeatureEnabled('trackSearchEvents', experienceId),
  canTrackAI: () => isFeatureEnabled('trackAIUsage'),
  canTrackTools: () => isFeatureEnabled('trackToolExecutions'),
  canTrackErrors: () => isFeatureEnabled('trackErrors'),
  canTrackSessions: (experienceId?: string) => isFeatureEnabled('trackSessions', experienceId),
  canTrackClicks: (experienceId?: string) => isFeatureEnabled('trackClicks', experienceId),
  canTrackUserAgent: () => isFeatureEnabled('trackUserAgent'),
  canTrackIPHash: () => isFeatureEnabled('trackIPHash'),
};

// ============================================================================
// SETTERS (Runtime Configuration)
// ============================================================================

/**
 * Set runtime override for a feature flag
 * Useful for testing or temporary disabling
 */
export function setRuntimeOverride(
  feature: keyof AnalyticsFeatureFlags,
  value: boolean
): void {
  if (!configOverrides.runtimeOverrides) {
    configOverrides.runtimeOverrides = {};
  }
  configOverrides.runtimeOverrides[feature] = value;

  logger.info('Analytics runtime override set', { feature, value });
}

/**
 * Clear runtime override for a feature
 */
export function clearRuntimeOverride(feature: keyof AnalyticsFeatureFlags): void {
  if (configOverrides.runtimeOverrides) {
    delete configOverrides.runtimeOverrides[feature];
  }
}

/**
 * Clear all runtime overrides
 */
export function clearAllRuntimeOverrides(): void {
  configOverrides.runtimeOverrides = {};
  logger.info('All analytics runtime overrides cleared');
}

/**
 * Set experience-specific override
 */
export function setExperienceOverride(
  experienceId: string,
  overrides: Partial<AnalyticsFeatureFlags>
): void {
  if (!configOverrides.experienceOverrides) {
    configOverrides.experienceOverrides = new Map();
  }
  configOverrides.experienceOverrides.set(experienceId, overrides);

  logger.info('Analytics experience override set', { experienceId, overrides });
}

/**
 * Clear experience-specific override
 */
export function clearExperienceOverride(experienceId: string): void {
  configOverrides.experienceOverrides?.delete(experienceId);
}

// ============================================================================
// ENABLE/DISABLE ALL USER TRACKING
// ============================================================================

/**
 * Enable all user-facing tracking features
 * Call this when user has given consent
 */
export function enableUserTracking(): void {
  setRuntimeOverride('trackSessions', true);
  setRuntimeOverride('trackClicks', true);
  setRuntimeOverride('trackUserAgent', true);
  setRuntimeOverride('trackIPHash', true);

  logger.info('User tracking enabled');
}

/**
 * Disable all user-facing tracking features
 * Call this to respect user privacy preferences
 */
export function disableUserTracking(): void {
  setRuntimeOverride('trackSessions', false);
  setRuntimeOverride('trackClicks', false);
  setRuntimeOverride('trackUserAgent', false);
  setRuntimeOverride('trackIPHash', false);

  logger.info('User tracking disabled');
}

/**
 * Disable all analytics (emergency kill switch)
 */
export function disableAllAnalytics(): void {
  setRuntimeOverride('enabled', false);
  logger.warn('All analytics disabled via kill switch');
}

/**
 * Re-enable analytics after kill switch
 */
export function enableAllAnalytics(): void {
  clearRuntimeOverride('enabled');
  logger.info('Analytics re-enabled');
}

// ============================================================================
// API FOR ADMIN UI
// ============================================================================

/**
 * Get current config status for admin dashboard
 */
export function getAnalyticsStatus(): {
  config: AnalyticsFeatureFlags;
  overrides: {
    runtime: Partial<AnalyticsFeatureFlags>;
    experienceCount: number;
  };
  initialized: boolean;
} {
  return {
    config: getAnalyticsConfig(),
    overrides: {
      runtime: configOverrides.runtimeOverrides ?? {},
      experienceCount: configOverrides.experienceOverrides?.size ?? 0,
    },
    initialized: configInitialized,
  };
}

/**
 * Update config from admin UI
 */
export function updateAnalyticsConfig(updates: Partial<AnalyticsFeatureFlags>): void {
  // Apply as runtime overrides (doesn't persist to env)
  for (const [key, value] of Object.entries(updates)) {
    if (typeof value === 'boolean') {
      setRuntimeOverride(key as keyof AnalyticsFeatureFlags, value);
    }
  }
}
