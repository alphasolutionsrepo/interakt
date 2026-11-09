// app/api/search-experiences/generate-instructions/route.test.ts

/**
 * Generating summary instructions with AI: a failure answers as what it is (indexes that
 * are gone, an AI model that is missing) and is logged once, with the error, by the
 * error response.
 */

import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppError, INTERNAL_MESSAGE } from '@/shared/errors/app-error';
import { reported, type LogLine } from '@/shared/test/log-recorder';

const logs = vi.hoisted(() => [] as LogLine[]);
vi.mock('@/features/auth/auth.api.handlers', async () => (await import('@/shared/test/access-stub')).signedInAuth);
vi.mock('@/features/access/access.service', async () => (await import('@/shared/test/access-stub')).accessService);
vi.mock('@/shared/logger/logger', async () => (await import('@/shared/test/log-recorder')).recordingLogger(logs));
vi.mock('@/shared/utils/auth-utils', () => ({ getCurrentUserId: async () => 'admin' }));
const generate = vi.hoisted(() => vi.fn());
vi.mock('@/features/search-experience/search-experience.service', () => ({ generateCustomInstructions: generate }));

import { POST } from './route';

const ask = () => POST(new NextRequest('http://localhost/api/search-experiences/generate-instructions', {
  method: 'POST',
  body: JSON.stringify({ experienceName: 'Catalog', indexIds: ['7f1c0c56-3a9e-4a51-9b3f-2f7b8c1d2e3f'], type: 'summary' }),
}));

beforeEach(() => { logs.length = 0; });

describe('instructions the AI could not generate', () => {
  it('answers a failure it does not recognise with the plain message and logs it once, as an error with the error', async () => {
    const failed = new Error('socket hang up');
    generate.mockRejectedValue(failed);
    const res = await ask();
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body).toMatchObject({ message: INTERNAL_MESSAGE });
    expect(reported(logs)).toEqual([
      expect.objectContaining({ level: 'error', context: expect.objectContaining({ requestId: body.requestId, operation: 'generateInstructions', err: failed }) }),
    ]);
  });

  it('answers indexes that are gone with 404 and logs it once, as a warning', async () => {
    generate.mockRejectedValue(new AppError('None of the selected indexes could be found', { code: 'NOT_FOUND', status: 404 }));
    const res = await ask();

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: 'NOT_FOUND', message: 'None of the selected indexes could be found' });
    expect(reported(logs)).toEqual([expect.objectContaining({ level: 'warn', context: expect.objectContaining({ operation: 'generateInstructions' }) })]);
  });

  it('answers a missing AI model as that, not as missing indexes, and logs it once as an error', async () => {
    const modelDown = Object.assign(new Error('model "qwen2.5:14b" not found'), { name: 'AdapterError', providerKey: 'ollama', statusCode: 404 });
    generate.mockRejectedValue(modelDown);
    const res = await ask();
    const body = await res.json();

    expect(body.message).not.toMatch(/index/i);
    expect(reported(logs)).toEqual([expect.objectContaining({ level: 'error', context: expect.objectContaining({ operation: 'generateInstructions' }) })]);
  });
});

describe('instructions whose AI model setting is gone', () => {
  it('tells the admin which setting to fix', async () => {
    generate.mockRejectedValue(Object.assign(new Error('Model not found: 42'), { name: 'AIServiceError', code: 'MODEL_NOT_FOUND' }));
    const res = await ask();

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: 'MODEL_NOT_FOUND', message: 'Model not found: 42' });
  });
});
