// src/features/auth/token-or-session.test.ts

import { NextRequest } from 'next/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const authMock = vi.fn();
vi.mock('./auth.api.handlers', () => ({ auth: () => authMock() }));
vi.mock('@/shared/logger/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { type ExperienceAccess } from './public-access';
import { authenticateTokenOrSession } from './token-or-session';

import { rateLimiter } from '@/shared/api/rate-limit';

function request(headers: Record<string, string>): NextRequest {
  return new NextRequest('http://interakt.test/api/v1/search', { headers });
}

function experience(policy: Partial<ExperienceAccess['policy']> = {}): ExperienceAccess {
  return { scope: 'search:e1', accessToken: 't1', policy: { allowedOrigins: [], perMinute: 60, ...policy } };
}

describe('authenticateTokenOrSession', () => {
  beforeEach(() => {
    authMock.mockReset();
    rateLimiter.clear();
  });

  it('treats the experience token as real traffic, in either header', async () => {
    authMock.mockResolvedValue(null);
    expect(await authenticateTokenOrSession(request({ Authorization: 'Bearer t1' }), experience())).toEqual({ caller: 'api', analyticsSource: 'api' });
    expect(await authenticateTokenOrSession(request({ 'X-Access-Token': 't1' }), experience())).toEqual({ caller: 'api', analyticsSource: 'api' });
  });

  it("records the token caller as a test when the admin's session comes with it (the Widget playground)", async () => {
    authMock.mockResolvedValue({ user: { id: 'u' } });
    expect(await authenticateTokenOrSession(request({ 'X-Access-Token': 't1' }), experience())).toEqual({ caller: 'api', analyticsSource: 'admin_test' });
  });

  it('falls back to an admin session when there is no matching token', async () => {
    authMock.mockResolvedValue({ user: { id: 'u' } });
    expect(await authenticateTokenOrSession(request({}), experience())).toEqual({ caller: 'admin', analyticsSource: 'admin_test' });
    expect(await authenticateTokenOrSession(request({ Authorization: 'Bearer wrong' }), experience())).toEqual({ caller: 'admin', analyticsSource: 'admin_test' });
  });

  it('rejects a request with neither, leaving the 401 to the route', async () => {
    authMock.mockResolvedValue(null);
    expect(await authenticateTokenOrSession(request({ Authorization: 'Bearer wrong' }), experience())).toEqual({ caller: null });
  });

  it("applies the experience's allowed origins and rate limit to a token caller", async () => {
    const settings = experience({ allowedOrigins: ['https://shop.example'], perMinute: 1 });
    const other = await authenticateTokenOrSession(request({ 'X-Access-Token': 't1', Origin: 'https://other.example' }), settings);
    expect(other.caller).toBeNull();
    expect(other.refused?.status).toBe(403);

    const shop = { 'X-Access-Token': 't1', Origin: 'https://shop.example' };
    expect(await authenticateTokenOrSession(request(shop), settings)).toMatchObject({ caller: 'api' });
    expect((await authenticateTokenOrSession(request(shop), settings)).refused?.status).toBe(429);
  });

  it("doesn't apply them to a signed-in admin (the playground)", async () => {
    authMock.mockResolvedValue({ user: { id: 'u' } });
    const settings = experience({ allowedOrigins: ['https://shop.example'], perMinute: 1 });
    for (let i = 0; i < 3; i++) {
      expect(await authenticateTokenOrSession(request({ Origin: 'https://other.example' }), settings)).toMatchObject({ caller: 'admin' });
    }
  });
});
