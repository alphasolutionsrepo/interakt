// app/settings/cache/_lib/api-client.ts

/**
 * Cache Management API Client
 * Type-safe API calls for cache operations
 */

// ============================================================================
// Types
// ============================================================================

export interface CacheStats {
  feature: string;
  size: number;
  maxSize: number;
  defaultTTL: number;
  pending: number;
}

export interface CacheFeatureInfo {
  id: string;
  name: string;
  description: string;
  endpoint: string;
  icon: 'database' | 'layers' | 'bot';
  color: 'blue' | 'purple' | 'amber';
}

export interface ClearCacheResponse {
  message: string;
}

// ============================================================================
// Feature Definitions
// ============================================================================

export const CACHE_FEATURES: CacheFeatureInfo[] = [
  {
    id: 'search-indexes',
    name: 'Search Indexes',
    description: 'Index configurations, field mappings, and search settings',
    endpoint: '/api/search-indexes/cache',
    icon: 'layers',
    color: 'blue',
  },
  {
    id: 'ai-providers',
    name: 'AI Providers',
    description: 'Provider configurations, models, and system defaults',
    endpoint: '/api/ai-providers/cache',
    icon: 'bot',
    color: 'purple',
  },
];

// ============================================================================
// API Functions
// ============================================================================

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Request failed' }));
    throw new Error(error.message || `HTTP ${response.status}`);
  }
  const json = await response.json();
  return json.data ?? json;
}

/**
 * Get cache statistics for a specific feature
 */
export async function getCacheStats(featureId: string): Promise<CacheStats> {
  const feature = CACHE_FEATURES.find(f => f.id === featureId);
  if (!feature) {
    throw new Error(`Unknown cache feature: ${featureId}`);
  }

  // Handle different endpoint patterns
  let statsUrl = feature.endpoint;
  if (featureId === 'search-indexes') {
    statsUrl = '/api/search-indexes/cache/stats';
  }

  const response = await fetch(statsUrl, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });
  return handleResponse<CacheStats>(response);
}

/**
 * Clear cache for a specific feature
 */
export async function clearCache(featureId: string): Promise<ClearCacheResponse> {
  const feature = CACHE_FEATURES.find(f => f.id === featureId);
  if (!feature) {
    throw new Error(`Unknown cache feature: ${featureId}`);
  }

  // Handle different endpoint patterns
  let clearUrl = feature.endpoint;
  if (featureId === 'search-indexes') {
    clearUrl = '/api/search-indexes/cache/clear';
  }

  const response = await fetch(clearUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  return handleResponse<ClearCacheResponse>(response);
}

/**
 * Get all cache statistics
 */
export async function getAllCacheStats(): Promise<Record<string, CacheStats>> {
  const results: Record<string, CacheStats> = {};

  await Promise.all(
    CACHE_FEATURES.map(async (feature) => {
      try {
        results[feature.id] = await getCacheStats(feature.id);
      } catch (error) {
        // Return empty stats if feature cache is not available
        results[feature.id] = {
          feature: feature.id,
          size: 0,
          maxSize: 1000,
          defaultTTL: 300000,
          pending: 0,
        };
      }
    })
  );

  return results;
}

/**
 * Clear all caches
 */
export async function clearAllCaches(): Promise<void> {
  await Promise.all(
    CACHE_FEATURES.map(feature => clearCache(feature.id))
  );
}

// Export as namespace for convenient importing
export const cacheApi = {
  getCacheStats,
  clearCache,
  getAllCacheStats,
  clearAllCaches,
  CACHE_FEATURES,
};
