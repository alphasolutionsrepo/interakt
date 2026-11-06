// src/shared/logger/pino-logger.ts
import pino, { Logger as PinoLogger, LoggerOptions } from 'pino';

import { isSpanContextValid, trace } from '@opentelemetry/api';
import {
  ATTR_ERROR_TYPE,
  ATTR_EXCEPTION_MESSAGE,
  ATTR_EXCEPTION_STACKTRACE,
  ATTR_EXCEPTION_TYPE,
} from '@opentelemetry/semantic-conventions';

import { redactLogFields, scrubCredentials, serializeError } from '@/shared/errors/error-detail';

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

/**
 * json is what log tools read (production); pretty is for people (development). Every
 * line has credentials left out of its message and fields, and an error is expanded
 * with its causes and the provider's response.
 */
export function createPinoOptions(format: 'json' | 'pretty' = IS_PRODUCTION ? 'json' : 'pretty'): LoggerOptions {
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
    // The trace a JSON line was written in, so a log tool links the line to the trace
    ...(format === 'json' && { mixin: traceFields }),
    // The log formatter below has expanded errors already; pino's own err serializer
    // would rewrite them (message and stack joined with the cause's)
    serializers: { err: expanded, error: expanded },
    hooks: {
      logMethod(args, method) {
        method.apply(this, args.map((arg) => (typeof arg === 'string' ? scrubCredentials(arg) : arg)) as Parameters<typeof method>);
      },
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level: (label) => ({ level: label }),
      bindings: (bindings) => ({
        ...bindings,
        pid: undefined,
        hostname: undefined,
      }),
      // Many call sites log the error as error rather than err: both are expanded, and a
      // message string or plain object there is left as it is (credentials aside)
      log: (fields) => {
        // Logging never throws. A value that can't be read is marked by redactLogFields;
        // this is for anything else, so the line is still written
        try {
          return format === 'json' ? withExceptionFields(fields, redactLogFields(fields)) : redactLogFields(fields);
        } catch {
          return { logFields: '[Unreadable]' };
        }
      },
    },
  };
}

/**
 * The active span's ids under the names OpenTelemetry's pino instrumentation uses
 * (trace_id, span_id, trace_flags); nothing outside a trace.
 */
function traceFields(): Record<string, string> {
  const spanContext = trace.getActiveSpan()?.spanContext();
  if (!spanContext || !isSpanContextValid(spanContext)) return {};
  return {
    trace_id: spanContext.traceId,
    span_id: spanContext.spanId,
    trace_flags: spanContext.traceFlags.toString(16).padStart(2, '0'),
  };
}

function expanded(value: unknown): unknown {
  return value instanceof Error ? serializeError(value) : value;
}

/**
 * The error of a log line under OpenTelemetry's names (exception.type, exception.message,
 * exception.stacktrace, error.type), so a log tool reads it without knowing our format.
 * err keeps what those names have no place for: the causes and the provider's response.
 * https://opentelemetry.io/docs/specs/semconv/exceptions/exceptions-logs/
 */
function withExceptionFields(fields: Record<string, unknown>, redacted: Record<string, unknown>): Record<string, unknown> {
  const key = ['err', 'error'].find((k) => fields[k] instanceof Error);
  if (!key) return redacted;
  const written = redacted[key];
  if (written === null || typeof written !== 'object') return redacted;
  const { stack, ...expanded } = written as Record<string, unknown>;
  return {
    [ATTR_EXCEPTION_TYPE]: expanded.name,
    [ATTR_EXCEPTION_MESSAGE]: expanded.message,
    [ATTR_EXCEPTION_STACKTRACE]: stack,
    [ATTR_ERROR_TYPE]: typeof expanded.code === 'string' ? expanded.code : expanded.name,
    ...redacted,
    [key]: expanded,
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
 * the log formatter above expands.
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

  // Here: pino doesn't run its bindings formatter on a child's fields
  child(bindings: LogContext): LoggerInstance {
    return new ServiceLogger(this.pino.child(redactLogFields(bindings)));
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
