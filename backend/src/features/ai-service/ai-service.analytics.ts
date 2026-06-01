// src/features/ai-service/ai-service.analytics.ts

/**
 * AI Service Analytics
 * 
 * Tracks AI operations for analytics, monitoring, and cost tracking.
 * Writes to the analytics database asynchronously to not block operations.
 */

import { createLogger } from '@/shared/logger/logger';
import type { AIUsageMetrics } from './ai-service.types';

const logger = createLogger('ai-service-analytics');

// ============================================================================
// ANALYTICS TRACKING
// ============================================================================

/**
 * Queue for pending analytics events
 * Events are batched and written periodically
 */
const analyticsQueue: AIUsageMetrics[] = [];
const BATCH_SIZE = 50;
const FLUSH_INTERVAL_MS = 5000; // 5 seconds

// Set up periodic flush
let flushTimer: NodeJS.Timeout | null = null;

function startFlushTimer(): void {
    if (flushTimer) return;

    flushTimer = setInterval(() => {
        flushAnalytics().catch(err => {
            logger.error('Failed to flush analytics', err);
        });
    }, FLUSH_INTERVAL_MS);

    // Unref so it doesn't keep the process alive
    if (flushTimer.unref) {
        flushTimer.unref();
    }
}

/**
 * Track an AI operation
 * 
 * @param metrics - Usage metrics to track
 */
export async function trackUsage(metrics: AIUsageMetrics): Promise<void> {
    // Log immediately for real-time monitoring
    logger.info('AI operation completed', {
        requestId: metrics.requestId,
        operation: metrics.operation,
        provider: metrics.providerKey,
        model: metrics.modelKey,
        tokens: metrics.totalTokens,
        durationMs: metrics.durationMs,
        success: metrics.success,
        ...(metrics.errorCode && { errorCode: metrics.errorCode }),
        ...(metrics.feature && { feature: metrics.feature }),
    });

    // Add to queue for batch writing
    analyticsQueue.push(metrics);

    // Start flush timer if not already running
    startFlushTimer();

    // Flush if batch size reached
    if (analyticsQueue.length >= BATCH_SIZE) {
        await flushAnalytics();
    }
}

/**
 * Flush pending analytics to database
 */
export async function flushAnalytics(): Promise<void> {
    if (analyticsQueue.length === 0) return;

    // Take items from queue
    const batch = analyticsQueue.splice(0, BATCH_SIZE);

    try {
        // Import analytics collector to write to analytics DB
        const { trackAI } = await import('@/features/analytics');
        type AIFeature = 'chat' | 'summarize' | 'search_embedding' | 'reindex_embedding' | 'autocomplete' | 'api';

        // Send each event to the analytics collector (fire-and-forget)
        for (const metrics of batch) {
            // Map feature string to AIFeature type if valid
            const validFeatures: AIFeature[] = ['chat', 'summarize', 'search_embedding', 'reindex_embedding', 'autocomplete', 'api'];
            const feature = metrics.feature && validFeatures.includes(metrics.feature as AIFeature)
                ? (metrics.feature as AIFeature)
                : undefined;

            trackAI({
                requestId: metrics.requestId,
                sessionId: metrics.sessionId,
                operation: metrics.operation,
                feature,
                providerId: metrics.providerId,
                providerKey: metrics.providerKey,
                modelId: metrics.modelId,
                modelKey: metrics.modelKey,
                inputTokens: metrics.inputTokens,
                outputTokens: metrics.outputTokens,
                totalTokens: metrics.totalTokens,
                durationMs: metrics.durationMs,
                timeToFirstToken: metrics.timeToFirstToken,
                success: metrics.success,
                errorCode: metrics.errorCode,
                errorMessage: metrics.errorMessage,
                metadata: metrics.metadata,
            });
        }

        logger.debug('Forwarded AI analytics to collector', {
            count: batch.length,
        });
    } catch (error) {
        // Re-add to queue on failure (will retry next flush)
        analyticsQueue.unshift(...batch);
        logger.error('Failed to write analytics batch', error as Error, {
            count: batch.length,
        });
    }
}

/**
 * Stop the flush timer (for cleanup)
 */
export function stopAnalyticsFlush(): void {
    if (flushTimer) {
        clearInterval(flushTimer);
        flushTimer = null;
    }
}

// ============================================================================
// COST ESTIMATION
// ============================================================================

/**
 * Pricing per 1M tokens (as of 2024)
 * These should be updated periodically or made configurable
 */
const PRICING: Record<string, { input: number; output: number }> = {
    // OpenAI
    'gpt-4o': { input: 2.50, output: 10.00 },
    'gpt-4o-mini': { input: 0.15, output: 0.60 },
    'gpt-4-turbo': { input: 10.00, output: 30.00 },
    'text-embedding-3-small': { input: 0.02, output: 0 },
    'text-embedding-3-large': { input: 0.13, output: 0 },
    'text-embedding-ada-002': { input: 0.10, output: 0 },

    // Ollama (local, no cost)
    default: { input: 0, output: 0 },
};

/**
 * Estimate cost for an operation
 * 
 * @param modelKey - The model key
 * @param inputTokens - Number of input tokens
 * @param outputTokens - Number of output tokens
 * @returns Estimated cost in USD
 */
export function estimateCost(
    modelKey: string,
    inputTokens: number,
    outputTokens: number
): number {
    const pricing = PRICING[modelKey] || PRICING.default;

    const inputCost = (inputTokens / 1_000_000) * pricing.input;
    const outputCost = (outputTokens / 1_000_000) * pricing.output;

    return inputCost + outputCost;
}

// ============================================================================
// REAL-TIME METRICS
// ============================================================================

/**
 * In-memory counters for real-time dashboard
 */
const realtimeCounters = {
    requestsTotal: 0,
    requestsSuccess: 0,
    requestsFailed: 0,
    tokensTotal: 0,
    byOperation: {} as Record<string, number>,
    byProvider: {} as Record<string, number>,
    lastReset: Date.now(),
};

/**
 * Update real-time counters
 */
export function updateRealtimeMetrics(metrics: AIUsageMetrics): void {
    realtimeCounters.requestsTotal++;

    if (metrics.success) {
        realtimeCounters.requestsSuccess++;
    } else {
        realtimeCounters.requestsFailed++;
    }

    realtimeCounters.tokensTotal += metrics.totalTokens;

    realtimeCounters.byOperation[metrics.operation] =
        (realtimeCounters.byOperation[metrics.operation] || 0) + 1;

    realtimeCounters.byProvider[metrics.providerKey] =
        (realtimeCounters.byProvider[metrics.providerKey] || 0) + 1;
}

/**
 * Get real-time metrics
 */
export function getRealtimeMetrics(): typeof realtimeCounters {
    return { ...realtimeCounters };
}

/**
 * Reset real-time counters
 */
export function resetRealtimeMetrics(): void {
    realtimeCounters.requestsTotal = 0;
    realtimeCounters.requestsSuccess = 0;
    realtimeCounters.requestsFailed = 0;
    realtimeCounters.tokensTotal = 0;
    realtimeCounters.byOperation = {};
    realtimeCounters.byProvider = {};
    realtimeCounters.lastReset = Date.now();
}