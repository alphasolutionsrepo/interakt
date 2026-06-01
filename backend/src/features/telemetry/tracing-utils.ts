// src/features/telemetry/tracing-utils.ts

/**
 * Tracing Utilities
 *
 * Universal API for instrumenting any feature with OpenTelemetry spans.
 * Two main functions:
 * - withSpan()       — wrap any async function in a span
 * - withStreamSpan() — wrap an AsyncGenerator in a span that lives across its lifecycle
 *
 * When telemetry is disabled (globally or for a specific experience),
 * these functions take a fast path: run the function directly, zero OTel overhead.
 */

import {
  trace,
  context,
  ROOT_CONTEXT,
  SpanKind,
  SpanStatusCode,
  type Tracer,
  type Span,
} from '@opentelemetry/api';
import { isTelemetryEnabled } from './telemetry.config';
import type { SpanOptions, StreamSpanOptions } from './telemetry.types';

// ============================================================================
// TRACER MANAGEMENT
// ============================================================================

const TRACER_CACHE = new Map<string, Tracer>();
const DEFAULT_TRACER_NAME = 'alpha-search';

/**
 * Get a named tracer (cached).
 */
export function getTracer(name: string = DEFAULT_TRACER_NAME, version?: string): Tracer {
  const key = `${name}@${version ?? ''}`;
  let t = TRACER_CACHE.get(key);
  if (!t) {
    t = trace.getTracer(name, version);
    TRACER_CACHE.set(key, t);
  }
  return t;
}

// ============================================================================
// NON-RECORDING SPAN (for disabled telemetry)
// ============================================================================

// When telemetry is disabled, we pass a no-op span to the callback.
// OTel's API provides a non-recording span via getTracer().startSpan() when
// no provider is registered, but to be explicit we use this constant.
// Use ROOT_CONTEXT so this span is never parented to an active request span
const NOOP_SPAN = trace.getTracer('noop').startSpan('noop', {}, ROOT_CONTEXT);
NOOP_SPAN.end();

// ============================================================================
// withSpan — Wrap an async function in a span
// ============================================================================

/**
 * Execute a function within an OTel span.
 *
 * - Automatically sets span status on success/error
 * - Records exception events on error
 * - Zero overhead when telemetry is disabled
 *
 * @example
 * const result = await withSpan(
 *   { name: 'search.execute', experienceId, attributes: { [ATTR.SEARCH_QUERY]: query } },
 *   async (span) => {
 *     const result = await provider.search(request);
 *     span.setAttribute(ATTR.SEARCH_TOTAL_RESULTS, result.total);
 *     return result;
 *   }
 * );
 */
export async function withSpan<T>(
  options: SpanOptions,
  fn: (span: Span) => Promise<T>
): Promise<T> {
  if (!isTelemetryEnabled(options.experienceId)) {
    return fn(NOOP_SPAN);
  }

  const tracer = getTracer();

  return tracer.startActiveSpan(
    options.name,
    {
      kind: options.kind ?? SpanKind.INTERNAL,
      attributes: options.attributes,
    },
    async (span) => {
      try {
        const result = await fn(span);
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error instanceof Error ? error.message : 'Unknown error',
        });
        span.recordException(error as Error);
        throw error;
      } finally {
        span.end();
      }
    }
  );
}

/**
 * Synchronous version of withSpan.
 */
export function withSpanSync<T>(options: SpanOptions, fn: (span: Span) => T): T {
  if (!isTelemetryEnabled(options.experienceId)) {
    return fn(NOOP_SPAN);
  }

  const tracer = getTracer();
  const span = tracer.startSpan(options.name, {
    kind: options.kind ?? SpanKind.INTERNAL,
    attributes: options.attributes,
  });

  try {
    const result = context.with(trace.setSpan(context.active(), span), () => fn(span));
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (error) {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error instanceof Error ? error.message : 'Unknown error',
    });
    span.recordException(error as Error);
    throw error;
  } finally {
    span.end();
  }
}

// ============================================================================
// withStreamSpan — Wrap an AsyncGenerator in a span
// ============================================================================

/**
 * Wrap an async generator with a span that lives across the generator lifecycle.
 *
 * Critical for streaming chat: the span starts before the first yield
 * and ends after the generator completes or throws.
 *
 * @example
 * yield* withStreamSpan(
 *   { name: 'ai.stream_chat', attributes: { ... } },
 *   async function*(span) {
 *     for await (const chunk of adapter.streamChat(req, cfg)) {
 *       if (chunk.done) {
 *         span.setAttribute(ATTR.AI_TOTAL_TOKENS, chunk.usage?.totalTokens ?? 0);
 *       }
 *       yield chunk;
 *     }
 *   }
 * );
 */
export async function* withStreamSpan<T>(
  options: StreamSpanOptions,
  generatorFn: (span: Span) => AsyncGenerator<T, void, unknown>
): AsyncGenerator<T, void, unknown> {
  if (!isTelemetryEnabled(options.experienceId)) {
    yield* generatorFn(NOOP_SPAN);
    return;
  }

  const tracer = getTracer();
  const span = tracer.startSpan(options.name, {
    kind: options.kind ?? SpanKind.INTERNAL,
    attributes: options.attributes,
  });

  // Make this span the active context for the generator's execution
  const ctx = trace.setSpan(context.active(), span);

  try {
    const gen = context.with(ctx, () => generatorFn(span));

    for await (const value of gen) {
      if (options.onChunk) {
        const chunkAttrs = options.onChunk(value);
        if (chunkAttrs) {
          for (const [k, v] of Object.entries(chunkAttrs)) {
            span.setAttribute(k, v);
          }
        }
      }
      yield value;
    }

    if (options.onComplete) {
      const finalAttrs = options.onComplete();
      if (finalAttrs) {
        for (const [k, v] of Object.entries(finalAttrs)) {
          span.setAttribute(k, v);
        }
      }
    }

    span.setStatus({ code: SpanStatusCode.OK });
  } catch (error) {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error instanceof Error ? error.message : 'Unknown error',
    });
    span.recordException(error as Error);
    throw error;
  } finally {
    span.end();
  }
}

// ============================================================================
// Helpers — enrich the current active span
// ============================================================================

/**
 * Add attributes to the currently active span (if any).
 * No-op if no active span exists.
 */
export function addSpanAttributes(attributes: Record<string, string | number | boolean>): void {
  const span = trace.getActiveSpan();
  if (!span) return;
  for (const [k, v] of Object.entries(attributes)) {
    span.setAttribute(k, v);
  }
}

/**
 * Record a named event on the currently active span.
 */
export function addSpanEvent(
  name: string,
  attributes?: Record<string, string | number | boolean>
): void {
  const span = trace.getActiveSpan();
  if (!span) return;
  span.addEvent(name, attributes);
}
