// src/features/ai-service/ai-service.analytics.trace.test.ts

/**
 * AI usage is written by a timer that the first AI call starts. Its writes are no part of
 * that call's request, so they run outside its trace: a failed write must not be logged
 * (or traced) as part of a request that ended long ago.
 */

import { trace } from '@opentelemetry/api';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { afterEach, describe, expect, it, vi } from 'vitest';

const spanWhenWritten: Array<string | undefined> = [];
vi.mock('@/features/analytics', () => ({
  trackAI: () => spanWhenWritten.push(trace.getActiveSpan()?.spanContext().traceId),
}));

import { stopAnalyticsFlush, trackUsage } from './ai-service.analytics';

const provider = new NodeTracerProvider();
provider.register();

afterEach(() => {
  stopAnalyticsFlush();
  vi.restoreAllMocks();
});

describe('the AI usage writer', () => {
  it('writes outside the trace of the request that started it', async () => {
    const realSetInterval = globalThis.setInterval;
    vi.spyOn(globalThis, 'setInterval').mockImplementation(((run: () => void) => realSetInterval(run, 5)) as typeof setInterval);

    const requestTrace = await provider.getTracer('test').startActiveSpan('POST /api/v1/chat', async (span) => {
      await trackUsage({
        requestId: 'r1', operation: 'chat', providerId: 'p1', providerKey: 'ollama', modelId: 1, modelKey: 'm',
        inputTokens: 1, outputTokens: 1, totalTokens: 2, durationMs: 10, success: true,
      });
      span.end();
      return span.spanContext().traceId;
    });
    await vi.waitFor(() => expect(spanWhenWritten).toHaveLength(1));

    expect(requestTrace).toMatch(/^[0-9a-f]{32}$/);
    expect(spanWhenWritten).toEqual([undefined]);
  });

  it('writes a full batch outside the trace of the request that filled it', async () => {
    spanWhenWritten.length = 0;
    await provider.getTracer('test').startActiveSpan('POST /api/v1/chat', async (span) => {
      for (let i = 0; i < 50; i++) {
        await trackUsage({
          requestId: `r${i}`, operation: 'chat', providerId: 'p1', providerKey: 'ollama', modelId: 1, modelKey: 'm',
          inputTokens: 1, outputTokens: 1, totalTokens: 2, durationMs: 10, success: true,
        });
      }
      span.end();
    });

    expect(spanWhenWritten).toHaveLength(50);
    expect(spanWhenWritten.every((t) => t === undefined)).toBe(true);
  });
});
