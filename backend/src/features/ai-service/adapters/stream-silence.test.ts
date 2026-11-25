// src/features/ai-service/adapters/stream-silence.test.ts

/**
 * A model that goes quiet partway through a stream ends it with a timeout instead of
 * holding it open. Until the first text the provider's timeout applies (a slow or
 * thinking model takes a while to begin); once text has started, 15 s of silence ends it.
 * Both API styles, through the real adapters and the shared stream reader.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { OllamaAdapter } from './ollama.adapter';
import { OpenAIAdapter } from './openai.adapter';
import {
  parseNDJSONStream,
  parseSSEStream,
  STREAM_SILENCE_AFTER_TEXT_MS,
  StreamSilenceLimit,
  StreamStalledError,
} from './types';

/** A response body that writes each text at its time (ms after the start), then stays open */
function scriptedResponse(script: Array<[number, string]>) {
  const cancel = vi.fn();
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const [at, text] of script) setTimeout(() => controller.enqueue(encoder.encode(text)), at);
    },
    cancel,
  });
  return { response: new Response(body, { status: 200 }), cancel };
}

/** Read a stream in the background: what it yielded, and how and when it ended */
function consume<T>(stream: AsyncIterable<T>) {
  const out = { items: [] as T[], error: undefined as unknown, endedAt: undefined as number | undefined };
  const started = Date.now();
  const done = (async () => {
    try {
      for await (const item of stream) out.items.push(item);
    } catch (error) {
      out.error = error;
    }
    out.endedAt = Date.now() - started;
  })();
  return { out, done };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('StreamSilenceLimit', () => {
  it("allows the provider's timeout until the text starts, then the shorter after-text limit", () => {
    const limit = new StreamSilenceLimit(60_000);
    expect(limit.ms).toBe(60_000);
    limit.markTextStarted();
    expect(limit.ms).toBe(STREAM_SILENCE_AFTER_TEXT_MS);
  });

  it("keeps a provider timeout shorter than the after-text limit", () => {
    const limit = new StreamSilenceLimit(5_000);
    limit.markTextStarted();
    expect(limit.ms).toBe(5_000);
  });
});

describe('the shared stream reader', () => {
  it.each([
    ['SSE', parseSSEStream, 'data: {"a":1}\n\n'],
    ['NDJSON', parseNDJSONStream, '{"a":1}\n'],
  ] as const)('%s: ends a stream that goes quiet with a timeout and closes the response', async (_style, parse, record) => {
    const { response, cancel } = scriptedResponse([[0, record]]);
    const { out, done } = consume(parse(response, 'p', new StreamSilenceLimit(1_000)));

    await vi.advanceTimersByTimeAsync(999);
    expect(out.endedAt).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    await done;

    expect(out.items).toEqual(['{"a":1}']);
    expect(out.error).toBeInstanceOf(StreamStalledError);
    expect((out.error as Error).message).toBe('Stream timed out: no data from the model for 1 s');
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('measures the silence from the last chunk, not from the start', async () => {
    const records = Array.from({ length: 10 }, (_, i): [number, string] => [i * 900, `{"n":${i}}\n`]);
    const { response } = scriptedResponse(records);
    const { out, done } = consume(parseNDJSONStream(response, 'p', new StreamSilenceLimit(1_000)));

    await vi.advanceTimersByTimeAsync(20_000);
    await done;

    expect(out.items).toHaveLength(10);
    expect(out.endedAt).toBe(9 * 900 + 1_000);
  });
});

const config = { baseUrl: 'http://host', apiKey: 'k', modelKey: 'm', timeout: 60_000, settings: {}, capabilities: {} };
const request = { messages: [{ role: 'user' as const, content: 'hi' }] };

const sse = (delta: Record<string, unknown>) =>
  `data: ${JSON.stringify({ choices: [{ index: 0, delta, finish_reason: null }] })}\n\n`;
const ndjson = (message: Record<string, unknown>) =>
  `${JSON.stringify({ model: 'm', message: { role: 'assistant', content: '', ...message }, done: false })}\n`;

const styles = [
  {
    name: 'OpenAI-compatible',
    adapter: () => new OpenAIAdapter(),
    // The role arrives first, with no text
    opening: sse({ role: 'assistant' }),
    text: (t: string) => sse({ content: t }),
  },
  {
    name: 'Ollama',
    adapter: () => new OllamaAdapter(),
    // A thinking model streams its thinking first, with no text
    opening: ndjson({ thinking: 'Let me see' }),
    text: (t: string) => ndjson({ content: t }),
  },
];

describe.each(styles)('$name adapter', ({ adapter, opening, text }) => {
  function stubModel(script: Array<[number, string]>) {
    const scripted = scriptedResponse(script);
    vi.stubGlobal('fetch', vi.fn(async () => scripted.response));
    return scripted;
  }

  it("waits the provider's timeout for the first text, then ends 15 s after the text goes quiet", async () => {
    // Quiet for 40 s before the first word (longer than 15 s), then two words, then nothing
    const { cancel } = stubModel([[0, opening], [40_000, text('Here')], [40_200, text(' are')]]);
    const { out, done } = consume(adapter().streamChat(request, config));

    await vi.advanceTimersByTimeAsync(40_200 + STREAM_SILENCE_AFTER_TEXT_MS - 1);
    expect(out.endedAt).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    await done;

    expect(out.items.map((c) => c.content).join('')).toBe('Here are');
    expect(out.error).toBeInstanceOf(StreamStalledError);
    expect((out.error as Error).message).toBe('Stream timed out: no data from the model for 15 s');
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("ends a stream with no text after the provider's timeout", async () => {
    const { cancel } = stubModel([[0, opening]]);
    const { out, done } = consume(adapter().streamChat(request, config));

    await vi.advanceTimersByTimeAsync(59_999);
    expect(out.endedAt).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    await done;

    expect(out.items).toEqual([]);
    expect((out.error as Error).message).toBe('Stream timed out: no data from the model for 60 s');
    expect(cancel).toHaveBeenCalledOnce();
  });
});
