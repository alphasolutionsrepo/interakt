// src/features/analytics/analytics-collector.ts

/**
 * Analytics Collector
 *
 * Non-blocking, fire-and-forget analytics tracking.
 *
 * GUARANTEES:
 * - All track* methods return immediately (< 0.1ms)
 * - No async/await in public tracking methods
 * - Queue operations are synchronous array pushes
 * - DB writes happen in background on timer
 * - Analytics failures NEVER break main application flow
 *
 * ARCHITECTURE:
 * 1. Tracking calls push to in-memory queues (sync, instant)
 * 2. Background timer flushes queues every N seconds
 * 3. Failed writes are re-queued for retry
 * 4. Graceful shutdown drains all queues
 */

import { createLogger } from '@/shared/logger/logger';
import { analyticsFlags } from './analytics-config';
import { startRetentionCleanup, stopRetentionCleanup } from './analytics-retention';
import type {
  SearchEventData,
  AIEventData,
  ToolExecutionData,
  ClickEventData,
  QueuedSearchEvent,
  QueuedAIEvent,
  QueuedToolEvent,
  QueuedClickEvent,
  QueueStats,
  AnalyticsCollectorConfig,
} from './analytics.types';

const logger = createLogger('analytics-collector');

// ============================================================================
// CONFIGURATION
// ============================================================================

const DEFAULT_CONFIG: AnalyticsCollectorConfig = {
  batchSize: 100,
  flushIntervalMs: 5000, // 5 seconds
  enabled: true,
  logStats: false,
};

let config: AnalyticsCollectorConfig = { ...DEFAULT_CONFIG };

// ============================================================================
// EVENT QUEUES (in-memory)
// ============================================================================

const searchEventQueue: QueuedSearchEvent[] = [];
const aiEventQueue: QueuedAIEvent[] = [];
const toolEventQueue: QueuedToolEvent[] = [];
const clickEventQueue: QueuedClickEvent[] = [];

// ============================================================================
// STATISTICS
// ============================================================================

let lastFlushAt: Date | null = null;
let flushCount = 0;
let failedFlushCount = 0;

// ============================================================================
// FLUSH TIMER
// ============================================================================

let flushTimer: ReturnType<typeof setInterval> | null = null;
let isShuttingDown = false;
let collectorInitialized = false;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Generate a UUID (works in both Node.js and Edge runtime)
 */
