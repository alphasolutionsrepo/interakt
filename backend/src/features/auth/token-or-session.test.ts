// src/features/auth/token-or-session.test.ts

import { NextRequest } from 'next/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const authMock = vi.fn();
vi.mock('@/features/feature-switches/feature-switches.service', async () => (await import('@/shared/test/feature-switches-stub')).featureSwitchesService);
vi.mock('@/features/access/access.service', async () => (await import('@/shared/test/access-stub')).accessService);
vi.mock('./auth.api.handlers', () => ({ auth: () => authMock() }));
vi.mock('@/shared/logger/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { type ExperienceAccess } from './public-access';
import { authenticateTokenOrSession } from './token-or-session';

import { TURNED_OFF_CODE } from '@/features/feature-switches/areas';
import { rateLimiter } from '@/shared/api/rate-limit';
import { accessStub } from '@/shared/test/access-stub';
import { featureSwitchesService, featureSwitchesStub } from '@/shared/test/feature-switches-stub';

function request(headers: Record<string, string>): NextRequest {
  return new NextRequest('http://interakt.test/api/v1/search', { headers });
}

function experience(policy: Partial<ExperienceAccess['policy']> = {}): ExperienceAccess {
  return { scope: 'search:e1', accessToken: 't1', isBuiltIn: false, policy: { allowedOrigins: [], perMinute: 60, ...policy } };
}

describe('authenticateTokenOrSession', () => {
  beforeEach(() => {
    authMock.mockReset();
    rateLimiter.clear();
    featureSwitchesStub.reset();
    vi.restoreAllMocks();
  });

  it('treats the experience token as real traffic, in either header', async () => {
    authMock.mockResolvedValue(null);
    expect(await authenticateTokenOrSession(request({ Authorization: 'Bearer t1' }), experience())).toEqual({ caller: 'api', analyticsSource: 'api' });
    expect(await authenticateTokenOrSession(request({ 'X-Access-Token': 't1' }), experience())).toEqual({ caller: 'api', analyticsSource: 'api' });
  });

  it("records the token caller as a test only with the test marker and the admin's login (the Widget playground)", async () => {
    authMock.mockResolvedValue({ user: { id: 'u' } });
    const playground = { 'X-Access-Token': 't1', 'X-Interakt-Test': '1' };
    expect(await authenticateTokenOrSession(request(playground), experience())).toEqual({ caller: 'api', analyticsSource: 'admin_test' });
    // A signed-in admin using a live widget sends the login but no marker
    expect(await authenticateTokenOrSession(request({ 'X-Access-Token': 't1' }), experience())).toEqual({ caller: 'api', analyticsSource: 'api' });

    // A visitor can send the marker but not the login
    authMock.mockResolvedValue(null);
    expect(await authenticateTokenOrSession(request(playground), experience())).toEqual({ caller: 'api', analyticsSource: 'api' });
  });

  it('records the marked token caller as live traffic while Playground is off, or the switches cannot be read', async () => {
    authMock.mockResolvedValue({ user: { id: 'u' } });
    const playground = { 'X-Access-Token': 't1', 'X-Interakt-Test': '1' };
    featureSwitchesStub.off.add('playground');
    expect(await authenticateTokenOrSession(request(playground), experience())).toEqual({ caller: 'api', analyticsSource: 'api' });

    featureSwitchesStub.reset();
    const isAreaOn = featureSwitchesService.isAreaOn;
    vi.spyOn(featureSwitchesService, 'isAreaOn').mockImplementation(async (area) => {
      if (area === 'playground') throw new Error('database down');
      return isAreaOn(area);
    });
    expect(await authenticateTokenOrSession(request(playground), experience())).toEqual({ caller: 'api', analyticsSource: 'api' });
  });

  it("doesn't look up a login for a token caller without the marker", async () => {
    await authenticateTokenOrSession(request({ 'X-Access-Token': 't1' }), experience());
    expect(authMock).not.toHaveBeenCalled();
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

  describe("with the experience's area off", () => {
    // What a caller gets, as the route answers it (no `refused`: the route's 401)
    const answer = async (headers: Record<string, string>) => {
      const result = await authenticateTokenOrSession(request(headers), experience());
      const body = (await result.refused?.json()) as { code?: string } | undefined;
      return { caller: result.caller, status: result.refused?.status ?? (result.caller ? 200 : 401), code: body?.code };
    };

    beforeEach(() => accessStub.reset());

    it('answers a caller with no token and no session, or a wrong token, exactly as with it on', async () => {
      authMock.mockResolvedValue(null);
      const on = [await answer({}), await answer({ 'X-Access-Token': 'wrong' })];
      featureSwitchesStub.off.add('search');
      expect([await answer({}), await answer({ 'X-Access-Token': 'wrong' })]).toEqual(on);
      expect(on.map((a) => a.status)).toEqual([401, 401]);
    });

    it('answers a role without the playground permission 403, as with it on', async () => {
      authMock.mockResolvedValue({ user: { id: 'u' } });
      accessStub.access = { userId: 'u', roleId: 'r', roleName: 'Nothing', isAdmin: false, permissions: new Set() };
      const on = await answer({});
      featureSwitchesStub.off.add('search');
      expect(await answer({})).toEqual(on);
      expect(on).toMatchObject({ status: 403, code: 'FORBIDDEN' });
    });

    it('tells a caller with the right token, or an Admin session, that it is turned off', async () => {
      featureSwitchesStub.off.add('search');
      authMock.mockResolvedValue(null);
      expect(await answer({ 'X-Access-Token': 't1' })).toMatchObject({ status: 404, code: TURNED_OFF_CODE });
      authMock.mockResolvedValue({ user: { id: 'u' } });
      expect(await answer({})).toMatchObject({ status: 404, code: TURNED_OFF_CODE });
    });
  });

  describe('Playground off, for a session (the Test pages)', () => {
    beforeEach(() => accessStub.reset());

    it('refuses an admin session "turned off" even though the experience area is on', async () => {
      featureSwitchesStub.off.add('playground');
      authMock.mockResolvedValue({ user: { id: 'u' } });
      const result = await authenticateTokenOrSession(request({}), experience());
      expect(result.caller).toBeNull();
      expect(result.refused?.status).toBe(404);
      expect(await result.refused?.json()).toMatchObject({ code: TURNED_OFF_CODE });
    });

    it('does not refuse the same call with Playground on, nor the token caller with it off', async () => {
      authMock.mockResolvedValue({ user: { id: 'u' } });
      expect(await authenticateTokenOrSession(request({}), experience())).toMatchObject({ caller: 'admin' });
      featureSwitchesStub.off.add('playground');
      expect(await authenticateTokenOrSession(request({ 'X-Access-Token': 't1' }), experience())).toMatchObject({ caller: 'api' });
    });

    it('does not apply to the built-in help, which is the Help assistant\'s', async () => {
      featureSwitchesStub.off.add('playground');
      authMock.mockResolvedValue({ user: { id: 'u' } });
      const help = { ...experience(), isBuiltIn: true };
      expect(await authenticateTokenOrSession(request({}), help)).toMatchObject({ caller: 'admin' });
    });

    it('answers a caller with no session 401, not "turned off"', async () => {
      featureSwitchesStub.off.add('playground');
      authMock.mockResolvedValue(null);
      expect(await authenticateTokenOrSession(request({}), experience())).toEqual({ caller: null });
    });
  });
});
