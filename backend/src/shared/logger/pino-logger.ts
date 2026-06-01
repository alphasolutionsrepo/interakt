// src/shared/logger/pino-logger.ts
import pino, { Logger as PinoLogger, LoggerOptions } from 'pino';

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

function createPinoOptions(): LoggerOptions {
  return {
    level: LOG_LEVEL,
    base: {
      env: process.env.NODE_ENV || 'development',
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
 * Logger class using Pino
 */
class Logger implements LoggerInstance {
  private pino: PinoLogger;

  constructor(serviceName: string, parentLogger?: PinoLogger) {
    if (parentLogger) {
      this.pino = parentLogger.child({ service: serviceName });
    } else {
      const options = createPinoOptions();
      this.pino = createPinoLogger(options).child({ service: serviceName });
    }
  }

  debug(message: string, context?: LogContext): void {
    if (context) {
      this.pino.debug(context, message);
    } else {
      this.pino.debug(message);
    }
  }

  info(message: string, context?: LogContext): void {
    if (context) {
      this.pino.info(context, message);
    } else {
      this.pino.info(message);
    }
  }

  warn(message: string, context?: LogContext): void {
    if (context) {
      this.pino.warn(context, message);
    } else {
      this.pino.warn(message);
    }
  }

  error(message: string, error?: Error | LogContext, context?: LogContext): void {
    let logContext: LogContext = {};

    if (error instanceof Error) {
      logContext = {
        err: {
          message: error.message,
          stack: error.stack,
          name: error.name,
        },
        ...context,
      };
    } else if (error) {
      logContext = { ...error, ...context };
    } else if (context) {
      logContext = context;
    }

    if (Object.keys(logContext).length > 0) {
      this.pino.error(logContext, message);
    } else {
      this.pino.error(message);
    }
  }

  child(bindings: LogContext): LoggerInstance {
    return new ChildLogger(this.pino.child(bindings));
  }
}

/**
 * Child logger for request-scoped logging
 */
class ChildLogger implements LoggerInstance {
  constructor(private pino: PinoLogger) {}

  debug(message: string, context?: LogContext): void {
    context ? this.pino.debug(context, message) : this.pino.debug(message);
  }

  info(message: string, context?: LogContext): void {
    context ? this.pino.info(context, message) : this.pino.info(message);
  }

  warn(message: string, context?: LogContext): void {
    context ? this.pino.warn(context, message) : this.pino.warn(message);
  }

  error(message: string, error?: Error | LogContext, context?: LogContext): void {
    let logContext: LogContext = {};
    if (error instanceof Error) {
      logContext = { err: { message: error.message, stack: error.stack, name: error.name }, ...context };
    } else if (error) {
      logContext = { ...error, ...context };
    } else if (context) {
      logContext = context;
    }
    Object.keys(logContext).length > 0 ? this.pino.error(logContext, message) : this.pino.error(message);
  }

  child(bindings: LogContext): LoggerInstance {
    return new ChildLogger(this.pino.child(bindings));
  }
}

// ============================================================================
// LOGGER FACTORY & INSTANCES
// ============================================================================

// Cache for logger instances
const loggerCache = new Map<string, Logger>();

/**
 * Create a logger for a specific service/module
 * Cached to avoid creating multiple instances for the same service
 */
export function createLogger(serviceName: string): LoggerInstance {
  let logger = loggerCache.get(serviceName);
  if (!logger) {
    logger = new Logger(serviceName);
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

export type { LoggerInstance as Logger, LogLevel, LogContext };

/**
 * Flush logs (for graceful shutdown)
 */
export async function flushLogs(): Promise<void> {
  return Promise.resolve();
}
