// src/features/chat/summary-stream.cancel.test.ts

/**
 * A visitor who starts a new search, or presses Stop, cancels the summary
 * stream. That is not a failure: generation stops, nothing more is written to
 * the closed stream, and it is recorded as cancelled rather than as an error.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const log = vi.hoisted(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }));
vi.mock('@/shared/logger/logger', () => ({ createLogger: () => log }));

const model = vi.hoisted(() => ({ finished: false, chunksSent: 0 }));
vi.mock('@/features/ai-service/ai-service.service', () => ({
  async *streamChat() {
    try {
      for (let i = 0; i < 100; i++) {
        model.chunksSent++;
        yield { content: `word${i} ` };
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      yield { done: true, usage: { inputTokens: 1, outputTokens: 100, totalTokens: 101 } };
    } finally {
      model.finished = true;
    }
  },
}));

const span = vi.hoisted(() => ({ attributes: {} as Record<string, unknown>, failed: false, settled: undefined as Promise<unknown> | undefined }));
vi.mock('@/features/telemetry', () => ({
  ATTR: { SUMMARY_CANCELLED: 'alpha.summary.cancelled' },
  flushTelemetry: vi.fn(),
  shouldLogContent: () => false,
  withSpan: (_opts: unknown, fn: (s: unknown) => Promise<unknown>) => {
    const fake = { setAttribute: (k: string, v: unknown) => { span.attributes[k] = v; } };
    span.settled = fn(fake).catch((error) => { span.failed = true; throw error; });
    return span.settled;
  },
}));
vi.mock('@/features/chat/prompt-builder', () => ({
  buildSummarySystemPrompt: () => 'system',
  formatFieldsForContext: () => '',
}));

import { createSummaryStream } from './summary-stream';

const experience = {
  id: 'exp-1',
  slug: 'shop',
  aiConfig: { providerId: null, modelId: null, summary: { enabled: true, maxTokens: 500 } },
} as never;
const request = { query: 'jeans', results: [{ id: 'p1', index: { id: 'i', name: 'i' }, fields: { name: 'Jeans' } }] } as never;

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(model, { finished: false, chunksSent: 0 });
  Object.assign(span, { attributes: {}, failed: false, settled: undefined });
});

describe('cancelling a summary', () => {
  it('stops generation and records a cancel, not an error', async () => {
    const reader = createSummaryStream(experience, request).getReader();
    await reader.read(); // sources
    await reader.read(); // first words
    await reader.cancel('new search');
    await span.settled;

    expect(model.finished).toBe(true);
    expect(model.chunksSent).toBeLessThan(10);
    expect(log.error).not.toHaveBeenCalled();
    expect(span.failed).toBe(false);
    expect(span.attributes['alpha.summary.cancelled']).toBe(true);
  });

  it('still reports a real failure as an error', async () => {
    const ai = await import('@/features/ai-service/ai-service.service');
    vi.spyOn(ai, 'streamChat').mockImplementationOnce(async function* () {
      throw new Error('model unavailable');
    } as never);

    const reader = createSummaryStream(experience, request).getReader();
    const events: string[] = [];
    for (let r = await reader.read(); !r.done; r = await reader.read()) events.push(new TextDecoder().decode(r.value));
    await span.settled;

    expect(events.join('')).toContain('"type":"error"');
    expect(log.error).toHaveBeenCalledWith('Summary generation failed', expect.anything());
  });

  it('aborts the model request when the visitor leaves before the first word', async () => {
    const ai = await import('@/features/ai-service/ai-service.service');
    let signal: AbortSignal | undefined;
    // A model still reading the prompt: nothing arrives until the request is aborted,
    // and then the AI service ends the stream without an error
    vi.spyOn(ai, 'streamChat').mockImplementationOnce(async function* (_messages, options) {
      signal = options?.signal;
      await new Promise((resolve) => signal?.addEventListener('abort', resolve));
    } as never);

    const reader = createSummaryStream(experience, request).getReader();
    await reader.read(); // sources
    await reader.cancel('new search');
    await span.settled;

    expect(signal?.aborted).toBe(true);
    expect(span.attributes['alpha.summary.cancelled']).toBe(true);
    expect(log.error).not.toHaveBeenCalled();
  });

  it('streams a whole summary when nobody cancels', async () => {
    const reader = createSummaryStream(experience, request).getReader();
    let text = '';
    for (let r = await reader.read(); !r.done; r = await reader.read()) text += new TextDecoder().decode(r.value);
    await span.settled;

    expect(text).toContain('"type":"done"');
    expect(text.trimEnd().endsWith('data: [DONE]')).toBe(true);
    expect(span.attributes['alpha.summary.cancelled']).toBeUndefined();
    expect(log.error).not.toHaveBeenCalled();
  });
});
