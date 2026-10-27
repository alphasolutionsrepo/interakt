// src/features/ai-service/ai-service.api.handlers.source.test.ts

/**
 * The AI Provider playground's calls run as playground traffic, so AI usage reports leave them
 * out, like the other playgrounds. A streamed chat keeps the source while the stream is read.
 */

import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

import { getAnalyticsSourceContext } from '@/features/analytics/analytics-source-context';

const seen = vi.hoisted(() => [] as Array<[string, string | undefined]>);
vi.mock('@/shared/utils/auth-utils', () => ({ getCurrentUserId: async () => 'admin' }));
vi.mock('./ai-service.service', () => {
  const result = { usage: {}, metadata: {}, text: 'hi', message: { content: 'hi' }, embeddings: [[0.1]] };
  return {
    generateText: async () => { seen.push(['text', getAnalyticsSourceContext()]); return result; },
    chat: async () => { seen.push(['chat', getAnalyticsSourceContext()]); return result; },
    generateEmbeddings: async () => { seen.push(['embeddings', getAnalyticsSourceContext()]); return result; },
    streamChat: async function* () {
      yield { content: 'h', done: false };
      await new Promise((resolve) => setTimeout(resolve, 5));
      // Usage is recorded when the stream ends
      seen.push(['stream', getAnalyticsSourceContext()]);
      yield { content: 'i', done: true };
    },
  };
});

import { handleChat, handleChatStream, handleEmbeddings, handleTextGeneration } from './ai-service.api.handlers';

const post = (path: string, body: unknown) =>
  new NextRequest(`http://localhost${path}`, { method: 'POST', body: JSON.stringify(body) });

describe('AI Provider playground source', () => {
  it('runs text, chat, embedding and streamed chat calls as playground traffic', async () => {
    const messages = [{ role: 'user', content: 'hi' }];
    await handleTextGeneration(post('/api/ai-service/text', { prompt: 'hi' }));
    await handleChat(post('/api/ai-service/chat', { messages }));
    await handleEmbeddings(post('/api/ai-service/embeddings', { texts: ['hi'] }));
    const response = await handleChatStream(post('/api/ai-service/chat/stream', { messages }));
    await response.text();

    expect(Object.fromEntries(seen)).toEqual({
      text: 'playground', chat: 'playground', embeddings: 'playground', stream: 'playground',
    });
  });
});
