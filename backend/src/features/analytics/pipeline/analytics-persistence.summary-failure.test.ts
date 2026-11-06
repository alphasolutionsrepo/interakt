// src/features/analytics/pipeline/analytics-persistence.summary-failure.test.ts

/**
 * Summarizing a long analytics chat is optional: when it fails the turn is still saved.
 * The line it leaves is the only record, so a model that is down or missing is logged as
 * an error (it needs fixing), anything else as a warning, as before.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { reported, type LogLine } from '@/shared/test/log-recorder';

const logs = vi.hoisted(() => [] as LogLine[]);
vi.mock('@/shared/logger/logger', async () => (await import('@/shared/test/log-recorder')).recordingLogger(logs));
vi.mock('server-only', () => ({}));
vi.mock('../analytics-config', () => ({ getAnalyticsConfig: () => ({ analyticsChatWindowSize: 2, analyticsChatSummaryThreshold: 4 }) }));
vi.mock('../admin-chat-session.service', () => ({
  createSession: vi.fn(),
  addMessages: vi.fn(),
  getSession: async () => ({ id: 's1', messages: Array.from({ length: 6 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `message ${i}` })) }),
}));

import { persistAnalyticsTurn } from './analytics-persistence';

const turn = (chat: () => Promise<never>) => persistAnalyticsTurn({
  sessionId: 's1', experienceId: null, experienceName: null, userMessage: 'How many searches?', responseText: '12',
  toolsUsed: [], analyticsData: [], usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 }, facts: {},
  chat: chat as never,
});

beforeEach(() => { logs.length = 0; });

describe('a conversation summary that fails', () => {
  it('logs a model that is missing as an error, with the error', async () => {
    const modelDown = Object.assign(new Error('model "qwen2.5:14b" not found'), { name: 'AdapterError', providerKey: 'ollama', statusCode: 404 });
    expect(await turn(async () => { throw modelDown; })).toMatchObject({ success: true });
    await vi.waitFor(() => expect(reported(logs)).toHaveLength(1));
    expect(reported(logs)[0]).toMatchObject({ level: 'error', message: 'Summarization failed (non-fatal)', context: { err: modelDown } });
  });

  it('logs anything else as a warning, as before', async () => {
    const unreadable = new Error('No summary in the answer');
    await turn(async () => { throw unreadable; });
    await vi.waitFor(() => expect(reported(logs)).toHaveLength(1));
    expect(reported(logs)[0]).toMatchObject({ level: 'warn', context: { err: unreadable } });
  });
});
