// src/features/search-index/search-index.cache.ts

/**
 * Search Index Cache
 *
 * The shared CacheManager for search index reads, plus its invalidation helpers.
 *
 * This lives in its own leaf module rather than inside search-index.service.ts so
 * that search-index-fields.service.ts can invalidate too. The service already
 * imports the fields service, so a fields → service import would be circular.
 */

import 'server-only';

import { CacheManager } from '@/shared/cache/cache-manager';
import { cacheConfig } from '@/config/cache.config';

// Cache TTL - use config or default to 5 minutes
export const SEARCH_INDEX_CACHE_TTL = cacheConfig.features?.searchIndexes ?? 300;

// Store cache on globalThis to survive Next.js module re-evaluation in dev mode.
// Without this, delete and list calls can hit different CacheManager instances.
const globalKey = '__searchIndexCache';

export const cache: CacheManager = (globalThis as Record<string, unknown>)[globalKey] as CacheManager
    ?? ((globalThis as Record<string, unknown>)[globalKey] = new CacheManager('search-index', {
        defaultTTL: SEARCH_INDEX_CACHE_TTL,
    }));

/**
 * Clear cache for a specific index.
 *
 * Both keys must go: reads happen by id and by name, and leaving either behind
 * serves a stale index definition — including a field that was just deleted.
 */
export async function clearIndexCache(id: string, name: string): Promise<void> {
    await Promise.all([
        cache.delete(`index:${id}`),
        cache.delete(`index:name:${name}`),
    ]);
}

/**
 * Clear the by-id cache entry when the index name is not to hand.
 *
 * Prefer clearIndexCache() — the by-name entry survives this call.
 */
export async function clearIndexCacheById(id: string): Promise<void> {
    await cache.delete(`index:${id}`);
}
