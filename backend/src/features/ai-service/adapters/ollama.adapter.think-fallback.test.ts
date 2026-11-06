// src/features/ai-service/adapters/ollama.adapter.think-fallback.test.ts

/**
 * A model with a reasoning level that can't think (Ollama answers 400 "<model> does not
 * support thinking", seen with qwen2.5:14b on Ollama 0.40) is asked again once without
 * one, so the call works; a warning, once per model, says to clear the setting.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { reported, type LogLine } from '@/shared/test/log-recorder';

const logs = vi.hoisted(() => [] as LogLine[]);
vi.mock('@/shared/logger/logger', async () => (await import('@/shared/test/log-recorder')).recordingLogger(logs));

import { OllamaAdapter } from './ollama.adapter';
import { OpenAIAdapter } from './openai.adapter';

const config = (modelKey: string) => ({
  baseUrl: 'http://host', apiKey: '', modelKey, timeout: 5000, settings: {}, capabilities: { reasoningEffort: 'low' },
});
const request = { messages: [{ role: 'user' as const, content: 'hi' }] };
const reply = { model: 'm', message: { role: 'assistant', content: 'ok' }, done: true, prompt_eval_count: 1, eval_count: 1 };
const refusal = (model: string) => new Response(JSON.stringify({ error: `"${model}" does not support thinking` }), { status: 400 });

/** Ollama refusing think, then answering without it; the bodies it was sent */
function ollamaWithoutThinking(model: string, answer: () => Response) {
  const fetchMock = vi.fn(async (_url: string, init: RequestInit) =>
    'think' in JSON.parse(init.body as string) ? refusal(model) : answer());
  vi.stubGlobal('fetch', fetchMock);
  return () => fetchMock.mock.calls.map(([, init]) => JSON.parse(init.body as string));
}

afterEach(() => { vi.unstubAllGlobals(); logs.length = 0; });

describe('an Ollama model that does not support thinking', () => {
  it('answers a chat once asked again without the reasoning level, with one warning per model', async () => {
    const sent = ollamaWithoutThinking('qwen2.5:14b', () => new Response(JSON.stringify(reply)));

    const first = await new OllamaAdapter().chat(request, config('qwen2.5:14b'));
    await new OllamaAdapter().chat(request, config('qwen2.5:14b'));

    expect(first.message.content).toBe('ok');
    expect(sent().map((body) => body.think)).toEqual(['low', undefined, 'low', undefined]);
    expect(reported(logs)).toEqual([expect.objectContaining({ level: 'warn', context: expect.objectContaining({ model: 'qwen2.5:14b' }) })]);
  });

  it('streams a chat once asked again without the reasoning level', async () => {
    ollamaWithoutThinking('llama3.1:8b', () => new Response(JSON.stringify({ ...reply, done_reason: 'stop' }) + '\n'));
    let text = '';
    for await (const chunk of new OllamaAdapter().streamChat(request, config('llama3.1:8b'))) text += chunk.content ?? '';
    expect(text).toBe('ok');
  });

  it('answers a text generation once asked again without the reasoning level', async () => {
    ollamaWithoutThinking('mistral:7b', () => new Response(JSON.stringify({ model: 'm', response: 'ok', done: true })));
    const result = await new OllamaAdapter().generateText({ prompt: 'hi' }, config('mistral:7b'));
    expect(result.text).toBe('ok');
  });
});

describe('another 400 from Ollama', () => {
  it('is not asked again', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ error: 'model "nope" not found' }), { status: 400 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(new OllamaAdapter().chat(request, config('nope'))).rejects.toThrow('not found');
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});

describe('a model reached through an OpenAI-compatible API that does not support thinking', () => {
  // What Ollama's /v1/chat/completions answers for qwen2.5:14b with reasoning_effort (checked live)
  const openaiRefusal = () => new Response(JSON.stringify({ error: { message: '"qwen2.5:14b" does not support thinking', type: 'invalid_request_error' } }), { status: 400 });
  const openaiReply = { choices: [{ index: 0, message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } };

  function openaiWithoutThinking(answer: () => Response) {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) =>
      'reasoning_effort' in JSON.parse(init.body as string) ? openaiRefusal() : answer());
    vi.stubGlobal('fetch', fetchMock);
    return () => fetchMock.mock.calls.map(([, init]) => JSON.parse(init.body as string));
  }

  it('answers a chat once asked again without the reasoning effort, with a warning', async () => {
    const sent = openaiWithoutThinking(() => new Response(JSON.stringify(openaiReply)));
    const result = await new OpenAIAdapter().chat(request, { ...config('qwen2.5:7b-v1'), apiKey: 'k' });

    expect(result.message.content).toBe('ok');
    expect(sent().map((body) => body.reasoning_effort)).toEqual(['low', undefined]);
    expect(reported(logs)).toEqual([expect.objectContaining({ level: 'warn', context: expect.objectContaining({ model: 'qwen2.5:7b-v1' }) })]);
  });

  it("fails with the second answer's error when the call without it fails too", async () => {
    openaiWithoutThinking(() => new Response(JSON.stringify({ error: { message: 'model "qwen2.5:3b-v1" not found' } }), { status: 404 }));
    await expect(new OpenAIAdapter().chat(request, { ...config('qwen2.5:3b-v1'), apiKey: 'k' })).rejects.toThrow('not found');
  });

  it('streams a chat once asked again without the reasoning effort', async () => {
    const stream = [{ choices: [{ index: 0, delta: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }] }]
      .map((c) => `data: ${JSON.stringify(c)}\n\n`).join('') + 'data: [DONE]\n\n';
    openaiWithoutThinking(() => new Response(stream));
    let text = '';
    for await (const chunk of new OpenAIAdapter().streamChat(request, { ...config('qwen2.5:14b-stream'), apiKey: 'k' })) text += chunk.content ?? '';
    expect(text).toBe('ok');
  });
});
