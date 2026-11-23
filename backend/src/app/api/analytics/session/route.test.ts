// src/app/api/analytics/session/route.test.ts

/**
 * Starting an analytics session stores no client address and nothing made from one,
 * whatever address headers the request carries.
 */

import { NextRequest } from 'next/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({ getOrCreateSession: vi.fn() }));

vi.mock('@/features/feature-switches/feature-switches.service', async () => (await import('@/shared/test/feature-switches-stub')).featureSwitchesService);
vi.mock('@/features/auth/auth.api.handlers', async () => (await import('@/shared/test/access-stub')).signedInAuth);
vi.mock('@/features/access/access.service', async () => (await import('@/shared/test/access-stub')).accessService);
vi.mock('@/features/analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/analytics')>()),
  getOrCreateSession: mocks.getOrCreateSession,
  endSession: vi.fn(),
  generateSessionId: () => 'generated',
}));

import { accessStub } from '@/shared/test/access-stub';

import { POST } from './route';

function start(headers: Record<string, string>) {
  return POST(new NextRequest('http://interakt.test/api/analytics/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ sessionType: 'chat' }),
  }));
}

describe('POST /api/analytics/session', () => {
  beforeEach(() => {
    mocks.getOrCreateSession.mockReset().mockResolvedValue('internal-1');
    accessStub.reset();
  });

  it('refuses a caller who is signed out, and stores nothing', async () => {
    accessStub.session = null;
    expect((await start({})).status).toBe(401);
    expect(mocks.getOrCreateSession).not.toHaveBeenCalled();
  });

  it('refuses a signed-in role without analytics:manage, and stores nothing', async () => {
    accessStub.access = { userId: 'viewer', roleId: 'viewer', roleName: 'Viewer', isAdmin: false, permissions: new Set(['analytics:view']) } as typeof accessStub.access;
    expect((await start({})).status).toBe(403);
    expect(mocks.getOrCreateSession).not.toHaveBeenCalled();
  });

  it.each([
    ['a proxy-added address', { 'X-Forwarded-For': '1.1.1.1, 9.9.9.9' }],
    ['X-Real-IP', { 'X-Real-IP': '9.9.9.9' }],
  ])('stores no address or address hash for a request with %s', async (_case, headers) => {
    expect((await start(headers)).status).toBe(200);

    const stored = mocks.getOrCreateSession.mock.calls[0][0];
    expect(stored).not.toHaveProperty('ipHash');
    expect(JSON.stringify(stored)).not.toContain('9.9.9.9');
  });

  it('still stores the session with its type and id', async () => {
    expect((await start({})).status).toBe(200);
    expect(mocks.getOrCreateSession).toHaveBeenCalledWith(
      expect.objectContaining({ externalSessionId: 'generated', sessionType: 'chat' }),
    );
  });
});
