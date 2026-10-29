// src/features/ai-service/ai-service.reasoning.test.ts

/**
 * A model's saved reasoning setting reaches the model through the AI service, in
 * both API styles: Ollama-native `think`, OpenAI-compatible `reasoning_effort`.
 * Runs the real AI service and both adapters; only the stored model and the
 * network are faked.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./ai-service.analytics', () => ({ trackUsage: vi.fn(), updateRealtimeMetrics: vi.fn() }));

const stored = vi.hoisted(() => ({ providerKey: 'ollama', capabilities: {} as Record<string, unknown> }));
vi.mock('@/features/ai-providers/ai-providers.service', () => ({
  getProviderConfigById: async () => ({
    id: 'prov-1', providerKey: stored.providerKey, isEnabled: true, baseUrl: 'http://model.test', settings: {},
  }),
  getModelById: async () => ({ id: 7, modelKey: 'qwen3.5:9b', capabilities: stored.capabilities }),
  getProviderByKey: vi.fn(),
  getResolvedDefaults: vi.fn(),
}));

import { chat, generateText, streamChat } from './ai-service.service';

/** A complete answer in whichever format the request asked for */
const model = vi.fn(async (url: string, init?: RequestInit) => {
  const body = JSON.parse(String(init?.body));
  if (url.includes('/api/generate')) return new Response('{"response":"Hi","done":true,"prompt_eval_count":1,"eval_count":1}');
  if (url.includes('/api/chat')) {
    return new Response('{"message":{"role":"assistant","content":"Hi"},"done":true,"prompt_eval_count":1,"eval_count":1}\n');
  }
  if (body.stream) {
    return new Response(
      'data: {"choices":[{"delta":{"content":"Hi"},"finish_reason":"stop"}],"usage":{"prompt_tokens":1,"completion_tokens":1,"total_tokens":2}}\n\ndata: [DONE]\n\n',
    );
  }
  return new Response(JSON.stringify({
    choices: [{ message: { role: 'assistant', content: 'Hi' }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
  }));
});

const sent = () => JSON.parse(String((model.mock.calls[0][1] as RequestInit).body));
const options = { providerId: 'prov-1', modelId: 7 };
const messages = [{ role: 'user' as const, content: 'Say hi' }];

const calls = {
  chat: () => chat(messages, options),
  streamChat: async () => {
    for await (const chunk of streamChat(messages, options)) void chunk;
  },
  generateText: () => generateText('Say hi', options),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', model);
});
afterEach(() => vi.unstubAllGlobals());

describe("a model's saved reasoning setting", () => {
  it.each(Object.keys(calls) as Array<keyof typeof calls>)('reaches Ollama as think (%s)', async (call) => {
    stored.providerKey = 'ollama';
    stored.capabilities = { reasoningEffort: 'none' };

    await calls[call]();

    expect(sent().think).toBe(false);
  });

  it.each(Object.keys(calls) as Array<keyof typeof calls>)('reaches an OpenAI-compatible connection as reasoning_effort (%s)', async (call) => {
    stored.providerKey = 'openai';
    stored.capabilities = { reasoningEffort: 'low' };

    await calls[call]();

    expect(sent().reasoning_effort).toBe('low');
  });

  it('sends nothing when the model has no setting', async () => {
    stored.providerKey = 'ollama';
    stored.capabilities = {};
    await calls.chat();
    expect(sent()).not.toHaveProperty('think');

    model.mockClear();
    stored.providerKey = 'openai';
    await calls.chat();
    expect(sent()).not.toHaveProperty('reasoning_effort');
  });
});
