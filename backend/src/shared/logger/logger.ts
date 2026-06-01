// src/shared/logger/logger.ts

/**
 * Production-Grade Logger
 *
 * Uses Pino for high-performance structured logging with:
 * - Pretty console output in development
 * - JSON output in production
 * - Optional Axiom cloud logging for log aggregation
 *
 * Environment Variables:
 * - LOG_LEVEL: 'debug' | 'info' | 'warn' | 'error' (default: 'info')
 * - NODE_ENV: 'development' | 'production'
 * - AXIOM_TOKEN: Axiom API token (optional, enables cloud logging)
 * - AXIOM_DATASET: Axiom dataset name (default: 'interakt-logs')
 *
 * Usage:
 *   import { createLogger } from '@/shared/logger/logger';
 *   const logger = createLogger('my-service');
 *   logger.info('Hello world', { userId: 123 });
 */

// Re-export everything from the Pino-based logger
export {
  createLogger,
  logger,
  dbLogger,
  apiLogger,
  cacheLogger,
  searchLogger,
  flushLogs,
  type Logger,
  type LogLevel,
  type LogContext,
} from './pino-logger';