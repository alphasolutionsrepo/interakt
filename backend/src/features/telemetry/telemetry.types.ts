// src/features/telemetry/telemetry.types.ts

/**
 * OpenTelemetry Types for Alpha Search
 */

import type { SpanKind } from '@opentelemetry/api';

/**
 * Telemetry detail level controls what data is recorded in spans:
 * - 'off': No spans are recorded
 * - 'metadata': Spans record timing, status, tokens, and operation names — but NOT user messages or AI responses
 * - 'full': Spans record everything including user messages and AI response content
 */
export type TelemetryDetailLevel = 'off' | 'metadata' | 'full';

/** Configuration for the telemetry system */
export interface TelemetryConfig {
  enabled: boolean;
  serviceName: string;
  serviceVersion: string;
  environment: string;

  /** Exporter type (extensible for future OTLP support) */
  exporterType: 'postgres';

  /** BatchSpanProcessor configuration */
  batchConfig: {
    maxQueueSize: number;
    maxExportBatchSize: number;
    scheduledDelayMillis: number;
    exportTimeoutMillis: number;
  };

  /** Per-experience telemetry detail level overrides */
  experienceOverrides: Map<string, TelemetryDetailLevel>;
}

/** Options for withSpan utility */
export interface SpanOptions {
  name: string;
  kind?: SpanKind;
  attributes?: Record<string, string | number | boolean>;
  /** If set, telemetry is only active if enabled for this experience */
  experienceId?: string;
}

/** Options for withStreamSpan (async generator wrapping) */
export interface StreamSpanOptions extends SpanOptions {
  /** Called on each yielded chunk to extract incremental attributes */
  onChunk?: (chunk: unknown) => Record<string, string | number | boolean> | undefined;
  /** Called when stream completes to set final attributes */
  onComplete?: () => Record<string, string | number | boolean> | undefined;
}
