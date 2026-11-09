// src/features/analytics/intent-clustering.labels-failure.test.ts

/**
 * When the model can't name the intent clusters, they get plain labels instead. The line
 * left is the only record, so a model that is down or missing is logged as an error (it
 * needs fixing), an answer it couldn't read as a warning, as before.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { reported, type LogLine } from '@/shared/test/log-recorder';

const logs = vi.hoisted(() => [] as LogLine[]);
vi.mock('@/shared/logger/logger', async () => (await import('@/shared/test/log-recorder')).recordingLogger(logs));
vi.mock('server-only', () => ({}));
const ai = vi.hoisted(() => ({ chat: vi.fn() }));
vi.mock('@/features/ai-service/ai-service.service', () => ({
  // Every intent alike, so they form one cluster to label
  generateEmbeddings: async (texts: string[]) => ({ embeddings: texts.map(() => ({ vector: [1, 0, 0] })) }),
  chat: ai.chat,
}));

import { clusterIntents } from './intent-clustering';

const entries = ['find red shoes', 'look for red sneakers', 'search red trainers', 'show red running shoes']
  .map((reasoning) => ({ reasoning, outcome: 'success', userMessage: reasoning }));

beforeEach(() => { logs.length = 0; });

describe('cluster labels the model cannot write', () => {
  it('logs a model that is missing as an error, with the error', async () => {
    const modelDown = Object.assign(new Error('model "qwen2.5:14b" not found'), { name: 'AdapterError', providerKey: 'ollama', statusCode: 404 });
    ai.chat.mockRejectedValue(modelDown);
    const result = await clusterIntents(entries as never);

    expect(result.clusters.length).toBeGreaterThan(0);
    expect(reported(logs)).toEqual([expect.objectContaining({ level: 'error', context: expect.objectContaining({ err: modelDown }) })]);
  });

  it('logs an answer it could not read as a warning, as before', async () => {
    ai.chat.mockResolvedValue({ message: { content: 'Sorry, I cannot help with that.' } });
    await clusterIntents(entries as never);
    expect(reported(logs)).toEqual([expect.objectContaining({ level: 'warn', context: expect.objectContaining({ err: expect.any(Error) }) })]);
  });
});
