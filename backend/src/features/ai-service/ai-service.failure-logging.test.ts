// src/features/ai-service/ai-service.failure-logging.test.ts

/**
 * A failed AI call is passed on to the caller without a warning or error of its own:
 * whoever handles it (the API answer, the chat step, the summary stream) logs it once.
 * Runs the real AI service and the Ollama adapter; only the network is faked.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { reported, type LogLine } from '@/shared/test/log-recorder';

const logs = vi.hoisted(() => [] as LogLine[]);
vi.mock('@/shared/logger/logger', async () => (await import('@/shared/test/log-recorder')).recordingLogger(logs));
vi.mock('./ai-service.analytics', () => ({ trackUsage: vi.fn(), updateRealtimeMetrics: vi.fn() }));
vi.mock('@/features/ai-providers/ai-providers.service', () => ({
  getProviderConfigById: async () => ({ id: 'prov-1', providerKey: 'ollama', isEnabled: true, baseUrl: 'http://model.test', settings: {} }),
  getModelById: async () => ({ id: 7, modelKey: 'qwen2.5:14b', capabilities: {} }),
  getProviderByKey: vi.fn(),
  getResolvedDefaults: vi.fn(),
}));

import { recordFailure, resetCircuit } from './ai-service.resilience';

import { toAppError } from '@/shared/errors/to-app-error';
import { chat, generateEmbeddings, generateText, streamChat } from './ai-service.service';

// What Ollama answers for a model it doesn't have
const modelMissing = vi.fn(async () => new Response('{"error":"model \\"qwen2.5:14b\\" not found, try pulling it first"}', { status: 404 }));
const options = { providerId: 'prov-1', modelId: 7 };
const messages = [{ role: 'user' as const, content: 'Summarize these jackets' }];

beforeEach(() => {
  logs.length = 0;
  // Failures add up per provider across tests; each starts with the circuit closed
  resetCircuit('prov-1');
  vi.stubGlobal('fetch', modelMissing);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('a failed AI call', () => {
  it.each([
    ['text generation', () => generateText('Summarize these jackets', options)],
    ['a chat completion', () => chat(messages, options)],
    ['embeddings', () => generateEmbeddings(['linen shirt'], { ...options, feature: 'search_query' })],
    ['a streamed chat', async () => { for await (const chunk of streamChat(messages, options)) void chunk; }],
  ])('%s is passed on without a warning or error of its own', async (_, call) => {
    await expect(call()).rejects.toThrow();
    expect(reported(logs)).toEqual([]);
  });

  it.each([
    ['text generation', () => generateText('Summarize these jackets', { ...options, maxRetries: 0 })],
    ['a chat completion', () => chat(messages, { ...options, maxRetries: 0 })],
    ['embeddings', () => generateEmbeddings(['linen shirt'], { ...options, feature: 'search_query', maxRetries: 0 })],
  ])('%s that failed with a retryable error and used up its retries is passed on the same way', async (_, call) => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":"server busy"}', { status: 503 })));
    await expect(call()).rejects.toThrow();
    expect(reported(logs)).toEqual([]);
  });
});

describe('an AI call while the circuit breaker has cut its provider off', () => {
  it.each([
    ['text generation', () => generateText('Summarize these jackets', options)],
    ['a chat completion', () => chat(messages, options)],
    ['embeddings', () => generateEmbeddings(['linen shirt'], { ...options, feature: 'search_query' })],
  ])('%s is explained as the provider being unavailable (503)', async (_, call) => {
    for (let i = 0; i < 5; i++) recordFailure('prov-1');

    const failed = await call().catch((e: unknown) => e);

    expect(toAppError(failed)).toMatchObject({ code: 'UPSTREAM_UNAVAILABLE', status: 503 });
  });
});
