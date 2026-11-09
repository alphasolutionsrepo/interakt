// src/features/ai-service/ai-service.api.handlers.errors.test.ts

/**
 * A failed call from the AI Provider playground answers as other AI paths do (a missing
 * model is 404, an open circuit breaker 503 as the provider being unavailable, anything
 * else the shared error) and is logged once.
 */

import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AIServiceError } from './ai-service.types';

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

  it.each(calls)('%s: an open circuit breaker answers 503 as the provider being unavailable, logged once as an error with the request id and the error', async (_, call) => {
    // What the resilience layer throws while it has cut the provider off
    failWith.error = new AIServiceError('Circuit breaker is open - provider temporarily unavailable', 'CIRCUIT_OPEN', 'p1', 'ollama');
    const res = await call();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body).toMatchObject({ code: 'UPSTREAM_UNAVAILABLE' });
    expect(reported(logs)).toEqual([expect.objectContaining({
      level: 'error', context: expect.objectContaining({ requestId: body.requestId, err: failWith.error }),
    })]);
  });

  it.each(calls)('%s: any other failure is logged once, as an error with the request id and the operation', async (_, call, operation) => {
    failWith.error = new Error('connect ECONNREFUSED 127.0.0.1:11434');
    const res = await call();
    const { requestId } = await res.json();
    expect(reported(logs)).toEqual([expect.objectContaining({ level: 'error', context: expect.objectContaining({ requestId, operation }) })]);
  });

  const streamError = async () => {
    const res = await handleChatStream(post('/api/ai-service/chat/stream', { messages: [{ role: 'user', content: 'hi' }] }));
    return JSON.parse((await res.text()).split('\n').find((line) => line.startsWith('data: '))!.slice(6));
  };

  it('a streamed chat that fails sends the shared error body without the error text, with a request id, logged once', async () => {
    failWith.error = new Error('connect ECONNREFUSED 127.0.0.1:11434');
    const event = await streamError();

    expect(event).toMatchObject({ code: 'INTERNAL_ERROR', requestId: expect.any(String) });
    // The playground reads error; message is the same text
    expect(event.error).toBe(event.message);
    expect(JSON.stringify(event)).not.toContain('ECONNREFUSED');
    expect(reported(logs)).toEqual([expect.objectContaining({
      level: 'error', context: expect.objectContaining({ requestId: event.requestId, operation: 'chatStream', err: failWith.error }),
    })]);
  });

  it('a streamed chat that fails in a way we recognise sends its message and code', async () => {
    failWith.error = new Error('Model "qwen9" not found');
    const event = await streamError();

    expect(event).toMatchObject({ error: 'Model "qwen9" not found', message: 'Model "qwen9" not found', code: 'NOT_FOUND', requestId: expect.any(String) });
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
