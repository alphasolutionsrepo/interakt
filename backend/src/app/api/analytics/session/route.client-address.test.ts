// src/app/api/analytics/session/route.client-address.test.ts

/**
 * A session is stored with a hash of the client's address, and only of an address a proxy of ours
 * added: a header the client can write on its own (X-Real-IP, a last X-Forwarded-For entry that
 * is not an address) is not hashed.
 */

import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/features/feature-switches/feature-switches.service', async () => (await import('@/shared/test/feature-switches-stub')).featureSwitchesService);
vi.mock('@/features/auth/auth.api.handlers', async () => (await import('@/shared/test/access-stub')).signedInAuth);
vi.mock('@/features/access/access.service', async () => (await import('@/shared/test/access-stub')).accessService);
const sessions = vi.hoisted(() => ({ getOrCreateSession: vi.fn(), endSession: vi.fn(), hashIP: vi.fn() }));
vi.mock('@/features/analytics', () => ({ ...sessions, generateSessionId: () => 'generated' }));

import { POST as startSession } from './route';

const start = (headers: Record<string, string>) =>
  startSession(new NextRequest('http://localhost/api/analytics/session', { method: 'POST', headers, body: JSON.stringify({}) }));
const storedHash = () => sessions.getOrCreateSession.mock.calls[0][0].ipHash;

beforeEach(() => {
  vi.clearAllMocks();
  sessions.getOrCreateSession.mockResolvedValue('internal-1');
  sessions.hashIP.mockImplementation((ip: string) => `hash-of-${ip}`);
});

describe('the address a new analytics session is stored with', () => {
  it('hashes the address the proxy added', async () => {
    expect((await start({ 'X-Forwarded-For': '1.1.1.1, 9.9.9.9' })).status).toBe(200);

    expect(sessions.hashIP).toHaveBeenCalledWith('9.9.9.9');
    expect(storedHash()).toBe('hash-of-9.9.9.9');
  });

  it('stores no hash for a request with only X-Real-IP, which a client can write', async () => {
    expect((await start({ 'X-Real-IP': '8.8.8.8' })).status).toBe(200);

    expect(sessions.hashIP).not.toHaveBeenCalled();
    expect(storedHash()).toBeUndefined();
  });

  it('stores no hash when the last X-Forwarded-For entry is not an address', async () => {
    expect((await start({ 'X-Forwarded-For': '1.1.1.1, not-an-address' })).status).toBe(200);

    expect(sessions.hashIP).not.toHaveBeenCalled();
    expect(storedHash()).toBeUndefined();
  });
});
