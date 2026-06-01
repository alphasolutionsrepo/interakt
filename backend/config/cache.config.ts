// config/cache.config.ts

/**
 * Cache configuration
 * Settings for in-memory cache and feature-specific TTLs
 */

export const cacheConfig = {
  // Cache Provider
  provider: (process.env.CACHE_PROVIDER || 'memory') as 'memory' | 'redis',

  // In-Memory Cache Settings
  memory: {
    maxSize: parseInt(process.env.CACHE_MAX_SIZE || '1000'),
    cleanupIntervalMs: parseInt(process.env.CACHE_CLEANUP_INTERVAL || '300000'), // 5 minutes
  },

  // Redis Settings (if using Redis in future)
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '0'),
    keyPrefix: process.env.REDIS_KEY_PREFIX || 'app:',
    tls: process.env.REDIS_TLS === 'true',
  },

  // Default TTL values (in milliseconds)
  ttl: {
    short: parseInt(process.env.CACHE_TTL_SHORT || '60000'),      // 1 minute
    medium: parseInt(process.env.CACHE_TTL_MEDIUM || '300000'),   // 5 minutes
    long: parseInt(process.env.CACHE_TTL_LONG || '600000'),       // 10 minutes
    veryLong: parseInt(process.env.CACHE_TTL_VERY_LONG || '3600000'), // 1 hour
  },

  // Feature-specific TTLs (in milliseconds)
  features: {
    searchResults: parseInt(process.env.CACHE_TTL_SEARCH_RESULTS || '300000'),      // 5 min
    searchIndexes: parseInt(process.env.CACHE_TTL_SEARCH_INDEXES || '300000'),      // 5 min
    chatConfigs: parseInt(process.env.CACHE_TTL_CHAT_CONFIGS || '300000'),          // 5 min
  },

  // Logging
  logging: {
    logHits: process.env.CACHE_LOG_HITS === 'true',
    logMisses: process.env.CACHE_LOG_MISSES === 'true',
    logOperations: process.env.NODE_ENV === 'development',
  },
} as const;

export type CacheConfig = typeof cacheConfig;