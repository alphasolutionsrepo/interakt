// src/features/telemetry/postgres-span-exporter.ts

/**
 * Custom OpenTelemetry SpanExporter that writes to PostgreSQL.
 *
 * Called by BatchSpanProcessor with batches of completed spans.
 * Uses dynamic import for DB to handle Next.js module isolation.
 * Filters out Next.js internal spans — only exports application spans.
 * Failures are logged but never crash the application.
 */

import type { SpanExporter, ReadableSpan } from '@opentelemetry/sdk-trace-base';
import type { ExportResult } from '@opentelemetry/core';
import { ExportResultCode } from '@opentelemetry/core';
import { createLogger } from '@/shared/logger/logger';
import { ATTR } from './attribute-keys';

const logger = createLogger('postgres-span-exporter');

const SPAN_KINDS = ['INTERNAL', 'SERVER', 'CLIENT', 'PRODUCER', 'CONSUMER'] as const;
const STATUS_CODES = ['UNSET', 'OK', 'ERROR'] as const;

/**
 * Next.js internal span detection.
 * When we register a global TracerProvider, Next.js's own OTel instrumentation
 * sends its internal spans through our exporter. We filter these out.
 */
const NEXTJS_SPAN_PREFIXES = [
  'next.',
  'BaseServer.',
  'NextServer.',
  'NextNodeServer.',
  'AppRender.',
  'ResolveMetadata.',
  'StartServer.',
  'Render.',
];

// Our application spans always use one of these name prefixes
const APP_SPAN_PREFIXES = ['chat.', 'ai.', 'search.', 'tool.', 'pipeline.'];

function isApplicationSpan(span: ReadableSpan): boolean {
  for (const prefix of APP_SPAN_PREFIXES) {
    if (span.name.startsWith(prefix)) return true;
  }
  // Also accept any span that carries alpha.* attributes
  const attrs = span.attributes as Record<string, unknown>;
  return Object.keys(attrs).some((k) => k.startsWith('alpha.'));
}

function isNextJsInternalSpan(span: ReadableSpan): boolean {
  const attrs = span.attributes as Record<string, unknown>;
  if (attrs['next.span_type'] || attrs['next.span_name']) return true;
  for (const prefix of NEXTJS_SPAN_PREFIXES) {
    if (span.name.startsWith(prefix)) return true;
  }
  // Drop any span that isn't a recognised application span (e.g. raw HTTP verb spans
  // like "GET"/"POST" emitted by @opentelemetry/instrumentation-http)
  return !isApplicationSpan(span);
}

export class PostgresSpanExporter implements SpanExporter {
  private _isShutdown = false;

  export(spans: ReadableSpan[], resultCallback: (result: ExportResult) => void): void {
    if (this._isShutdown || spans.length === 0) {
      resultCallback({ code: ExportResultCode.SUCCESS });
      return;
    }

    // Filter out Next.js internal spans — only export application spans
    const appSpans = spans.filter((s) => !isNextJsInternalSpan(s));
    if (appSpans.length === 0) {
      resultCallback({ code: ExportResultCode.SUCCESS });
      return;
    }

    this.writeSpans(appSpans)
      .then(() => resultCallback({ code: ExportResultCode.SUCCESS }))
      .catch((error) => {
        const rootCause = (error as { cause?: Error }).cause;
        logger.error('Failed to export spans', error as Error, {
          count: appSpans.length,
          pgError: rootCause?.message ?? (error as Error).message,
        });
        resultCallback({ code: ExportResultCode.FAILED });
      });
  }

  async shutdown(): Promise<void> {
    this._isShutdown = true;
  }

  async forceFlush(): Promise<void> {
    // No internal buffering — BatchSpanProcessor handles batching
  }

  // ==========================================================================
  // PRIVATE
  // ==========================================================================

  private async writeSpans(spans: ReadableSpan[]): Promise<void> {
    const { analyticsDB } = await import('@/db/index');
    if (!analyticsDB) {
      logger.warn('Analytics DB not configured, dropping spans', { count: spans.length });
      return;
    }

    const { otelSpans } = await import('@/db/analytics-schema/otel-spans.schema');

    const rows = spans.map((span) => this.spanToRow(span)) as (typeof otelSpans.$inferInsert)[];

    await analyticsDB.insert(otelSpans).values(rows);

    logger.debug('Exported spans to PostgreSQL', { count: spans.length });
  }

  private spanToRow(span: ReadableSpan): Record<string, unknown> {
    const attrs = span.attributes as Record<string, unknown>;
    const startMs = hrTimeToMs(span.startTime);
    const endMs = hrTimeToMs(span.endTime);

    return {
      traceId: span.spanContext().traceId,
      spanId: span.spanContext().spanId,
      parentSpanId: span.parentSpanContext?.spanId || null,
      operationName: span.name,
      serviceName: (span.resource.attributes['service.name'] as string) ?? 'alpha-search',
      spanKind: SPAN_KINDS[span.kind] ?? 'INTERNAL',
      startTime: new Date(startMs),
      endTime: new Date(endMs),
      durationMs: Math.round(endMs - startMs),
      statusCode: STATUS_CODES[span.status.code] ?? 'UNSET',
      statusMessage: span.status.message || null,

      // Denormalized fields — use undefined for missing values so Drizzle
      // omits them from the INSERT (avoids passing empty string to uuid columns)
      experienceId: (attrs[ATTR.EXPERIENCE_ID] as string) || undefined,
      experienceType: (attrs[ATTR.EXPERIENCE_TYPE] as string) || undefined,
      pipelineType: (attrs[ATTR.PIPELINE_TYPE] as string) || undefined,
      requestId: (attrs[ATTR.REQUEST_ID] as string) || undefined,
      sessionId: (attrs[ATTR.SESSION_ID] as string) || undefined,

      // Full payloads
      attributes: attrs,
      events: span.events.map((e) => ({
        name: e.name,
        timestamp: new Date(hrTimeToMs(e.time)).toISOString(),
        attributes: (e.attributes as Record<string, unknown>) ?? {},
      })),
    };
  }
}

function hrTimeToMs(hrTime: [number, number]): number {
  return hrTime[0] * 1000 + hrTime[1] / 1_000_000;
}
