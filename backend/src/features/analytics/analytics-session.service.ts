// src/features/analytics/analytics-session.service.ts

/**
 * Analytics Session Service
 *
 * Manages analytics sessions for tracking user journeys.
 * Sessions link search, AI, and click events together.
 *
 * DESIGN:
 * - Sessions are created lazily on first event
 * - Session ID comes from frontend (externalSessionId)
 * - Sessions are updated atomically using upsert
 * - Privacy-sensitive data (userAgent, ipHash) only tracked if enabled
 */

import 'server-only';

import { eq } from 'drizzle-orm';
import { createLogger } from '@/shared/logger/logger';
import { analyticsFlags } from './analytics-config';
import type { SessionData, SessionType } from './analytics.types';

const logger = createLogger('analytics-session');

// ============================================================================
// TYPES
// ============================================================================

export interface SessionInfo {
  id: string;
  externalSessionId: string;
  experienceId?: string;
  sessionType: SessionType;
}

export interface SessionUpdateData {
  searchCount?: number;
  aiRequestCount?: number;
  toolExecutionCount?: number;
  sessionType?: SessionType;
}

// ============================================================================
// SESSION CACHE (in-memory for performance)
// ============================================================================

// Cache of external session ID -> internal session ID
// This avoids repeated DB lookups for the same session
const sessionCache = new Map<string, string>();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const cacheTimestamps = new Map<string, number>();

function getCachedSessionId(externalId: string): string | undefined {
  const timestamp = cacheTimestamps.get(externalId);
  if (timestamp && Date.now() - timestamp > CACHE_TTL_MS) {
    sessionCache.delete(externalId);
    cacheTimestamps.delete(externalId);
    return undefined;
  }
  return sessionCache.get(externalId);
}

function setCachedSessionId(externalId: string, internalId: string): void {
  sessionCache.set(externalId, internalId);
  cacheTimestamps.set(externalId, Date.now());
}

// ============================================================================
// SESSION MANAGEMENT
// ============================================================================

/**
 * Get or create an analytics session
 * Returns the internal session ID
 */
export async function getOrCreateSession(data: SessionData): Promise<string | null> {
  // Check if session tracking is enabled
  if (!analyticsFlags.canTrackSessions(data.experienceId)) {
    return null;
  }

  try {
    // Check cache first
    const cached = getCachedSessionId(data.externalSessionId);
    if (cached) {
      return cached;
    }

    // Dynamic import to avoid loading DB in non-server contexts
    const { analyticsDB } = await import('@/db/index');
    if (!analyticsDB) {
      logger.debug('Analytics DB not configured, skipping session');
      return null;
    }

    const { analyticsSessions } = await import('@/db/analytics-schema/search-analytics.schema');

    // Try to find existing session
    const existing = await analyticsDB
      .select({ id: analyticsSessions.id })
      .from(analyticsSessions)
      .where(eq(analyticsSessions.externalSessionId, data.externalSessionId))
      .limit(1);

    if (existing.length > 0) {
      const sessionId = existing[0].id;
      setCachedSessionId(data.externalSessionId, sessionId);

      // Update last activity
      await analyticsDB
        .update(analyticsSessions)
        .set({ lastActivityAt: new Date() })
        .where(eq(analyticsSessions.id, sessionId));

      return sessionId;
    }

    // Create new session
    const sessionData: Record<string, unknown> = {
      externalSessionId: data.externalSessionId,
      experienceId: data.experienceId,
      experienceSlug: data.experienceSlug,
      sessionType: data.sessionType,
      originDomain: data.originDomain,
    };

    // Only include privacy-sensitive data if tracking is enabled
    if (analyticsFlags.canTrackUserAgent() && data.userAgent) {
      sessionData.userAgent = data.userAgent;
    }
    if (analyticsFlags.canTrackIPHash() && data.ipHash) {
      sessionData.ipHash = data.ipHash;
    }

    const [newSession] = await analyticsDB
      .insert(analyticsSessions)
      .values(sessionData as typeof analyticsSessions.$inferInsert)
      .returning({ id: analyticsSessions.id });

    const sessionId = newSession.id;
    setCachedSessionId(data.externalSessionId, sessionId);

    logger.debug('Created analytics session', {
      sessionId,
      externalSessionId: data.externalSessionId,
    });

    return sessionId;
  } catch (error) {
    // Sessions are optional - don't fail if creation fails
    logger.error('Failed to create session', error as Error, {
      externalSessionId: data.externalSessionId,
    });
    return null;
  }
}

