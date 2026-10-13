// src/features/auth/token-or-session.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

const authMock = vi.fn();
vi.mock('./auth.api.handlers', () => ({ auth: () => authMock() }));

import { authenticateTokenOrSession } from './token-or-session';

function request(headers: Record<string, string>): NextRequest {
  return { headers: new Headers(headers) } as unknown as NextRequest;
}

describe('authenticateTokenOrSession', () => {
  beforeEach(() => authMock.mockReset());

  it('treats the experience token as real traffic, in either header', async () => {
    expect(await authenticateTokenOrSession(request({ Authorization: 'Bearer t1' }), 't1')).toBe('api');
    expect(await authenticateTokenOrSession(request({ 'X-Access-Token': 't1' }), 't1')).toBe('api');
    expect(authMock).not.toHaveBeenCalled();
  });

  it('falls back to an admin session when there is no matching token', async () => {
    authMock.mockResolvedValue({ user: { id: 'u' } });
    expect(await authenticateTokenOrSession(request({}), 't1')).toBe('admin');
    expect(await authenticateTokenOrSession(request({ Authorization: 'Bearer wrong' }), 't1')).toBe('admin');
  });

  it('rejects a request with neither', async () => {
    authMock.mockResolvedValue(null);
    expect(await authenticateTokenOrSession(request({ Authorization: 'Bearer wrong' }), 't1')).toBeNull();
  });
});
