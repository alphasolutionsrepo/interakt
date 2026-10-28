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
  const fetchMock = vi.fn(async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  return () => JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
}

const ollamaReply = { model: 'm', message: { role: 'assistant', content: 'ok' }, done: true, prompt_eval_count: 1, eval_count: 1 };
const openaiReply = {
  choices: [{ index: 0, message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }],
  usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
};

// Streams: one final chunk each
const ollamaStream = JSON.stringify({ ...ollamaReply, done_reason: 'stop' }) + '\n';
const openaiStream = [
  { choices: [{ index: 0, delta: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }] },
  { choices: [], usage: openaiReply.usage },
].map((c) => `data: ${JSON.stringify(c)}\n\n`).join('') + 'data: [DONE]\n\n';

async function drain(stream: AsyncIterable<unknown>) {
  for await (const _ of stream) { /* read to the end */ }
}

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

  it('is sent on a streamed chat (AI summaries stream)', async () => {
    const sent = captureFetch(ollamaStream);
    await drain(new OllamaAdapter().streamChat(request, config({ reasoningEffort: 'none' })));
    expect(sent().think).toBe(false);
  });

  it('is sent on text generation', async () => {
    const sent = captureFetch({ model: 'm', response: 'ok', done: true, prompt_eval_count: 1, eval_count: 1 });
    await new OllamaAdapter().generateText({ prompt: 'hi' }, config({ reasoningEffort: 'minimal' }));
    expect(sent().think).toBe('low');
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

  it('is sent on a streamed chat (AI summaries stream)', async () => {
    const sent = captureFetch(openaiStream);
    await drain(new OpenAIAdapter().streamChat(request, config({ reasoningEffort: 'low' })));
    expect(sent().reasoning_effort).toBe('low');
  });

  it('is sent on text generation', async () => {
    const sent = captureFetch(openaiReply);
    await new OpenAIAdapter().generateText({ prompt: 'hi' }, config({ reasoningEffort: 'minimal' }));
    expect(sent().reasoning_effort).toBe('minimal');
  });
});
