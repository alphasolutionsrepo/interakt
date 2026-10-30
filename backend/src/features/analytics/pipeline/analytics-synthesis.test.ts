// src/features/analytics/pipeline/analytics-synthesis.test.ts

/**
 * The answer step sees the conversation so far, so a follow-up such as "why?"
 * is answered about the previous answer, but only the latest turns, each cut
 * short, so history can't crowd out the data.
 */

import { describe, expect, it } from 'vitest';

import { synthesizeAnalyticsResponse } from './analytics-synthesis';
import type { AnalyticsTurnContext, ChatFn, StreamChatFn } from './analytics-pipeline.types';

function context(overrides: Partial<AnalyticsTurnContext> = {}): AnalyticsTurnContext {
  return {
    userMessage: 'Why?',
    sessionId: 'session-1',
    experienceId: null,
    experienceName: null,
    timeRange: '7d',
    period: null,
    timeZone: 'UTC',
    pageSection: null,
    conversationHistory: [],
    conversationSummary: null,
    sessionFacts: {},
    availableTools: [],
    providerId: null,
    modelId: null,
    ...overrides,
  };
}

/** Runs the answer step and returns the messages it sent the model */
async function messagesSent(ctx: AnalyticsTurnContext) {
  let sent: Array<{ role: string; content: string }> = [];
  const streamChat = (async function* (messages: Array<{ role: string; content: string }>) {
    sent = messages;
    yield { content: 'Answer.', done: true, usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } };
  }) as unknown as StreamChatFn;
  await synthesizeAnalyticsResponse(ctx, [], false, () => {}, streamChat, (async () => ({})) as unknown as ChatFn);
  return sent;
}

describe('synthesizeAnalyticsResponse', () => {
  it('puts the earlier turns between the instructions and the latest question', async () => {
    const sent = await messagesSent(
      context({
        conversationHistory: [
          { role: 'user', content: 'How many searches last week?' },
          { role: 'assistant', content: 'Searches fell by a third.' },
        ],
      }),
    );

    expect(sent.map((m) => m.role)).toEqual(['system', 'user', 'assistant', 'user']);
    expect(sent[2].content).toBe('Searches fell by a third.');
    expect(sent.at(-1)?.content).toBe('Why?');
  });

  it('keeps the summary of older turns, the latest four turns, and cuts long ones short', async () => {
    const history = Array.from({ length: 6 }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      content: i === 5 ? 'x'.repeat(5000) : `turn ${i}`,
    }));
    const sent = await messagesSent(context({ conversationHistory: history, conversationSummary: 'Talked about gift cards.' }));

    expect(sent[1].content).toContain('Talked about gift cards.');
    expect(sent.slice(2, -1).map((m) => m.content.slice(0, 6))).toEqual(['turn 2', 'turn 3', 'turn 4', 'xxxxxx']);
    expect(sent.at(-2)!.content.length).toBeLessThan(1300);
  });
});
