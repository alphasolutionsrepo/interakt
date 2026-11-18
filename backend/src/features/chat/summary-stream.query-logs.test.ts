// src/features/chat/summary-stream.query-logs.test.ts

/**
 * The "Summary generated" log line keeps the visitor's question only when the
 * experience's telemetry level is Full (cut to 50 characters); otherwise the length
 * of the whole question.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { clearAllTelemetryOverrides, initializeTelemetryConfig, setExperienceTelemetryOverride } from '@/features/telemetry/telemetry.config';
import { type LogLine } from '@/shared/test/log-recorder';

const logs = vi.hoisted(() => [] as LogLine[]);
vi.mock('@/shared/logger/logger', async () => (await import('@/shared/test/log-recorder')).recordingLogger(logs));
vi.mock('@/features/ai-service/ai-service.service', () => ({
  async *streamChat() {
    yield { content: 'A summary.' };
    yield { done: true, usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 } };
  },
}));
vi.mock('@/features/telemetry', () => ({
  ATTR: {},
  flushTelemetry: vi.fn(),
  shouldLogContent: () => false,
  withSpan: (_opts: unknown, fn: (s: unknown) => Promise<unknown>) => fn({ setAttribute: () => {} }),
}));
vi.mock('@/features/chat/prompt-builder', () => ({
  buildSummarySystemPrompt: () => 'system',
  formatFieldsForContext: () => '',
}));

import { createSummaryStream } from './summary-stream';

const QUESTION = 'which jeans are best for a long walk in the rain on a cold windy day';
const experience = {
  id: 'exp-1',
  slug: 'shop',
  aiConfig: { providerId: null, modelId: null, summary: { enabled: true, maxTokens: 500 } },
} as never;
const request = { query: QUESTION, results: [{ id: 'p1', index: { id: 'i', name: 'i' }, fields: { name: 'Jeans' } }] } as never;

async function summarize() {
  const reader = createSummaryStream(experience, request).getReader();
  while (!(await reader.read()).done) { /* drain */ }
}
const generated = () => logs.find((l) => l.message === 'Summary generated');

beforeEach(() => {
  logs.length = 0;
  initializeTelemetryConfig().enabled = true;
});
afterEach(() => {
  clearAllTelemetryOverrides();
  initializeTelemetryConfig().enabled = false;
});

describe("the 'Summary generated' log line", () => {
  it.each(['metadata', 'off'] as const)('keeps the length of the whole question, not its words, at %s', async (level) => {
    setExperienceTelemetryOverride('exp-1', level);
    await summarize();

    expect(generated()?.context).toMatchObject({ queryLength: QUESTION.length });
    expect(JSON.stringify(logs)).not.toContain('jeans');
  });

  it('keeps the first 50 characters of the question at Full', async () => {
    setExperienceTelemetryOverride('exp-1', 'full');
    await summarize();

    expect(generated()?.context).toMatchObject({ query: QUESTION.substring(0, 50) });
  });
});
