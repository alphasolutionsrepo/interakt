// src/features/ai-providers/ai-providers.api.handlers.logging.test.ts

/**
 * Discovering a provider's models: a failure answers as before and is logged once, by
 * the error response, with the operation: a warning when the request was refused, an
 * error when Ollama failed. The errors are the ones discoverOllamaModels throws.
 */

import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { reported, type LogLine } from '@/shared/test/log-recorder';

const logs = vi.hoisted(() => [] as LogLine[]);
vi.mock('@/shared/logger/logger', async () => (await import('@/shared/test/log-recorder')).recordingLogger(logs));
vi.mock('@/shared/utils/auth-utils', () => ({ getCurrentUserId: async () => 'admin' }));
const service = vi.hoisted(() => ({ discoverOllamaModels: vi.fn() }));
vi.mock('./ai-providers.service', () => service);

import { handleDiscoverModels } from './ai-providers.api.handlers';

const ID = '7f1c0c56-3a9e-4a51-9b3f-2f7b8c1d2e3f';
const discover = () => handleDiscoverModels(
  new NextRequest(`http://localhost/api/ai-providers/${ID}/discover-models`, { method: 'POST' }),
  { params: Promise.resolve({ id: ID }) }
);

beforeEach(() => { logs.length = 0; });

describe('discovering the models of a provider that fails', () => {
  it('answers a provider that is not there as before and logs it once, as a warning', async () => {
    service.discoverOllamaModels.mockRejectedValue(new Error(`Provider with ID "${ID}" not found`));
    const res = await discover();

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: 'NOT_FOUND', message: `Provider with ID "${ID}" not found` });
    expect(reported(logs)).toEqual([expect.objectContaining({ level: 'warn', context: expect.objectContaining({ operation: 'discoverModels' }) })]);
  });

  it('logs Ollama failing to list its models once, as an error with the request id, the operation and the error', async () => {
    const failed = new Error('Failed to fetch models: HTTP 500');
    service.discoverOllamaModels.mockRejectedValue(failed);
    const res = await discover();
    const { requestId } = await res.json();

    expect(res.status).toBe(500);
    expect(reported(logs)).toEqual([
      expect.objectContaining({ level: 'error', context: expect.objectContaining({ requestId, operation: 'discoverModels', err: failed }) }),
    ]);
  });

  it('answers a provider that is not Ollama as before and logs it once, as a warning', async () => {
    service.discoverOllamaModels.mockRejectedValue(new Error('Model discovery is only supported for Ollama provider'));
    const res = await discover();

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: 'BAD_REQUEST', message: 'Model discovery is only supported for Ollama provider' });
    expect(reported(logs)).toEqual([expect.objectContaining({ level: 'warn' })]);
  });
});
