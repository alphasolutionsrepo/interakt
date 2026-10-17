// src/features/ai-service/ai-service.stream-cancel.test.ts

/**
 * A caller that goes away (a summary the visitor cancelled) aborts its signal,
 * and the model request stops at once, even while the model is still reading a
 * long prompt and has sent nothing. The stream then just ends: a cancel is not
 * an error, not a failed call in usage analytics, and not something to retry.
 *
 * Runs the real AI service and Ollama adapter; only the network is faked.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const log = vi.hoisted(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }));
vi.mock('@/shared/logger/logger', () => ({ createLogger: () => log }));

const usage = vi.hoisted(() => ({ trackUsage: vi.fn(), updateRealtimeMetrics: vi.fn() }));
vi.mock('./ai-service.analytics', () => usage);

vi.mock('@/features/ai-providers/ai-providers.service', () => ({
  getProviderConfigById: async () => ({
    id: 'prov-1', providerKey: 'ollama', isEnabled: true, baseUrl: 'http://ollama.test', settings: {},
  }),
  getModelById: async () => ({ id: 7, modelKey: 'qwen2.5:14b', capabilities: {} }),
  getProviderByKey: vi.fn(),
  getResolvedDefaults: vi.fn(),
}));

import { streamChat } from './ai-service.service';

const abortError = () => new DOMException('This operation was aborted', 'AbortError');

/** A fetch that answers only when aborted, like a model still reading the prompt */
const silentModel = vi.fn((_url: string, init?: RequestInit) =>
  new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(abortError()));
  }),
);

/** A fetch whose stream sends one word, then waits until aborted */
const oneWordModel = vi.fn(async (_url: string, init?: RequestInit) => {
  const encoder = new TextEncoder();
  let sent = false;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (!sent) {
        sent = true;
        controller.enqueue(encoder.encode('{"message":{"content":"Denim"},"done":false}\n'));
        return;
      }
      return new Promise<void>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          controller.error(abortError());
          reject(abortError());
        });
      });
    },
  });
  return new Response(body);
});

const run = (signal: AbortSignal) =>
  streamChat([{ role: 'user', content: 'Summarize these jackets' }], { providerId: 'prov-1', modelId: 7, signal });

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('cancelling a streaming chat call', () => {
  it('stops the request before the first token and ends without an error', async () => {
    vi.stubGlobal('fetch', silentModel);
    const caller = new AbortController();
    const chunks: unknown[] = [];

    const done = (async () => {
      for await (const chunk of run(caller.signal)) chunks.push(chunk);
    })();
    await vi.waitFor(() => expect(silentModel).toHaveBeenCalled());
    caller.abort();
    await done;

    expect(chunks).toEqual([]);
    expect(silentModel).toHaveBeenCalledOnce(); // not retried
    expect((silentModel.mock.calls[0][1] as RequestInit).signal?.aborted).toBe(true);
    expect(log.error).not.toHaveBeenCalled();
    expect(usage.trackUsage).not.toHaveBeenCalled();
  });

  it('stops the request mid-answer and ends without an error', async () => {
    vi.stubGlobal('fetch', oneWordModel);
    const caller = new AbortController();
    const words: string[] = [];

    for await (const chunk of run(caller.signal)) {
      words.push(chunk.content);
      caller.abort();
    }

    expect(words).toEqual(['Denim']);
    expect(oneWordModel).toHaveBeenCalledOnce();
    expect(log.error).not.toHaveBeenCalled();
    expect(usage.trackUsage).not.toHaveBeenCalled();
  });

  it('still reports a timeout or network failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }); }));

    await expect((async () => {
      for await (const chunk of run(new AbortController().signal)) void chunk;
    })()).rejects.toThrow();
    expect(log.error).toHaveBeenCalled();
  });
});
