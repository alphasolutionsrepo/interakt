// src/features/telemetry/tracing-utils.status.test.ts

/** A step that falls back instead of throwing can still end its span in error, through errorFor. */

import { SpanStatusCode, trace } from '@opentelemetry/api';
import { BasicTracerProvider, InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./telemetry.config', () => ({ isTelemetryEnabled: () => true }));

import { withSpan } from './tracing-utils';

const exporter = new InMemorySpanExporter();
trace.setGlobalTracerProvider(new BasicTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] }));
const statusOf = (name: string) => exporter.getFinishedSpans().find((s) => s.name === name)?.status;

describe('withSpan status', () => {
  it('ends in error with the message errorFor gives for the result, and still returns the result', async () => {
    const result = await withSpan({ name: 'fell-back', errorFor: (r: string) => (r === 'fallback' ? 'Step failed; fell back' : undefined) }, async () => 'fallback');
    expect(result).toBe('fallback');
    expect(statusOf('fell-back')).toEqual({ code: SpanStatusCode.ERROR, message: 'Step failed; fell back' });
  });

  it('ends OK when errorFor finds nothing wrong, or there is no errorFor', async () => {
    await withSpan({ name: 'worked', errorFor: () => undefined }, async () => 'ok');
    await withSpan({ name: 'plain' }, async () => 'ok');
    expect(statusOf('worked')).toEqual({ code: SpanStatusCode.OK });
    expect(statusOf('plain')).toEqual({ code: SpanStatusCode.OK });
  });
});
