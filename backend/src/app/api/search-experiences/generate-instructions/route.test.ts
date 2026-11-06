// app/api/search-experiences/generate-instructions/route.test.ts

/**
 * Generating summary instructions with AI: a failure answers as before and is logged
 * once, with the error, by the error response.
 */

import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { reported, type LogLine } from '@/shared/test/log-recorder';

const logs = vi.hoisted(() => [] as LogLine[]);
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
  it('answers as before and logs the failure once, as an error with the error', async () => {
    const failed = new Error('socket hang up');
    generate.mockRejectedValue(failed);
    const res = await ask();
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body).toMatchObject({ message: 'Failed to generate instructions. Please try again.' });
    expect(reported(logs)).toEqual([
      expect.objectContaining({ level: 'error', context: expect.objectContaining({ requestId: body.requestId, operation: 'generateInstructions', err: failed }) }),
    ]);
  });

  it('answers a missing index with 404 and logs it once, as a warning', async () => {
    const missing = new Error('Search index 7f1c not found');
    generate.mockRejectedValue(missing);
    const res = await ask();

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: 'NOT_FOUND', message: 'One or more indexes not found' });
    expect(reported(logs)).toEqual([expect.objectContaining({ level: 'warn', context: expect.objectContaining({ operation: 'generateInstructions' }) })]);
  });

  it('still logs a missing AI model as an error: it says "not found" too, and needs fixing', async () => {
    const modelDown = Object.assign(new Error('model "qwen2.5:14b" not found'), { name: 'AdapterError', providerKey: 'ollama', statusCode: 404 });
    generate.mockRejectedValue(modelDown);
    await ask();

    expect(reported(logs)).toEqual([expect.objectContaining({ level: 'error', context: expect.objectContaining({ err: expect.objectContaining({ cause: modelDown }) }) })]);
  });
});
