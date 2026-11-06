// src/features/ai-service/ai-service.api.handlers.errors.test.ts

/**
 * A failed call from the AI Provider playground answers as before (a missing model is
 * 404, an open circuit breaker 400, anything else the shared error) and is logged once.
 */

import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { reported, type LogLine } from '@/shared/test/log-recorder';

const logs = vi.hoisted(() => [] as LogLine[]);
vi.mock('@/shared/logger/logger', async () => (await import('@/shared/test/log-recorder')).recordingLogger(logs));
vi.mock('@/shared/utils/auth-utils', () => ({ getCurrentUserId: async () => 'admin' }));
const failWith = vi.hoisted(() => ({ error: new Error('unset') }));
vi.mock('./ai-service.service', () => {
  const fail = async () => { throw failWith.error; };
  return {
    generateText: fail, chat: fail, generateEmbeddings: fail,
    // eslint-disable-next-line require-yield -- fails before its first chunk, as a model call does
    streamChat: async function* () { throw failWith.error; },
  };
});
vi.mock('@/features/ai-providers/ai-providers.service', () => ({
  getEnabledProviders: async () => { throw failWith.error; },
  getSystemDefaults: async () => null,
}));

import { handleChat, handleChatStream, handleEmbeddings, handleGetProviders, handleTextGeneration } from './ai-service.api.handlers';

const post = (path: string, body: unknown) =>
  new NextRequest(`http://localhost${path}`, { method: 'POST', body: JSON.stringify(body) });
const calls = [
  ['text generation', () => handleTextGeneration(post('/api/ai-service/text', { prompt: 'hi' })), 'text'],
  ['chat', () => handleChat(post('/api/ai-service/chat', { messages: [{ role: 'user', content: 'hi' }] })), 'chat'],
  ['embeddings', () => handleEmbeddings(post('/api/ai-service/embeddings', { texts: ['hi'] })), 'embeddings'],
] as const;

beforeEach(() => { logs.length = 0; });

describe('a failed AI Provider playground call', () => {
  it.each(calls)('%s: a missing model answers 404, logged once as an error (our setup) with the request id and the error', async (_, call) => {
    failWith.error = new Error('Model "qwen9" not found');
    const res = await call();
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toMatchObject({ code: 'NOT_FOUND', message: 'Model "qwen9" not found' });
    expect(reported(logs)).toEqual([expect.objectContaining({
      level: 'error', context: expect.objectContaining({ requestId: body.requestId, err: expect.objectContaining({ cause: failWith.error }) }),
    })]);
  });

  it.each(calls)('%s: an open circuit breaker answers 400, logged once as an error (the provider is down) with the request id and the error', async (_, call) => {
    failWith.error = new Error('Circuit breaker is open for provider ollama');
    const res = await call();
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toMatchObject({ code: 'BAD_REQUEST', message: 'Circuit breaker is open for provider ollama' });
    expect(reported(logs)).toEqual([expect.objectContaining({
      level: 'error', context: expect.objectContaining({ requestId: body.requestId, err: expect.objectContaining({ cause: failWith.error }) }),
    })]);
  });

  it.each(calls)('%s: any other failure is logged once, as an error with the request id and the operation', async (_, call, operation) => {
    failWith.error = new Error('connect ECONNREFUSED 127.0.0.1:11434');
    const res = await call();
    const { requestId } = await res.json();
    expect(reported(logs)).toEqual([expect.objectContaining({ level: 'error', context: expect.objectContaining({ requestId, operation }) })]);
  });

  it('a streamed chat that fails sends the error with a request id, logged once', async () => {
    failWith.error = new Error('connect ECONNREFUSED 127.0.0.1:11434');
    const res = await handleChatStream(post('/api/ai-service/chat/stream', { messages: [{ role: 'user', content: 'hi' }] }));
    const event = JSON.parse((await res.text()).split('\n').find((line) => line.startsWith('data: '))!.slice(6));

    expect(event).toMatchObject({ error: 'connect ECONNREFUSED 127.0.0.1:11434', requestId: expect.any(String) });
    expect(reported(logs)).toEqual([expect.objectContaining({
      level: 'error', context: expect.objectContaining({ requestId: event.requestId, operation: 'chatStream', err: failWith.error }),
    })]);
  });

  it('a streamed chat that cannot start answers with the shared error and a request id, logged once', async () => {
    const res = await handleChatStream(new NextRequest('http://localhost/api/ai-service/chat/stream', { method: 'POST', body: '{not json' }));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body).toMatchObject({ success: false, requestId: expect.any(String) });
    expect(reported(logs)).toEqual([expect.objectContaining({ level: 'error', context: expect.objectContaining({ requestId: body.requestId, operation: 'chatStream' }) })]);
  });

  it('a provider list that cannot be read is logged once, as an error with the request id', async () => {
    failWith.error = new Error('connection terminated');
    const res = await handleGetProviders(new NextRequest('http://localhost/api/ai-service/providers'));
    const { requestId } = await res.json();
    expect(reported(logs)).toEqual([expect.objectContaining({ level: 'error', context: expect.objectContaining({ requestId }) })]);
  });
});
