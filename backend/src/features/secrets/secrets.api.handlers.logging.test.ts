// src/features/secrets/secrets.api.handlers.logging.test.ts

/**
 * A secret request that fails answers as before and is logged once, by the error
 * response, with the request id, the operation and the error: a warning when the request
 * was refused (name taken, a secret in use), an error when our side failed.
 */

import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { reported, type LogLine } from '@/shared/test/log-recorder';

const logs = vi.hoisted(() => [] as LogLine[]);
vi.mock('@/shared/logger/logger', async () => (await import('@/shared/test/log-recorder')).recordingLogger(logs));
vi.mock('@/shared/utils/auth-utils', () => ({ getCurrentUserId: async () => 'admin' }));
const service = vi.hoisted(() => ({
  createSecret: vi.fn(),
  deleteSecret: vi.fn(),
  SecretInUseError: class SecretInUseError extends Error {},
}));
vi.mock('./secrets.service', () => service);

import { handleCreateSecret, handleDeleteSecret } from './secrets.api.handlers';

const create = () => handleCreateSecret(new NextRequest('http://localhost/api/secrets', {
  method: 'POST',
  body: JSON.stringify({ name: 'shop_api_key', value: 'not-a-real-key' }),
}));
const remove = () => handleDeleteSecret(
  new NextRequest('http://localhost/api/secrets/s1', { method: 'DELETE' }),
  { params: Promise.resolve({ id: 's1' }) }
);

beforeEach(() => { logs.length = 0; });

describe('a secret request that fails', () => {
  it('answers a secret still in use as before and logs it once, as a warning with the error', async () => {
    const inUse = new service.SecretInUseError('Secret is still referenced by 1 config(s): tool "Orders". Remove the references before deleting.');
    service.deleteSecret.mockRejectedValue(inUse);
    const res = await remove();
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body).toMatchObject({ code: 'CONFLICT', message: inUse.message });
    expect(reported(logs)).toEqual([
      expect.objectContaining({ level: 'warn', context: expect.objectContaining({ requestId: body.requestId, operation: 'deleteSecret', err: expect.objectContaining({ cause: inUse }) }) }),
    ]);
  });

  it('answers a name that is taken as before and logs it once, as a warning', async () => {
    service.createSecret.mockRejectedValue(new Error('A secret named shop_api_key already exists'));
    const res = await create();

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: 'BAD_REQUEST', message: 'A secret named shop_api_key already exists' });
    expect(reported(logs)).toEqual([expect.objectContaining({ level: 'warn', context: expect.objectContaining({ operation: 'createSecret' }) })]);
  });

  it('logs a failure on our side once, as an error with the request id, the operation and the error', async () => {
    const down = new Error('connect ECONNREFUSED 127.0.0.1:5432');
    service.deleteSecret.mockRejectedValue(down);
    const res = await remove();
    const { requestId } = await res.json();

    expect(res.status).toBe(500);
    expect(reported(logs)).toEqual([
      expect.objectContaining({ level: 'error', context: expect.objectContaining({ requestId, operation: 'deleteSecret', err: down }) }),
    ]);
  });
});
