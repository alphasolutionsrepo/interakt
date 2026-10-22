// src/app/api/analytics/session/route.test.ts

import { NextRequest } from 'next/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({ getOrCreateSession: vi.fn() }));

vi.mock('@/features/analytics', () => ({
  getOrCreateSession: mocks.getOrCreateSession,
  endSession: vi.fn(),
  generateSessionId: () => 'generated',
  hashIP: (ip: string) => `hash(${ip})`,
}));

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
  });

  it('stores the hash of the address the proxy added', async () => {
    expect((await start({ 'X-Forwarded-For': '1.1.1.1, 9.9.9.9' })).status).toBe(200);
    expect(mocks.getOrCreateSession).toHaveBeenCalledWith(expect.objectContaining({ ipHash: 'hash(9.9.9.9)' }));
  });

  it('stores no address hash when the request has no address', async () => {
    expect((await start({})).status).toBe(200);
    expect(mocks.getOrCreateSession.mock.calls[0][0].ipHash).toBeUndefined();
  });
});
