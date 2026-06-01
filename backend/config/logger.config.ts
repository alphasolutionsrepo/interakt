// config/logger.config.ts

/**
 * Logger configuration
 * Settings for structured logging
 */

export const loggerConfig = {
  // Log Level
  level: (process.env.LOG_LEVEL || 'info') as 'debug' | 'info' | 'warn' | 'error',

  // Format
  format: (process.env.LOG_FORMAT || 'pretty') as 'json' | 'pretty',

  // Console Output
  console: {
    enabled: process.env.LOG_CONSOLE !== 'false',
    colorize: process.env.NODE_ENV === 'development',
  },

  // File Output
  file: {
    enabled: process.env.LOG_FILE === 'true',
    path: process.env.LOG_FILE_PATH || './logs',
    maxSize: process.env.LOG_FILE_MAX_SIZE || '10m',
    maxFiles: parseInt(process.env.LOG_FILE_MAX_FILES || '5'),
  },

  // Feature-specific logging
  features: {
    database: process.env.LOG_DATABASE === 'true',
    cache: process.env.LOG_CACHE === 'true',
    api: process.env.LOG_API !== 'false', // default true
    performance: process.env.LOG_PERFORMANCE === 'true',
    /**
     * Elasticsearch query logging - shows full request/response bodies
     * Usage: LOG_ES_QUERIES=true npm run dev
     */
    esQueries: process.env.LOG_ES_QUERIES === 'true',
  },

  // Redact sensitive data
  redact: {
    enabled: process.env.NODE_ENV === 'production',
    fields: ['password', 'token', 'apiKey', 'secret', 'authorization'],
  },
} as const;

export type LoggerConfig = typeof loggerConfig;