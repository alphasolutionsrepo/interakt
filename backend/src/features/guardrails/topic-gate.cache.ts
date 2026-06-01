// src/features/guardrails/topic-gate.cache.ts

/**
 * Topic Gate Cache
 *
 * In-memory TTL cache for domain embeddings, keyed by experienceId.
 * Domain config changes rarely, so entries live for 1 hour with explicit
 * invalidation on config updates.
 *
 * Follows the FacetCache pattern (backend/src/features/pipeline/v2/facet-cache.ts).
 */

import { createLogger } from '@/shared/logger/logger';

const logger = createLogger('topic-gate-cache');

// ============================================================================
// TYPES
// ============================================================================

export interface TopicGateCacheEntry {
  /** Embedding vectors for expanded domain terms (parallel with expandedTerms) */
  termEmbeddings: number[][];
  /** Human-readable expanded terms (for logging/debugging) */
  expandedTerms: string[];
  /** Message to return when blocking */
  friendlyMessage: string;
  /** Cosine similarity threshold for allowing requests */
  threshold: number;

  // General cluster (conversational/smalltalk terms)
  /** Embedding vectors for general/conversational terms */
  generalTermEmbeddings: number[][];
  /** Human-readable general terms */
  generalTerms: string[];
  /** Cosine similarity threshold for general cluster */
  generalThreshold: number;

  /** When this entry was cached */
  cachedAt: number;
  /** TTL in milliseconds */
  ttlMs: number;
}

// ============================================================================
// CACHE
// ============================================================================

const DEFAULT_TTL_MS = 3_600_000; // 1 hour
const MAX_ENTRIES = 200;
const SWEEP_INTERVAL_MS = 300_000; // 5 minutes

export class TopicGateCache {
  private store = new Map<string, TopicGateCacheEntry>();
  private sweepTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.sweepTimer = setInterval(() => this.sweep(), SWEEP_INTERVAL_MS);
    // Allow Node to exit even if the timer is running
    if (this.sweepTimer.unref) this.sweepTimer.unref();
  }

  /** Get a cached entry, or null if missing/expired. */
  get(experienceId: string): TopicGateCacheEntry | null {
    const entry = this.store.get(experienceId);
    if (!entry) return null;

    if (Date.now() - entry.cachedAt > entry.ttlMs) {
      this.store.delete(experienceId);
      return null;
    }

    return entry;
  }

  /** Cache an entry for an experience. */
  set(
    experienceId: string,
    data: Omit<TopicGateCacheEntry, 'cachedAt' | 'ttlMs'>,
    ttlMs: number = DEFAULT_TTL_MS,
  ): void {
    // Evict oldest if at capacity
    if (this.store.size >= MAX_ENTRIES && !this.store.has(experienceId)) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey) this.store.delete(oldestKey);
    }

    this.store.set(experienceId, {
      ...data,
      cachedAt: Date.now(),
      ttlMs,
    });
  }

  /** Invalidate a specific experience's cached entry. */
  invalidate(experienceId: string): void {
    this.store.delete(experienceId);
    logger.debug('Invalidated topic gate cache', { experienceId });
  }

  /** Remove all expired entries. */
  sweep(): void {
    const now = Date.now();
    let swept = 0;
    for (const [key, entry] of this.store) {
      if (now - entry.cachedAt > entry.ttlMs) {
        this.store.delete(key);
        swept++;
      }
    }
    if (swept > 0) {
      logger.debug('Topic gate cache sweep', { swept, remaining: this.store.size });
    }
  }

  /** Current cache size (for monitoring). */
  get size(): number {
    return this.store.size;
  }

  /** Dispose — clear store and stop sweep timer. */
  dispose(): void {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
    this.store.clear();
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let globalCache: TopicGateCache | null = null;

export function getGlobalTopicGateCache(): TopicGateCache {
  if (!globalCache) {
    globalCache = new TopicGateCache();
  }
  return globalCache;
}

/** For testing — replace the global singleton. */
export function setGlobalTopicGateCache(cache: TopicGateCache): void {
  globalCache = cache;
}
