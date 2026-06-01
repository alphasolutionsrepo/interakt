// src/features/pipeline/v2/facet-cache.ts

/**
 * Facet Value Cache — In-memory TTL cache for field facet values.
 *
 * Caches distinct values per (dataSourceId, fieldName) with a configurable TTL.
 * Used by the data source search provider to avoid repeated facet queries
 * within the same session or across rapid successive turns.
 *
 * Design decisions:
 * - Simple in-memory Map — no external dependencies
 * - TTL-based expiry with lazy eviction (checked on read)
 * - Periodic sweep to prevent unbounded memory growth
 * - Scoped per data source + field, not globally
 */

import { createLogger } from '@/shared/logger/logger';

const logger = createLogger('v2:facet-cache');

// ============================================================================
// TYPES
// ============================================================================

export interface FacetCacheEntry {
  /** The distinct values for this field */
  values: string[];
  /** When this entry was cached (epoch ms) */
  cachedAt: number;
  /** TTL for this entry (ms) */
  ttlMs: number;
}

export interface FacetCacheConfig {
  /** Default TTL for cached entries (default: 5 minutes) */
  defaultTtlMs: number;
  /** Maximum entries before forcing a sweep (default: 500) */
  maxEntries: number;
  /** Sweep interval — how often to prune expired entries (default: 60 seconds) */
  sweepIntervalMs: number;
}

const DEFAULT_CONFIG: FacetCacheConfig = {
  defaultTtlMs: 5 * 60 * 1000, // 5 minutes
  maxEntries: 500,
  sweepIntervalMs: 60 * 1000, // 1 minute
};

// ============================================================================
// CACHE KEY
// ============================================================================

function cacheKey(dataSourceId: string, fieldName: string): string {
  return `${dataSourceId}:${fieldName}`;
}

// ============================================================================
// FACET CACHE CLASS
// ============================================================================

export class FacetCache {
  private readonly store = new Map<string, FacetCacheEntry>();
  private readonly config: FacetCacheConfig;
  private sweepTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: Partial<FacetCacheConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Get cached values for a field. Returns null if not cached or expired.
   */
  get(dataSourceId: string, fieldName: string): string[] | null {
    const key = cacheKey(dataSourceId, fieldName);
    const entry = this.store.get(key);

    if (!entry) return null;

    // Check TTL
    if (Date.now() - entry.cachedAt > entry.ttlMs) {
      this.store.delete(key);
      return null;
    }

    return entry.values;
  }

  /**
   * Cache values for a field.
   */
  set(
    dataSourceId: string,
    fieldName: string,
    values: string[],
    ttlMs?: number,
  ): void {
    const key = cacheKey(dataSourceId, fieldName);

    this.store.set(key, {
      values,
      cachedAt: Date.now(),
      ttlMs: ttlMs ?? this.config.defaultTtlMs,
    });

    // Trigger sweep if we're over max entries
    if (this.store.size > this.config.maxEntries) {
      this.sweep();
    }
  }

  /**
   * Check if a field has cached (non-expired) values.
   */
  has(dataSourceId: string, fieldName: string): boolean {
    return this.get(dataSourceId, fieldName) !== null;
  }

  /**
   * Get multiple fields at once. Returns a map of fieldName → values.
   * Fields not in cache (or expired) are omitted from the result.
   */
  getMany(
    dataSourceId: string,
    fieldNames: string[],
  ): Record<string, string[]> {
    const result: Record<string, string[]> = {};
    for (const field of fieldNames) {
      const values = this.get(dataSourceId, field);
      if (values !== null) {
        result[field] = values;
      }
    }
    return result;
  }

  /**
   * Invalidate all entries for a data source.
   * Useful when the data source schema changes.
   */
  invalidateDataSource(dataSourceId: string): void {
    const prefix = `${dataSourceId}:`;
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
      }
    }
  }

  /**
   * Remove all expired entries.
   */
  sweep(): void {
    const now = Date.now();
    let removed = 0;

    for (const [key, entry] of this.store.entries()) {
      if (now - entry.cachedAt > entry.ttlMs) {
        this.store.delete(key);
        removed++;
      }
    }

    if (removed > 0) {
      logger.debug('Facet cache sweep', { removed, remaining: this.store.size });
    }
  }

  /**
   * Start periodic sweep timer.
   * Call this once at process start if using a long-lived cache instance.
   */
  startSweepTimer(): void {
    if (this.sweepTimer) return;
    this.sweepTimer = setInterval(() => this.sweep(), this.config.sweepIntervalMs);
    // Unref so the timer doesn't prevent Node.js from exiting
    if (typeof this.sweepTimer === 'object' && 'unref' in this.sweepTimer) {
      this.sweepTimer.unref();
    }
  }

  /**
   * Stop the sweep timer and clear all entries.
   */
  dispose(): void {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
    this.store.clear();
  }

  /** Current number of entries (including possibly expired ones) */
  get size(): number {
    return this.store.size;
  }
}

// ============================================================================
// SINGLETON — shared across the pipeline process
// ============================================================================

let _globalCache: FacetCache | null = null;

/**
 * Get the global facet cache singleton.
 * Lazily created on first access with default config.
 */
export function getGlobalFacetCache(): FacetCache {
  if (!_globalCache) {
    _globalCache = new FacetCache();
    _globalCache.startSweepTimer();
  }
  return _globalCache;
}

/**
 * Replace the global cache (for testing).
 */
export function setGlobalFacetCache(cache: FacetCache): void {
  _globalCache?.dispose();
  _globalCache = cache;
}
