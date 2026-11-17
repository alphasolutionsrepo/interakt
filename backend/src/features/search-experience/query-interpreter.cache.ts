// src/features/search-experience/query-interpreter.cache.ts

/**
 * Query Interpreter Caches
 *
 * The interpreter's two CacheManagers plus their invalidation helper.
 *
 * This lives in its own leaf module rather than inside query-interpreter.ts so
 * that search-index can invalidate on a field-config change. The interpreter
 * imports search-index.service, so an import in that direction would be circular;
 * this module imports nothing but the cache manager.
 */

import 'server-only';

import { CacheManager } from '@/shared/cache/cache-manager';

/** Interpretations are per (index, query) and cheap to recompute; 10 minutes is plenty. */
const INTERPRETATION_TTL = 10 * 60 * 1000;

/** Field constraints change only when the index configuration does. */
const CONSTRAINT_TTL = 5 * 60 * 1000;

// Stored on globalThis to survive Next.js module re-evaluation in dev. Without
// this, an invalidation can land on a different CacheManager instance than the
// one serving reads — the cache looks stale no matter how often you clear it.
const interpretationKey = '__queryInterpreterCache';
const constraintKey = '__queryInterpreterFieldCache';
const rewriteKey = '__queryRewriteCache';

export const interpretationCache: CacheManager =
    (globalThis as Record<string, unknown>)[interpretationKey] as CacheManager
    ?? ((globalThis as Record<string, unknown>)[interpretationKey] = new CacheManager('query-interpreter', {
        defaultTTL: INTERPRETATION_TTL,
        maxSize: 1000,
    }));

export const constraintCache: CacheManager =
    (globalThis as Record<string, unknown>)[constraintKey] as CacheManager
    ?? ((globalThis as Record<string, unknown>)[constraintKey] = new CacheManager('query-interpreter-fields', {
        defaultTTL: CONSTRAINT_TTL,
        maxSize: 100,
    }));

/** Search-term rewrites for external sources, per (experience, model, instructions, query). */
export const rewriteCache: CacheManager =
    (globalThis as Record<string, unknown>)[rewriteKey] as CacheManager
    ?? ((globalThis as Record<string, unknown>)[rewriteKey] = new CacheManager('query-rewrite', {
        defaultTTL: INTERPRETATION_TTL,
        maxSize: 1000,
    }));

/**
 * Drop everything the interpreter has cached for one index, after its
 * configuration changes.
 *
 * Both caches have to go. The field constraints are the obvious one, but they are
 * also baked into the prompt that produced each cached interpretation — so an
 * interpretation made before a field became filterable is just as stale as the
 * constraints themselves. Interpretation keys begin with the index id, which is
 * what makes the prefix delete possible.
 */
export async function invalidateQueryInterpreterCache(searchIndexId: string): Promise<void> {
    await Promise.all([
        constraintCache.delete(searchIndexId),
        interpretationCache.deleteByPrefix(`${searchIndexId}:`),
    ]);
}
