// src/features/chat/summary-stream.public-error.test.ts

/**
 * A summary whose model fails part way, through the real stream: the route has already
 * answered 200, so the failure goes out as an error event. A visitor gets the plain
 * message; an admin testing in the playground gets the explanation. Logged once.
 */

import { describe, expect, it, vi } from 'vitest';

import { reported, type LogLine } from '@/shared/test/log-recorder';

vi.mock('server-only', () => ({}));
const logs = vi.hoisted(() => [] as LogLine[]);
vi.mock('@/shared/logger/logger', async () => (await import('@/shared/test/log-recorder')).recordingLogger(logs));
vi.mock('@/features/ai-service/ai-service.service', () => ({
  async *streamChat() {
    yield { content: 'Linen shirts are ' };
    // What the Ollama adapter throws when Ollama stops answering
    throw Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:11434'), { name: 'AdapterError', providerKey: 'ollama', code: 'ECONNREFUSED' });
  },
}));
vi.mock('@/features/telemetry', () => ({
  ATTR: new Proxy({}, { get: (_t, k) => String(k) }),
  flushTelemetry: vi.fn(),
  shouldLogContent: () => false,
  withSpan: (_opts: unknown, fn: (s: unknown) => Promise<unknown>) => fn({ setAttribute: vi.fn() }),
}));
vi.mock('@/features/chat/prompt-builder', () => ({ buildSummarySystemPrompt: () => 'system', formatFieldsForContext: () => '' }));

import { createSummaryStream } from './summary-stream';

import { markAdminCaller, publicRoute } from '@/shared/api/public-route';
import { PUBLIC_FAILURE_MESSAGE } from '@/shared/api/response';

const experience = { id: 'exp-1', slug: 'shop', aiConfig: { providerId: null, modelId: null, summary: { enabled: true, maxTokens: 500 } } } as never;
const request = { query: 'linen', results: [{ id: 'p1', index: { id: 'i', name: 'i' }, fields: { name: 'Linen shirt' } }] } as never;

/** The error event the stream sends, read as the widget reads it */
async function errorEvent(admin: boolean): Promise<Record<string, unknown>> {
  const route = publicRoute(async () => {
    if (admin) markAdminCaller();
    return new Response(createSummaryStream(experience, request));
  });
  const text = await (await route()).text();
  const line = text.split('\n').find((l) => l.startsWith('data: {') && l.includes('"error"'))!;
  return JSON.parse(line.slice(6));
}

describe('a summary whose model fails part way', () => {
  it('sends a visitor the plain message, logged once as an error', async () => {
    logs.length = 0;
    const event = await errorEvent(false);

    expect(event).toMatchObject({ type: 'error', message: PUBLIC_FAILURE_MESSAGE });
    expect(JSON.stringify(event)).not.toMatch(/ollama|11434/i);
    expect(reported(logs)).toEqual([expect.objectContaining({ level: 'error', context: expect.objectContaining({ requestId: event.requestId }) })]);
  });

  it('sends an admin the explanation', async () => {
    logs.length = 0;
    const event = await errorEvent(true);

    expect(event.message).toMatch(/Ollama/);
    expect(reported(logs)).toHaveLength(1);
  });
});
