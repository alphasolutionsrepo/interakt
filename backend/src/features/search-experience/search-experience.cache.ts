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
 * - Connected external data source updated or deleted (name, isActive, config)
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

// Which cached experiences use which search indexes and external data sources,
// so a change to one drops every experience that carries its details.
// Map<dependencyKey, Set<experienceId>>
const dependents = new Map<string, Set<string>>();

const indexDependency = (searchIndexId: string) => `index:${searchIndexId}`;
const sourceDependency = (dataSourceId: string) => `source:${dataSourceId}`;

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

  trackDependencies(experience);

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

  forgetDependencies(experienceId);

  logger.debug('Invalidated search experience cache', { experienceId });
}

/**
 * Invalidate cache for all experiences using a specific search index
 * Call when: search index is updated (name, displayName, isActive, etc.)
 */
export async function invalidateBySearchIndex(searchIndexId: string): Promise<void> {
  await invalidateDependents(indexDependency(searchIndexId));
}

/**
 * Invalidate cache for all experiences searching a specific external data source
 * Call when: data source is updated (name, isActive, config) or deleted
 */
export async function invalidateByDataSource(dataSourceId: string): Promise<void> {
  await invalidateDependents(sourceDependency(dataSourceId));
}

async function invalidateDependents(dependency: string): Promise<void> {
  const experienceIds = [...(dependents.get(dependency) ?? [])];
  if (experienceIds.length === 0) return;

  logger.debug('Invalidating experiences by dependency', { dependency, experienceCount: experienceIds.length });

  for (const experienceId of experienceIds) {
    await invalidateExperience(experienceId);
  }
}

/**
 * Clear entire cache
 * Call when: major system changes or for testing
 */
export async function clearAll(): Promise<void> {
  await cache.clear();
  dependents.clear();
  logger.info('Cleared all search experience cache');
}

// ============================================================================
// DEPENDENCY TRACKING
// ============================================================================

/** Record the indexes and external data sources an experience uses. */
function trackDependencies(experience: SearchExperienceWithIndexes): void {
  forgetDependencies(experience.id);

  const keys = [
    ...experience.indexes.map((idx) => indexDependency(idx.searchIndexId)),
    ...(experience.externalSources ?? []).map((src) => sourceDependency(src.dataSourceId)),
  ];
  for (const key of keys) {
    let experienceIds = dependents.get(key);
    if (!experienceIds) {
      experienceIds = new Set();
      dependents.set(key, experienceIds);
    }
    experienceIds.add(experience.id);
  }
}

/** Remove an experience from every dependency it was recorded under. */
function forgetDependencies(experienceId: string): void {
  for (const [key, experienceIds] of dependents.entries()) {
    experienceIds.delete(experienceId);
    if (experienceIds.size === 0) {
      dependents.delete(key);
    }
  }
}

// ============================================================================
// CACHE STATS (for monitoring/debugging)
// ============================================================================

export function getStats() {
  return {
    ...cache.getStats(),
    dependencies: dependents.size,
  };
}