/**
 * Update session counters after an event
 * Non-blocking, fire-and-forget
 */
export function updateSessionCounters(
  externalSessionId: string,
  update: SessionUpdateData
): void {
  if (!analyticsFlags.canTrackSessions()) {
    return;
  }

  // Fire and forget
  updateSessionCountersAsync(externalSessionId, update).catch(() => {
    // Silently ignore errors
  });
}

async function updateSessionCountersAsync(
  externalSessionId: string,
  update: SessionUpdateData
): Promise<void> {
  try {
    const { analyticsDB } = await import('@/db/index');
    if (!analyticsDB) return;

    const { analyticsSessions } = await import('@/db/analytics-schema/search-analytics.schema');
    const { sql } = await import('drizzle-orm');

    const updates: Record<string, unknown> = {
      lastActivityAt: new Date(),
    };

    if (update.searchCount) {
      updates.totalSearches = sql`${analyticsSessions.totalSearches} + ${update.searchCount}`;
    }
    if (update.aiRequestCount) {
      updates.totalAiRequests = sql`${analyticsSessions.totalAiRequests} + ${update.aiRequestCount}`;
    }
    if (update.toolExecutionCount) {
      updates.totalToolExecutions = sql`${analyticsSessions.totalToolExecutions} + ${update.toolExecutionCount}`;
    }
    if (update.sessionType) {
      updates.sessionType = update.sessionType;
    }

    await analyticsDB
      .update(analyticsSessions)
      .set(updates)
      .where(eq(analyticsSessions.externalSessionId, externalSessionId));
  } catch {
    // Silently ignore
  }
}

/**
 * End a session (when user leaves)
 */
export async function endSession(externalSessionId: string): Promise<void> {
  if (!analyticsFlags.canTrackSessions()) {
    return;
  }

  try {
    const { analyticsDB } = await import('@/db/index');
    if (!analyticsDB) return;

    const { analyticsSessions } = await import('@/db/analytics-schema/search-analytics.schema');

    await analyticsDB
      .update(analyticsSessions)
      .set({ endedAt: new Date() })
      .where(eq(analyticsSessions.externalSessionId, externalSessionId));

    // Clear from cache
    sessionCache.delete(externalSessionId);
    cacheTimestamps.delete(externalSessionId);

    logger.debug('Ended analytics session', { externalSessionId });
  } catch (error) {
    logger.error('Failed to end session', error as Error, { externalSessionId });
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Hash an IP address for privacy-safe storage
 */
export function hashIP(ip: string): string {
  // Simple hash using built-in crypto
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    // Use async hashing in supported environments
    // For now, use a simpler approach
  }

  // Simple hash for IP (not cryptographically secure, but good for analytics grouping)
  let hash = 0;
  for (let i = 0; i < ip.length; i++) {
    const char = ip.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

/**
 * Generate a session ID for client-side use
 */
export function generateSessionId(): string {
  // crypto.randomUUID is available in all supported runtimes (Node 16+, modern
  // browsers). No insecure Math.random fallback.
  return crypto.randomUUID();
}

/**
 * Clear session cache (for testing)
 */
export function clearSessionCache(): void {
  sessionCache.clear();
  cacheTimestamps.clear();
}

/**
 * Get cache stats (for monitoring)
 */
export function getSessionCacheStats(): { size: number; entries: string[] } {
  return {
    size: sessionCache.size,
    entries: Array.from(sessionCache.keys()),
  };
}