function generateId(): string {
  // Use crypto.randomUUID if available, otherwise fallback
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for older environments
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Normalize query text for grouping
 */
function normalizeQuery(query: string): string {
  return query.toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Count words in a query
 */
function countWords(query: string): number {
  return query.trim().split(/\s+/).filter(Boolean).length;
}

// ============================================================================
// PUBLIC TRACKING FUNCTIONS (Fire-and-Forget)
// ============================================================================

/**
 * Track a search event - FIRE AND FORGET
 *
 * Returns immediately, never throws.
 * Event is queued and written to DB in background.
 *
 * @param event - Search event data
 * @param experienceId - Optional experience ID for feature flag checks
 */
export function trackSearch(event: SearchEventData, experienceId?: string): void {
  // Auto-start collector if not running (handles Next.js module isolation)
  ensureCollectorRunning();

  if (!config.enabled) {
    logger.debug('trackSearch: config disabled');
    return;
  }
  if (!analyticsFlags.canTrackSearch(experienceId)) {
    logger.debug('trackSearch: feature flag disabled');
    return;
  }

  // Skip empty queries — these are noise (e.g., match_all probes, empty tool calls)
  if (!event.queryText || event.queryText.trim().length === 0) {
    logger.debug('trackSearch: skipping empty query');
    return;
  }

  try {
    const queryNormalized = normalizeQuery(event.queryText);

    const queuedEvent: QueuedSearchEvent = {
      ...event,
      id: generateId(),
      timestamp: new Date(),
      source: event.source ?? 'api',
      queryNormalized,
      queryLength: event.queryText.length,
      queryWordCount: countWords(event.queryText),
      isZeroResult: event.totalResults === 0,
      hasFilters: event.hasFilters ?? (event.filterCount ?? 0) > 0,
      filterCount: event.filterCount ?? 0,
      pageNumber: event.pageNumber ?? 1,
    };

    searchEventQueue.push(queuedEvent);

    logger.info('Search event queued', {
      query: event.queryText.substring(0, 50),
      queueSize: searchEventQueue.length,
    });

    // Trigger flush if batch size reached (non-blocking)
    if (searchEventQueue.length >= config.batchSize) {
      scheduleFlush();
    }
  } catch (err) {
    logger.error('trackSearch error', err as Error);
  }
}

/**
 * Track an AI operation - FIRE AND FORGET
 *
 * Returns immediately, never throws.
 */
export function trackAI(event: AIEventData): void {
  if (!config.enabled) return;
  if (!analyticsFlags.canTrackAI()) return;

  try {
    const queuedEvent: QueuedAIEvent = {
      ...event,
      id: generateId(),
      timestamp: new Date(),
      source: event.source ?? 'api',
      estimatedCostUsd: null, // Will be calculated during flush if pricing configured
    };

    aiEventQueue.push(queuedEvent);

    if (aiEventQueue.length >= config.batchSize) {
      scheduleFlush();
    }
  } catch {
    // Silently ignore
  }
}

/**
 * Track an AI tool execution - FIRE AND FORGET
 *
 * Returns immediately, never throws.
 */
export function trackToolExecution(event: ToolExecutionData): void {
  if (!config.enabled) return;
  if (!analyticsFlags.canTrackTools()) return;

  try {
    const queuedEvent: QueuedToolEvent = {
      ...event,
      id: event.id ?? generateId(),
      timestamp: new Date(),
      toolVersion: event.toolVersion ?? '1.0',
    };

    toolEventQueue.push(queuedEvent);

    if (toolEventQueue.length >= config.batchSize) {
      scheduleFlush();
    }
  } catch {
    // Silently ignore
  }
}

/**
 * Track a search result click - FIRE AND FORGET
 *
 * Returns immediately, never throws.
 */
export function trackClick(event: ClickEventData, experienceId?: string): void {
  if (!config.enabled) return;
  if (!analyticsFlags.canTrackClicks(experienceId)) return;

  try {
    const queuedEvent: QueuedClickEvent = {
      ...event,
      id: generateId(),
      timestamp: new Date(),
    };

    clickEventQueue.push(queuedEvent);

    if (clickEventQueue.length >= config.batchSize) {
      scheduleFlush();
    }
  } catch {
    // Silently ignore
  }
}

// ============================================================================
// FLUSH FUNCTIONS (Background, async)
// ============================================================================

/**
 * Schedule a flush on next tick (non-blocking)
 */
function scheduleFlush(): void {
  if (typeof setImmediate !== 'undefined') {
    setImmediate(() => {
      flushAll().catch(() => {
        // Ignore errors, will retry next interval
      });
    });
  } else {
    // Fallback for environments without setImmediate
    setTimeout(() => {
      flushAll().catch(() => {});
    }, 0);
  }
}

/**
 * Flush all event queues
 */
async function flushAll(): Promise<void> {
  if (isShuttingDown) {
    logger.debug('flushAll skipped - shutting down');
    return;
  }

  const stats = getQueueStats();
  if (stats.searchEvents > 0 || stats.aiEvents > 0 || stats.toolEvents > 0 || stats.clickEvents > 0) {
    logger.info('flushAll starting', { queueSizes: stats });
  }

  await Promise.all([
    flushSearchEvents(),
    flushAIEvents(),
    flushToolEvents(),
    flushClickEvents(),
  ]);

  lastFlushAt = new Date();
  flushCount++;

  logger.debug('Analytics flush completed', {
    flushCount,
    queueSizes: getQueueStats(),
  });
}

/**
 * Flush search events to database
 */
async function flushSearchEvents(): Promise<void> {
  if (searchEventQueue.length === 0) return;

  const batch = searchEventQueue.splice(0, config.batchSize);

  logger.info('Flushing search events', { count: batch.length });

  try {
    // Dynamic import to avoid loading DB in non-server contexts
    const { analyticsDB } = await import('@/db/index');

    if (!analyticsDB) {
      // Analytics DB not configured - log and discard
      logger.warn('Analytics DB not configured, discarding search events', {
        count: batch.length,
      });
      return;
    }

    logger.debug('Analytics DB available, inserting events');

    // Import schema
    const { searchEvents } = await import('@/db/analytics-schema/search-analytics.schema');

    await analyticsDB.insert(searchEvents).values(
      batch.map((e) => ({
        id: e.id,
        requestId: e.requestId,
        sessionId: e.sessionId,
        timestamp: e.timestamp,
        triggerType: e.triggerType,
        triggerSourceId: e.triggerSourceId,
        aiRequestId: e.aiRequestId,
        searchType: e.searchType,
        indexIds: e.indexIds,
        experienceId: e.experienceId,
        experienceSlug: e.experienceSlug,
        queryText: e.queryText,
        queryNormalized: e.queryNormalized,
        queryLength: e.queryLength,
        queryWordCount: e.queryWordCount,
        queryLanguage: e.queryLanguage,
        hasFilters: e.hasFilters,
        filterFields: e.filterFields,
        filterCount: e.filterCount,
        facetsRequested: e.facetsRequested,
        totalResults: e.totalResults,
        resultsReturned: e.resultsReturned,
        pageNumber: e.pageNumber,
        isZeroResult: e.isZeroResult,
        topResultScore: e.topResultScore,
        durationMs: e.durationMs,
        esTookMs: e.esTookMs,
        embeddingDurationMs: e.embeddingDurationMs,
        success: e.success,
        errorCode: e.errorCode,
        errorMessage: e.errorMessage,
        metadata: e.metadata,
      }))
    );

    logger.info('Successfully flushed search events to DB', { count: batch.length });
  } catch (error) {
    // Re-queue failed events for retry
    searchEventQueue.unshift(...batch);
    failedFlushCount++;
    logger.error('Failed to flush search events', error as Error, {
      count: batch.length,
    });
  }
}

/**
 * Flush AI events to database
 */
async function flushAIEvents(): Promise<void> {
  if (aiEventQueue.length === 0) return;

  const batch = aiEventQueue.splice(0, config.batchSize);

  try {
    const { analyticsDB } = await import('@/db/index');

    if (!analyticsDB) {
      logger.debug('Analytics DB not configured, discarding AI events', {
        count: batch.length,
      });
      return;
    }

    // Import cost calculation service
    const { calculateTotalCost } = await import('./analytics-cost.service');
    const { aiUsageEvents } = await import('@/db/analytics-schema/ai-usage-analytics.schema');

    await analyticsDB.insert(aiUsageEvents).values(
      batch.map((e) => {
        // Calculate estimated cost if not already set
        const estimatedCostUsd =
          e.estimatedCostUsd ??
          calculateTotalCost(e.providerKey, e.modelKey, e.inputTokens, e.outputTokens);

        return {
          requestId: e.requestId,
          timestamp: e.timestamp,
          operation: e.operation,
          providerId: e.providerId,
          providerKey: e.providerKey,
          modelId: e.modelId,
          modelKey: e.modelKey,
          inputTokens: e.inputTokens,
          outputTokens: e.outputTokens,
          totalTokens: e.totalTokens,
          durationMs: e.durationMs,
          timeToFirstToken: e.timeToFirstToken,
          success: e.success,
          errorCode: e.errorCode,
          errorMessage: e.errorMessage,
          userId: undefined, // TODO: Add user tracking if needed
          sessionId: e.sessionId,
          feature: e.feature,
          embeddingDimensions: e.embeddingDimensions,
          batchSize: e.batchSize,
          estimatedCostUsd,
          requestMetadata: e.metadata as Record<string, unknown>,
        };
      })
    );

    logger.debug('Flushed AI events', { count: batch.length });
  } catch (error) {
    aiEventQueue.unshift(...batch);
    failedFlushCount++;
    logger.error('Failed to flush AI events', error as Error, {
      count: batch.length,
    });
  }
}

/**
 * Flush tool execution events to database
 */
async function flushToolEvents(): Promise<void> {
  if (toolEventQueue.length === 0) return;

  const batch = toolEventQueue.splice(0, config.batchSize);

  try {
    const { analyticsDB } = await import('@/db/index');

    if (!analyticsDB) {
      logger.debug('Analytics DB not configured, discarding tool events', {
        count: batch.length,
      });
      return;
    }

    const { aiToolExecutions } = await import('@/db/analytics-schema/search-analytics.schema');

    await analyticsDB.insert(aiToolExecutions).values(
      batch.map((e) => ({
        id: e.id,
        aiRequestId: e.aiRequestId,
        sessionId: e.sessionId,
        timestamp: e.timestamp,
        toolName: e.toolName,
        toolCategory: e.toolCategory,
        toolVersion: e.toolVersion,
        inputSummary: e.inputSummary,
        outputSummary: e.outputSummary,
        durationMs: e.durationMs,
        success: e.success,
        errorCode: e.errorCode,
        errorMessage: e.errorMessage,
        searchEventId: e.searchEventId,
        actionEventId: e.actionEventId,
        metadata: e.metadata,
      }))
    );

    logger.debug('Flushed tool events', { count: batch.length });
  } catch (error) {
    toolEventQueue.unshift(...batch);
    failedFlushCount++;
    logger.error('Failed to flush tool events', error as Error, {
      count: batch.length,
    });
  }
}

/**
 * Flush click events to database
 */
async function flushClickEvents(): Promise<void> {
  if (clickEventQueue.length === 0) return;

  const batch = clickEventQueue.splice(0, config.batchSize);

  try {
    const { analyticsDB } = await import('@/db/index');

    if (!analyticsDB) {
      logger.debug('Analytics DB not configured, discarding click events', {
        count: batch.length,
      });
      return;
    }

    const { searchResultClicks } = await import('@/db/analytics-schema/search-analytics.schema');

    await analyticsDB.insert(searchResultClicks).values(
      batch.map((e) => ({
        id: e.id,
        searchEventId: e.searchEventId,
        sessionId: e.sessionId,
        timestamp: e.timestamp,
        resultPosition: e.resultPosition,
        documentId: e.documentId,
        interactionType: e.interactionType,
        dwellTimeMs: e.dwellTimeMs,
      }))
    );

    logger.debug('Flushed click events', { count: batch.length });
  } catch (error) {
    clickEventQueue.unshift(...batch);
    failedFlushCount++;
    logger.error('Failed to flush click events', error as Error, {
      count: batch.length,
    });
  }
}

// ============================================================================
// LIFECYCLE MANAGEMENT
// ============================================================================

/**
 * Ensure the collector is running (auto-start if needed)
 * Called by tracking functions to handle Next.js module isolation
 */
function ensureCollectorRunning(): void {
  if (!collectorInitialized && !flushTimer && !isShuttingDown) {
    logger.info('Auto-starting analytics collector from tracking call');
    startAnalyticsCollector();
  }
}

/**
 * Start the analytics collector
 *
 * Begins the background flush timer.
 * Safe to call multiple times (idempotent).
 */
export function startAnalyticsCollector(customConfig?: Partial<AnalyticsCollectorConfig>): void {
  if (flushTimer) return; // Already running

  if (customConfig) {
    config = { ...DEFAULT_CONFIG, ...customConfig };
  }

  if (!config.enabled) {
    logger.info('Analytics collector disabled');
    return;
  }

  isShuttingDown = false;

  flushTimer = setInterval(() => {
    logger.debug('Flush timer triggered', {
      searchQueueSize: searchEventQueue.length,
      aiQueueSize: aiEventQueue.length,
    });
    flushAll().catch((err) => {
      logger.error('flushAll failed in interval', err as Error);
    });
  }, config.flushIntervalMs);

  // NOTE: Removed .unref() - in Next.js dev mode it can cause the timer to not fire
  // if (flushTimer.unref) {
  //   flushTimer.unref();
  // }

  collectorInitialized = true;

  // Start retention cleanup alongside the collector
  startRetentionCleanup();

  logger.info('Analytics collector started', {
    batchSize: config.batchSize,
    flushIntervalMs: config.flushIntervalMs,
  });
}

/**
 * Stop the analytics collector
 *
 * Stops the timer and drains all queues.
 * Call this on graceful shutdown.
 */
export async function stopAnalyticsCollector(): Promise<void> {
  isShuttingDown = true;

  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }

  // Stop retention cleanup
  stopRetentionCleanup();

  // Drain all queues
  logger.info('Draining analytics queues...', { stats: getQueueStats() });

  try {
    await flushAll();
    logger.info('Analytics collector stopped, all queues drained');
  } catch (error) {
    logger.error('Error draining analytics queues', error as Error);
  }
}

/**
 * Check if the collector is running
 */
export function isCollectorRunning(): boolean {
  return flushTimer !== null;
}

// ============================================================================
// MONITORING & STATS
// ============================================================================

/**
 * Get current queue statistics
 */
export function getQueueStats(): QueueStats {
  return {
    searchEvents: searchEventQueue.length,
    aiEvents: aiEventQueue.length,
    toolEvents: toolEventQueue.length,
    clickEvents: clickEventQueue.length,
    totalPending:
      searchEventQueue.length +
      aiEventQueue.length +
      toolEventQueue.length +
      clickEventQueue.length,
    lastFlushAt,
    flushCount,
    failedFlushCount,
  };
}

/**
 * Force flush all queues (for testing or manual trigger)
 */
export async function forceFlush(): Promise<void> {
  await flushAll();
}

/**
 * Clear all queues (for testing)
 */
export function clearQueues(): void {
  searchEventQueue.length = 0;
  aiEventQueue.length = 0;
  toolEventQueue.length = 0;
  clickEventQueue.length = 0;
}

/**
 * Update collector configuration
 */
export function updateConfig(newConfig: Partial<AnalyticsCollectorConfig>): void {
  config = { ...config, ...newConfig };
}

/**
 * Get current configuration
 */
export function getConfig(): AnalyticsCollectorConfig {
  return { ...config };
}

/**
 * Get data retention status (for monitoring/admin endpoints)
 */
export { getRetentionStatus } from './analytics-retention';

/**
 * Manually trigger retention cleanup (for admin endpoints)
 */
export { runRetentionCleanup } from './analytics-retention';
