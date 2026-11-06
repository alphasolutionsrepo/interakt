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

describe("Ollama think for 'minimal'", () => {
  /** Ollama answering /api/show with the model's family (or failing to), and the chat */
  function ollama(family: string | undefined, showStatus = 200) {
    const chats: Array<Record<string, unknown>> = [];
    const shows: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      if (url.endsWith('/api/show')) {
        shows.push(body.model);
        return new Response(JSON.stringify({ details: family ? { family, families: [family] } : {} }), { status: showStatus });
      }
      chats.push(body);
      return new Response(JSON.stringify(ollamaReply));
    }));
    return { chats, shows };
  }
  const minimal = (modelKey: string, baseUrl: string) =>
    new OllamaAdapter().chat(request, { ...config({ reasoningEffort: 'minimal' }), modelKey, baseUrl });

  it.each([
    ['gpt-oss:20b', 'gpt-oss'],
    ['gpt-oss:latest', 'gptoss'],
    ['my-reasoner', 'gptoss'],
    ['hf.co/someone/gpt-oss-20b-GGUF:Q4_K_M', 'gpt-oss'],
  ])("sends %s (family %s) think 'low': gpt-oss takes levels and ignores off", async (modelKey, family) => {
    const { chats } = ollama(family);
    await minimal(modelKey, `http://levels-${modelKey}`);
    expect(chats[0].think).toBe('low');
  });

  it.each([
    ['qwen3:8b', 'qwen3'],
    ['deepseek-r1:14b', 'qwen2'],
  ])('turns thinking off for %s (family %s), which only turns it on or off', async (modelKey, family) => {
    const { chats } = ollama(family);
    await minimal(modelKey, `http://onoff-${modelKey}`);
    expect(chats[0].think).toBe(false);
  });

  it("goes by the model's key when Ollama can't say, and asks again after a minute, not on every request", async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const { chats, shows } = ollama(undefined, 404);
      await minimal('gpt-oss:20b', 'http://cannot-say');
      await minimal('qwen3:8b', 'http://cannot-say');
      await minimal('qwen3:8b', 'http://cannot-say');
      vi.advanceTimersByTime(61_000);
      await minimal('qwen3:8b', 'http://cannot-say');
      expect(chats.map((c) => c.think)).toEqual(['low', false, false, false]);
      expect(shows).toEqual(['gpt-oss:20b', 'qwen3:8b', 'qwen3:8b']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('asks Ollama once per model, and again after ten minutes (a name can be copied over another model)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const { shows } = ollama('gptoss');
      await minimal('my-reasoner', 'http://once');
      await minimal('my-reasoner', 'http://once');
      vi.advanceTimersByTime(11 * 60_000);
      await minimal('my-reasoner', 'http://once');
      expect(shows).toEqual(['my-reasoner', 'my-reasoner']);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('Ollama think', () => {
  it.each(['none'])("turns thinking off for '%s'", async (effort) => {
    const sent = captureFetch(ollamaReply);
    await new OllamaAdapter().chat(request, config({ reasoningEffort: effort }));
    expect(sent().think).toBe(false);
  });

  it.each([
    ['low', 'low'],
    ['medium', 'medium'],
    ['high', 'high'],
  ])("sends '%s' as think '%s'", async (effort, think) => {
    const sent = captureFetch(ollamaReply);
    await new OllamaAdapter().chat(request, config({ reasoningEffort: effort }));
    expect(sent().think).toBe(think);
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
    await new OllamaAdapter().generateText({ prompt: 'hi' }, config({ reasoningEffort: 'low' }));
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
