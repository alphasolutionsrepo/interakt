// src/shared/cache/cache-store.ts

/**
 * A cache with expiry, behind an async interface so a shared store (Redis) can implement it
 * when Interakt runs on more than one server. Today's implementation keeps entries in memory,
 * per process, on CacheManager.
 *
 * getOrSet loads a missing entry once, however many callers ask for it at the same time; a
 * failed load is not cached, and a delete made while a load runs keeps its result out.
 */

import { CacheManager } from './cache-manager';

export interface CacheStore<T> {
  /** The cached value, or undefined when there is none (or it expired). */
  get(key: string): Promise<T | undefined>;
  /** The cached value, or load it (once for concurrent callers), cache it for ttlMs and return it. */
  getOrSet(key: string, load: () => Promise<T>, ttlMs: number): Promise<T>;
  /** Cache a value for ttlMs. */
  set(key: string, value: T, ttlMs: number): Promise<void>;
  /** Drop an entry, and any load in flight for it. */
  delete(key: string): Promise<void>;
  /** Drop every entry. */
  clear(): Promise<void>;
}

/**
 * The in-memory CacheStore: at most maxSize entries per process, the oldest dropped first.
 * Values are boxed, so a cached null or undefined (e.g. "no such key") counts as an entry.
 */
export function memoryCacheStore<T>(feature: string, options: { maxSize: number }): CacheStore<T> {
  const cache = new CacheManager(feature, { maxSize: options.maxSize });
  type Box = { value: T };
  return {
    async get(key) {
      return cache.get<Box>(key)?.value;
    },
    async getOrSet(key, load, ttlMs) {
      const box = await cache.getOrSet<Box>(key, async () => ({ value: await load() }), ttlMs);
      return box.value;
    },
    async set(key, value, ttlMs) {
      cache.set<Box>(key, { value }, ttlMs);
    },
    async delete(key) {
      await cache.delete(key);
    },
    async clear() {
      await cache.clear();
    },
  };
}
