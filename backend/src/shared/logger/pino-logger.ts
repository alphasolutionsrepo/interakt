// src/shared/logger/pino-logger.ts
import pino, { Logger as PinoLogger, LoggerOptions } from 'pino';

import { serializeError } from '@/shared/errors/error-detail';

/**
 * Production-Grade Logger using Pino
 *
 * Features:
 * - Fast, low-overhead structured logging
 * - Pretty console output in development
 * - JSON output in production
 *
 * Note: This module requires serverExternalPackages config in next.config.ts
 * to prevent bundler issues with pino's Node.js-specific dependencies.
 *
 * Environment Variables:
 * - LOG_LEVEL: 'debug' | 'info' | 'warn' | 'error' (default: 'info')
 * - NODE_ENV: 'development' | 'production'
 */

// ============================================================================
// FIX: Increase max listeners for development hot reload
// In dev mode, Next.js hot reloads modules frequently, creating new logger
// instances. This increases the limit to prevent false memory leak warnings.
// ============================================================================
// Use indirect access to avoid Next.js Edge Runtime static analysis flagging process.stdout
declare const EdgeRuntime: string | undefined;
if (typeof EdgeRuntime === 'undefined' && process.env.NODE_ENV === 'development') {
  const proc = globalThis.process as NodeJS.Process | undefined;
  const out = proc?.['stdout' as keyof NodeJS.Process] as NodeJS.WriteStream | undefined;
  const err = proc?.['stderr' as keyof NodeJS.Process] as NodeJS.WriteStream | undefined;
  if (out?.setMaxListeners) out.setMaxListeners(50);
  if (err?.setMaxListeners) err.setMaxListeners(50);
}

// ============================================================================
// TYPES
// ============================================================================

type LogLevel = 'debug' | 'info' | 'warn' | 'error';
type LogContext = Record<string, unknown>;

interface LoggerInstance {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, error?: Error | LogContext, context?: LogContext): void;
  child(bindings: LogContext): LoggerInstance;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const LOG_LEVEL = (process.env.LOG_LEVEL || 'info') as LogLevel;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// ============================================================================
// PINO CONFIGURATION
// ============================================================================

export function createPinoOptions(): LoggerOptions {
  return {
    level: LOG_LEVEL,
    base: {
      env: process.env.NODE_ENV || 'development',
    },
    // Defensive redaction: if a secret/credential is ever passed in a log
    // context, replace it with [Redacted] rather than emitting it in clear text.
    redact: {
      paths: [
        'apiKey',
        'apiKeySecret',
        'password',
        'token',
        'accessToken',
        'secret',
        'authorization',
        '*.apiKey',
        '*.apiKeySecret',
        '*.password',
        '*.token',
        '*.accessToken',
        '*.secret',
        '*.authorization',
        'headers.authorization',
        'req.headers.authorization',
        'req.headers.cookie',
      ],
      censor: '[Redacted]',
    },
    // An error logged as err keeps its causes and the provider's response, secrets left out.
    // Many call sites log it as error: an Error there is expanded the same way (it would
    // otherwise print as {}), and a message string is left as it is.
    serializers: {
      err: serializeError,
      error: (value: unknown) => (value instanceof Error ? serializeError(value) : value),
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level: (label) => ({ level: label }),
      bindings: (bindings) => ({
        ...bindings,
        pid: undefined,
        hostname: undefined,
      }),
    },
  };
}

/**
 * Singleton root Pino logger instance
 * Reused across all service loggers to prevent creating multiple instances
 * and avoid EventEmitter memory leak warnings in development
 */
let rootPinoInstance: PinoLogger | null = null;

/**
 * Creates a Pino logger with appropriate destination
 * - Development: Pretty-printed colored output
 * - Production: JSON output to stdout
 */
function createPinoLogger(options: LoggerOptions): PinoLogger {
  // Return cached instance if it exists
  if (rootPinoInstance) {
    return rootPinoInstance;
  }

  // Development: Use pino-pretty for readable output
  if (!IS_PRODUCTION) {
    rootPinoInstance = pino({
      ...options,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss',
          ignore: 'pid,hostname,env',
          messageFormat: '{if service}[{service}] {end}{msg}',
        },
      },
    });
    return rootPinoInstance;
  }

  // Production: JSON to stdout
  rootPinoInstance = pino(options);
  return rootPinoInstance;
}

// ============================================================================
// LOGGER WRAPPER
// ============================================================================

/**
 * A service's logger over pino. An error passed to error() is logged as err, which
 * the err serializer above expands.
 */
export class ServiceLogger implements LoggerInstance {
  constructor(private readonly pino: PinoLogger) {}

  debug(message: string, context?: LogContext): void {
    this.write('debug', message, context);
  }

  info(message: string, context?: LogContext): void {
    this.write('info', message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.write('warn', message, context);
  }

  error(message: string, error?: Error | LogContext, context?: LogContext): void {
    const fields = error instanceof Error ? { err: error } : error;
    this.write('error', message, fields || context ? { ...fields, ...context } : undefined);
  }

  child(bindings: LogContext): LoggerInstance {
    return new ServiceLogger(this.pino.child(bindings));
  }

  private write(level: LogLevel, message: string, context?: LogContext): void {
    if (context && Object.keys(context).length > 0) {
      this.pino[level](context, message);
    } else {
      this.pino[level](message);
    }
  }
}

// ============================================================================
// LOGGER FACTORY & INSTANCES
// ============================================================================

// Cache for logger instances
const loggerCache = new Map<string, ServiceLogger>();

/**
 * Create a logger for a specific service/module
 * Cached to avoid creating multiple instances for the same service
 */
export function createLogger(serviceName: string): LoggerInstance {
  let logger = loggerCache.get(serviceName);
  if (!logger) {
    logger = new ServiceLogger(createPinoLogger(createPinoOptions()).child({ service: serviceName }));
    loggerCache.set(serviceName, logger);
  }
  return logger;
}

/**
 * Default logger instance
 */
export const logger = createLogger('app');

/**
 * Pre-configured loggers for common services
 */
export const dbLogger = createLogger('database');
export const apiLogger = createLogger('api');
export const cacheLogger = createLogger('cache');
export const searchLogger = createLogger('search');

// ============================================================================
// EXPORTS
// ============================================================================

export type { LogLevel, LogContext };

/**
 * Flush logs (for graceful shutdown)
 */
export async function flushLogs(): Promise<void> {
  return Promise.resolve();
}
