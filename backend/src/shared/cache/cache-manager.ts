// src/shared/cache/cache-manager.ts

/**
 * In-Memory Cache Manager
 * Simple caching with TTL support and race condition protection
 */

import { cacheConfig } from '@/config/cache.config';
import { createLogger } from '@/shared/logger/logger';

const logger = createLogger('cache');

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

interface CacheOptions {
  maxSize?: number;
  defaultTTL?: number;
}

export class CacheManager {
  private cache: Map<string, CacheEntry<any>>;
  private pending: Map<string, Promise<any>>; // ✅ Track in-flight requests
  private maxSize: number;
  private defaultTTL: number;
  private feature: string;

  constructor(feature: string, options: CacheOptions = {}) {
    this.feature = feature;
    this.cache = new Map();
    this.pending = new Map(); // ✅ Initialize pending map
    this.maxSize = options.maxSize || cacheConfig.memory.maxSize;
    this.defaultTTL = options.defaultTTL || cacheConfig.ttl.medium;

    // Setup cleanup interval
    if (cacheConfig.memory.cleanupIntervalMs > 0) {
      setInterval(() => this.cleanup(), cacheConfig.memory.cleanupIntervalMs);
    }
  }

  /**
   * Get value from cache
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);

    if (!entry) {
      if (cacheConfig.logging.logMisses) {
        logger.debug('Cache miss', { feature: this.feature, key });
      }
      return null;
    }

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      if (cacheConfig.logging.logMisses) {
        logger.debug('Cache expired', { feature: this.feature, key });
      }
      return null;
    }

    if (cacheConfig.logging.logHits) {
      logger.debug('Cache hit', { feature: this.feature, key });
    }

    return entry.value as T;
  }

  /**
   * Set value in cache
   */
  set<T>(key: string, value: T, ttl?: number): void {
    // Enforce max size (LRU eviction)
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    const expiresAt = Date.now() + (ttl || this.defaultTTL);

    this.cache.set(key, {
      value,
      expiresAt,
    });

    if (cacheConfig.logging.logOperations) {
      logger.debug('Cache set', { feature: this.feature, key, ttl: ttl || this.defaultTTL });
    }
  }

  /**
   * Delete value from cache
   */
  async delete(key: string): Promise<void> {
    this.cache.delete(key);

    if (cacheConfig.logging.logOperations) {
      logger.debug('Cache deleted', { feature: this.feature, key });
    }
  }

  /**
   * Clear all cache entries
   */
  async clear(): Promise<void> {
    this.cache.clear();
    this.pending.clear(); // ✅ Clear pending requests too

    if (cacheConfig.logging.logOperations) {
      logger.info('Cache cleared', { feature: this.feature });
    }
  }

  /**
   * Get or set pattern with race condition protection
   */
  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    ttl?: number
  ): Promise<T> {
    // Check cache first (synchronous)
    const cached = this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    // ✅ Check if already fetching this key
    const existingPromise = this.pending.get(key);
    if (existingPromise) {
      logger.debug('Waiting for pending request', { feature: this.feature, key });
      return existingPromise;
    }

    // ✅ Create new promise and track it
    const promise = (async () => {
      try {
        const value = await factory();
        this.set(key, value, ttl);
        return value;
      } finally {
        // ✅ Remove from pending when done
        this.pending.delete(key);
      }
    })();

    this.pending.set(key, promise);
    return promise;
  }

  /**
   * Cleanup expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0 && cacheConfig.logging.logOperations) {
      logger.debug('Cache cleanup', { feature: this.feature, cleaned });
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      feature: this.feature,
      size: this.cache.size,
      maxSize: this.maxSize,
      defaultTTL: this.defaultTTL,
      pending: this.pending.size, // ✅ Show pending requests
    };
  }
}