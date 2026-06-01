// src/features/search-experience/search-experience.cache.ts

/**
 * Search Experience Cache
 *
 * Caches search experiences with their indexes to avoid repeated database lookups.
 * Provides cache invalidation methods for when experiences or their connected indexes change.
 *
 * Cache Keys:
 * - `token:{accessToken}` - Experience lookup by access token (public API)
 * - `id:{experienceId}` - Experience lookup by ID (admin/internal)
 *
 * Invalidation Triggers:
 * - Search experience created/updated/deleted
 * - Search experience index added/updated/removed
 * - Connected search index updated (name, displayName, isActive, etc.)
 */

import { CacheManager } from '@/shared/cache/cache-manager';
import { cacheConfig } from '@/config/cache.config';
import { createLogger } from '@/shared/logger/logger';
import type { SearchExperienceWithIndexes } from './search-experience.types';

const logger = createLogger('search-experience-cache');

// ============================================================================
// CACHE INSTANCE
// ============================================================================

// Use chatConfigs TTL from config (5 min default)
const cache = new CacheManager('search-experience', {
  defaultTTL: cacheConfig.features.chatConfigs,
  maxSize: 500, // Reasonable limit for search experiences
});

// Track which experiences use which search indexes for reverse invalidation
// Map<searchIndexId, Set<experienceId>>
const indexToExperienceMap = new Map<string, Set<string>>();

// ============================================================================
// CACHE KEYS
// ============================================================================

function tokenKey(accessToken: string): string {
  return `token:${accessToken}`;
}

function idKey(experienceId: string): string {
  return `id:${experienceId}`;
}

// ============================================================================
// CACHE OPERATIONS
// ============================================================================

/**
 * Get experience from cache by access token
 */
export function getByToken(accessToken: string): SearchExperienceWithIndexes | null {
  return cache.get<SearchExperienceWithIndexes>(tokenKey(accessToken));
}

/**
 * Get experience from cache by ID
 */
export function getById(experienceId: string): SearchExperienceWithIndexes | null {
  return cache.get<SearchExperienceWithIndexes>(idKey(experienceId));
}

/**
 * Cache an experience (stores under both token and id keys)
 */
export function set(experience: SearchExperienceWithIndexes): void {
  // Store by both keys
  cache.set(tokenKey(experience.accessToken), experience);
  cache.set(idKey(experience.id), experience);

  // Track index associations for reverse invalidation
  trackIndexAssociations(experience);

  logger.debug('Cached search experience', {
    id: experience.id,
    name: experience.name,
    indexCount: experience.indexes.length,
  });
}

/**
 * Get or fetch experience by access token
 */
export async function getOrFetchByToken(
  accessToken: string,
  fetcher: () => Promise<SearchExperienceWithIndexes | null>
): Promise<SearchExperienceWithIndexes | null> {
  const cacheKey = tokenKey(accessToken);

  // Check cache first
  const cached = cache.get<SearchExperienceWithIndexes>(cacheKey);
  if (cached) {
    return cached;
  }

  // Fetch from DB
  const experience = await fetcher();
  if (experience) {
    set(experience);
  }

  return experience;
}

/**
 * Get or fetch experience by ID
 */
export async function getOrFetchById(
  experienceId: string,
  fetcher: () => Promise<SearchExperienceWithIndexes | null>
): Promise<SearchExperienceWithIndexes | null> {
  const cacheKey = idKey(experienceId);

  // Check cache first
  const cached = cache.get<SearchExperienceWithIndexes>(cacheKey);
  if (cached) {
    return cached;
  }

  // Fetch from DB
  const experience = await fetcher();
  if (experience) {
    set(experience);
  }

  return experience;
}

// ============================================================================
// CACHE INVALIDATION
// ============================================================================

/**
 * Invalidate cache for a specific experience
 * Call when: experience is updated or deleted
 */
export async function invalidateExperience(experienceId: string, accessToken?: string): Promise<void> {
  // Get from cache to find accessToken if not provided
  const cached = cache.get<SearchExperienceWithIndexes>(idKey(experienceId));
  const token = accessToken || cached?.accessToken;

  // Clear both keys
  await cache.delete(idKey(experienceId));
  if (token) {
    await cache.delete(tokenKey(token));
  }

  // Clean up index associations
  cleanupIndexAssociations(experienceId);

  logger.debug('Invalidated search experience cache', { experienceId });
}

/**
 * Invalidate cache for all experiences using a specific search index
 * Call when: search index is updated (name, displayName, isActive, etc.)
 */
export async function invalidateBySearchIndex(searchIndexId: string): Promise<void> {
  const experienceIds = indexToExperienceMap.get(searchIndexId);

  if (!experienceIds || experienceIds.size === 0) {
    return;
  }

  logger.debug('Invalidating experiences by search index', {
    searchIndexId,
    experienceCount: experienceIds.size,
  });

  // Invalidate all affected experiences
  for (const experienceId of experienceIds) {
    await invalidateExperience(experienceId);
  }

  // Clear the mapping for this index
  indexToExperienceMap.delete(searchIndexId);
}

/**
 * Clear entire cache
 * Call when: major system changes or for testing
 */
export async function clearAll(): Promise<void> {
  await cache.clear();
  indexToExperienceMap.clear();
  logger.info('Cleared all search experience cache');
}

// ============================================================================
// INDEX ASSOCIATION TRACKING
// ============================================================================

/**
 * Track which search indexes are used by an experience
 * This enables reverse invalidation when a search index changes
 */
function trackIndexAssociations(experience: SearchExperienceWithIndexes): void {
  // Clean up old associations first
  cleanupIndexAssociations(experience.id);

  // Add new associations
  for (const idx of experience.indexes) {
    let experienceSet = indexToExperienceMap.get(idx.searchIndexId);
    if (!experienceSet) {
      experienceSet = new Set();
      indexToExperienceMap.set(idx.searchIndexId, experienceSet);
    }
    experienceSet.add(experience.id);
  }
}

/**
 * Remove all index associations for an experience
 */
function cleanupIndexAssociations(experienceId: string): void {
  for (const [indexId, experienceSet] of indexToExperienceMap.entries()) {
    experienceSet.delete(experienceId);
    if (experienceSet.size === 0) {
      indexToExperienceMap.delete(indexId);
    }
  }
}

// ============================================================================
// CACHE STATS (for monitoring/debugging)
// ============================================================================

export function getStats() {
  return {
    ...cache.getStats(),
    indexMappings: indexToExperienceMap.size,
  };
}
