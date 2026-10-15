// src/features/ai-service/adapters/adapters.reasoning.test.ts

/**
 * A model's reasoningEffort capability reaches the provider: `think` for Ollama,
 * `reasoning_effort` for OpenAI-compatible APIs. Unset sends nothing.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { OllamaAdapter } from './ollama.adapter';
import { OpenAIAdapter } from './openai.adapter';

const config = (capabilities: Record<string, unknown> = {}) => ({
  baseUrl: 'http://host', apiKey: 'k', modelKey: 'm', timeout: 5000, settings: {}, capabilities,
});
const request = { messages: [{ role: 'user' as const, content: 'hi' }] };

function captureFetch(body: unknown) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  return () => JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
}

const ollamaReply = { model: 'm', message: { role: 'assistant', content: 'ok' }, done: true, prompt_eval_count: 1, eval_count: 1 };
const openaiReply = {
  choices: [{ index: 0, message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }],
  usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
};

afterEach(() => vi.unstubAllGlobals());

describe('Ollama think', () => {
  it("turns thinking off for 'none'", async () => {
    const sent = captureFetch(ollamaReply);
    await new OllamaAdapter().chat(request, config({ reasoningEffort: 'none' }));
    expect(sent().think).toBe(false);
  });

  it('passes a level through', async () => {
    const sent = captureFetch(ollamaReply);
    await new OllamaAdapter().chat(request, config({ reasoningEffort: 'high' }));
    expect(sent().think).toBe('high');
  });

  it('sends nothing when unset', async () => {
    const sent = captureFetch(ollamaReply);
    await new OllamaAdapter().chat(request, config());
    expect(sent()).not.toHaveProperty('think');
  });
});

describe('OpenAI-compatible reasoning_effort', () => {
  it('sends the configured effort', async () => {
    const sent = captureFetch(openaiReply);
    await new OpenAIAdapter().chat(request, config({ reasoningEffort: 'none' }));
    expect(sent().reasoning_effort).toBe('none');
  });

  it('sends nothing when unset', async () => {
    const sent = captureFetch(openaiReply);
    await new OpenAIAdapter().chat(request, config());
    expect(sent()).not.toHaveProperty('reasoning_effort');
  });
});
