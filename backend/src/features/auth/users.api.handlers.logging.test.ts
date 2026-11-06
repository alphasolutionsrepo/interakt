// src/features/auth/users.api.handlers.logging.test.ts

/**
 * A user request that fails answers as before and is logged once, by the error response,
 * with the request id, the operation and the error: a warning when the request was
 * refused (the email is taken), an error when our side failed.
 */

import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { reported, type LogLine } from '@/shared/test/log-recorder';

const logs = vi.hoisted(() => [] as LogLine[]);
vi.mock('@/shared/logger/logger', async () => (await import('@/shared/test/log-recorder')).recordingLogger(logs));
vi.mock('@/shared/utils/auth-utils', () => ({ getCurrentUser: async () => ({ id: 'admin', role: 'admin' }) }));
const service = vi.hoisted(() => ({ createUser: vi.fn() }));
vi.mock('./auth.service', () => service);

import { handleCreateUser } from './users.api.handlers';

const create = () => handleCreateUser(new NextRequest('http://localhost/api/users', {
  method: 'POST',
  body: JSON.stringify({ email: 'editor@example.com', password: 'Passw0rd-long' }),
}));

beforeEach(() => { logs.length = 0; });

describe('creating a user that fails', () => {
  it('answers an email that is taken as before and logs it once, as a warning with the error', async () => {
    const taken = new Error('User with email editor@example.com already exists');
    service.createUser.mockRejectedValue(taken);
    const res = await create();
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body).toMatchObject({ code: 'BAD_REQUEST', message: taken.message });
    expect(reported(logs)).toEqual([
      expect.objectContaining({ level: 'warn', context: expect.objectContaining({ requestId: body.requestId, operation: 'createUser', err: expect.objectContaining({ cause: taken }) }) }),
    ]);
  });

  it('logs a failure on our side once, as an error with the request id, the operation and the error', async () => {
    const down = new Error('connect ECONNREFUSED 127.0.0.1:5432');
    service.createUser.mockRejectedValue(down);
    const res = await create();
    const { requestId } = await res.json();

    expect(res.status).toBe(500);
    expect(reported(logs)).toEqual([
      expect.objectContaining({ level: 'error', context: expect.objectContaining({ requestId, operation: 'createUser', err: down }) }),
    ]);
  });
});
