// src/features/ai-service/ai-service.stream-cancel.test.ts

/**
 * A caller that goes away (a summary the visitor cancelled) aborts its signal,
 * and the model request stops at once, even while the model is still reading a
 * long prompt and has sent nothing. The stream then just ends: a cancel is not
 * an error, not a failed call in usage analytics, and not something to retry.
 * The work the model did up to the cancel is still recorded in usage, as a
 * cancelled call with estimated tokens.
 *
 * Runs the real AI service and both adapters (Ollama-native and OpenAI-compatible);
 * only the network is faked.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const log = vi.hoisted(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }));
vi.mock('@/shared/logger/logger', () => ({ createLogger: () => log }));

const usage = vi.hoisted(() => ({ trackUsage: vi.fn(), updateRealtimeMetrics: vi.fn() }));
vi.mock('./ai-service.analytics', () => usage);

const provider = vi.hoisted(() => ({ key: 'ollama' }));
vi.mock('@/features/ai-providers/ai-providers.service', () => ({
  getProviderConfigById: async () => ({
    id: 'prov-1', providerKey: provider.key, isEnabled: true, baseUrl: 'http://model.test', settings: {},
  }),
  getModelById: async () => ({ id: 7, modelKey: 'qwen2.5:14b', capabilities: {} }),
  getProviderByKey: vi.fn(),
  getResolvedDefaults: vi.fn(),
}));

import { streamChat } from './ai-service.service';

const abortError = () => new DOMException('This operation was aborted', 'AbortError');

/** One streamed word in each API style */
const firstWord = {
  ollama: '{"message":{"content":"Denim"},"done":false}\n',
  openai: 'data: {"choices":[{"delta":{"content":"Denim"},"finish_reason":null}]}\n\n',
};

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
        controller.enqueue(encoder.encode(firstWord[provider.key as keyof typeof firstWord]));
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

/** A complete Ollama answer with the usage the model reports */
const completeModel = vi.fn(async () => new Response(
  '{"message":{"content":"Denim"},"done":false}\n' +
  '{"message":{"content":""},"done":true,"prompt_eval_count":40,"eval_count":3}\n',
));

const prompt = 'Summarize these jackets';
// The prompt's estimate: 23 characters → 6 tokens, plus message and conversation overhead (4 + 2)
const PROMPT_ESTIMATE = 12;

const run = (signal?: AbortSignal) =>
  streamChat([{ role: 'user', content: prompt }], { providerId: 'prov-1', modelId: 7, signal });

const recorded = () => {
  expect(usage.trackUsage).toHaveBeenCalledOnce();
  return usage.trackUsage.mock.calls[0][0];
};

beforeEach(() => {
  vi.clearAllMocks();
  provider.key = 'ollama';
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('cancelling a streaming chat call', () => {
  it('stops the request before the first token and records the prompt as cancelled usage', async () => {
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
    expect(recorded()).toMatchObject({
      operation: 'chat',
      success: true,
      inputTokens: PROMPT_ESTIMATE,
      outputTokens: 0,
      totalTokens: PROMPT_ESTIMATE,
      metadata: { cancelled: true, usageEstimated: true },
    });
    expect(recorded().timeToFirstToken).toBeUndefined(); // no text ever arrived
  });

  it.each(['ollama', 'openai'])('stops the request mid-answer and records what was streamed (%s API style)', async (key) => {
    provider.key = key;
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
    expect(recorded()).toMatchObject({
      success: true,
      inputTokens: PROMPT_ESTIMATE,
      outputTokens: 2, // "Denim": 5 characters
      totalTokens: PROMPT_ESTIMATE + 2,
      metadata: { cancelled: true, usageEstimated: true },
    });
  });

  it('records usage when the caller stops reading without aborting', async () => {
    vi.stubGlobal('fetch', oneWordModel);

    for await (const chunk of run()) {
      void chunk;
      break;
    }

    expect(recorded()).toMatchObject({
      success: true,
      outputTokens: 2,
      metadata: { cancelled: true, usageEstimated: true },
    });
  });

  it('records the usage the model reports for a finished answer, without estimates', async () => {
    vi.stubGlobal('fetch', completeModel);

    for await (const chunk of run(new AbortController().signal)) void chunk;

    const metrics = recorded();
    expect(metrics).toMatchObject({ success: true, inputTokens: 40, outputTokens: 3, totalTokens: 43 });
    expect(metrics.metadata).not.toHaveProperty('cancelled');
    expect(metrics.metadata).not.toHaveProperty('usageEstimated');
  });

  it('still reports a timeout or network failure, once', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }); }));

    await expect((async () => {
      for await (const chunk of run(new AbortController().signal)) void chunk;
    })()).rejects.toThrow();
    expect(log.error).toHaveBeenCalled();
    expect(recorded()).toMatchObject({ success: false });
  });
});
