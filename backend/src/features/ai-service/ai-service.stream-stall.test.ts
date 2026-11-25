// src/features/ai-service/ai-service.stream-stall.test.ts

/**
 * A model that stops writing partway through an answer, with the connection left open:
 * 15 s after its last word the stream ends with a timeout. The connection to the model
 * is closed, the call is recorded as failed, and its trace says it timed out. The words
 * already sent reach the caller first; the stream isn't retried (that would repeat them).
 * A model that sends no text ends after the provider's timeout, once: not retried either,
 * since a retry would make the caller wait that long again.
 *
 * Runs the real AI service and both adapters (Ollama-native and OpenAI-compatible);
 * only the network is faked.
 */

import { SpanStatusCode, trace } from '@opentelemetry/api';
import { BasicTracerProvider, InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const log = vi.hoisted(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }));
vi.mock('@/shared/logger/logger', () => ({ createLogger: () => log }));

const usage = vi.hoisted(() => ({ trackUsage: vi.fn(), updateRealtimeMetrics: vi.fn() }));
vi.mock('./ai-service.analytics', () => usage);
vi.mock('@/features/telemetry/telemetry.config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/telemetry/telemetry.config')>()),
  isTelemetryEnabled: () => true,
}));

const provider = vi.hoisted(() => ({ key: 'ollama' }));
vi.mock('@/features/ai-providers/ai-providers.service', () => ({
  getProviderConfigById: async () => ({
    id: 'prov-1', providerKey: provider.key, isEnabled: true, baseUrl: 'http://model.test', settings: {},
  }),
  getModelById: async () => ({ id: 7, modelKey: 'qwen2.5:14b', capabilities: {} }),
  getProviderByKey: vi.fn(),
  getResolvedDefaults: vi.fn(),
}));

import { StreamStalledError } from './adapters';
import { resetCircuit } from './ai-service.resilience';
import { streamChat } from './ai-service.service';

const exporter = new InMemorySpanExporter();
trace.setGlobalTracerProvider(new BasicTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] }));

/** Two streamed words in each API style */
const twoWords = {
  ollama: '{"message":{"content":"Here"},"done":false}\n{"message":{"content":" are"},"done":false}\n',
  openai: 'data: {"choices":[{"delta":{"content":"Here"},"finish_reason":null}]}\n\n'
    + 'data: {"choices":[{"delta":{"content":" are"},"finish_reason":null}]}\n\n',
};

/** The start of an answer with no text: Ollama's thinking, the OpenAI role */
const noText = {
  ollama: '{"message":{"content":"","thinking":"Hmm"},"done":false}\n',
  openai: 'data: {"choices":[{"delta":{"role":"assistant"},"finish_reason":null}]}\n\n',
};

/** A model that sends `opening` (two words by default), then nothing, with the connection open; records the close */
function stallingModel(opening: Record<string, string> = twoWords) {
  const closed = vi.fn();
  const fetch = vi.fn(async () => new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(opening[provider.key]));
    },
    cancel: closed,
  })));
  vi.stubGlobal('fetch', fetch);
  return { fetch, closed };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  resetCircuit('prov-1');
  exporter.reset();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('a model that goes quiet partway through a streamed answer', () => {
  it.each(['ollama', 'openai'])('ends the stream 15 s after the last word (%s API style)', async (key) => {
    provider.key = key;
    const model = stallingModel();
    const words: string[] = [];
    let failure: unknown;
    const reading = (async () => {
      try {
        for await (const chunk of streamChat([{ role: 'user', content: 'Summarize' }], { providerId: 'prov-1', modelId: 7 })) {
          words.push(chunk.content);
        }
      } catch (error) {
        failure = error;
      }
    })();

    await vi.advanceTimersByTimeAsync(14_999);
    expect(failure).toBeUndefined();
    expect(model.closed).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await reading;

    expect(words.join('')).toBe('Here are');
    expect(failure).toBeInstanceOf(StreamStalledError);
    expect(model.closed).toHaveBeenCalledOnce();
    expect(model.fetch).toHaveBeenCalledOnce(); // not retried
    expect(usage.trackUsage).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    const [span] = exporter.getFinishedSpans().filter((s) => s.name === 'ai.stream_chat');
    expect(span.status).toMatchObject({ code: SpanStatusCode.ERROR, message: 'Stream timed out: no data from the model for 15 s' });
  });

  it.each(['ollama', 'openai'])("ends a stream with no text after the provider's timeout, without a retry (%s API style)", async (key) => {
    provider.key = key;
    const model = stallingModel(noText);
    let failure: unknown;
    const reading = (async () => {
      try {
        for await (const chunk of streamChat([{ role: 'user', content: 'Summarize' }], { providerId: 'prov-1', modelId: 7 })) void chunk;
      } catch (error) {
        failure = error;
      }
    })();

    // The default provider timeout
    await vi.advanceTimersByTimeAsync(60_000);
    await reading;

    expect(failure).toBeInstanceOf(StreamStalledError);
    expect((failure as Error).message).toBe('Stream timed out: no data from the model for 60 s');
    expect(model.fetch).toHaveBeenCalledOnce();
    expect(model.closed).toHaveBeenCalledOnce();
  });
});
