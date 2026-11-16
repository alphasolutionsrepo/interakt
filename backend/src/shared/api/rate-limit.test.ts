// src/shared/api/rate-limit.test.ts

import { NextRequest, NextResponse } from 'next/server';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { rateLimiter, withRateLimit } from './rate-limit';

describe('rateLimiter', () => {
  beforeEach(() => {
    rateLimiter.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-22T12:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('allows up to the limit in a window, then gives the seconds until it frees up', () => {
    expect(rateLimiter.check('k', 2, 60_000)).toEqual({ allowed: true, remaining: 1 });
    expect(rateLimiter.check('k', 2, 60_000)).toEqual({ allowed: true, remaining: 0 });
    vi.advanceTimersByTime(15_000);
    expect(rateLimiter.check('k', 2, 60_000)).toEqual({ allowed: false, retryAfter: 45, remaining: 0 });
    vi.advanceTimersByTime(45_000);
    expect(rateLimiter.check('k', 2, 60_000).allowed).toBe(true);
  });

  it("drops each entry once its own window is over: a minute's after a minute, a day's after a day", () => {
    rateLimiter.check('minute', 5, 60_000);
    rateLimiter.check('day', 1, 24 * 60 * 60_000);
    vi.advanceTimersByTime(30 * 60_000);
    rateLimiter.check('trigger cleanup', 5, 60_000);
    expect(rateLimiter.size()).toBe(2); // the day entry and the new one
    expect(rateLimiter.check('day', 1, 24 * 60 * 60_000).allowed).toBe(false);
  });
});

describe('withRateLimit', () => {
  beforeEach(() => rateLimiter.clear());

  it('counts each client by the address the proxy added', async () => {
    const handler = withRateLimit(async (_request: NextRequest) => NextResponse.json({ ok: true }), { maxRequests: 1 });
    const from = (forwardedFor: string) =>
      handler(new NextRequest('http://interakt.test/api/x', { headers: { 'X-Forwarded-For': forwardedFor } }));
    expect((await from('10.0.0.1, 7.7.7.7')).status).toBe(200);
    expect((await from('10.0.0.2, 7.7.7.7')).status).toBe(429);
    expect((await from('10.0.0.2, 6.6.6.6')).status).toBe(200);
  });

  it('counts IPv6 addresses in one /56 together, and a different /56 apart', async () => {
    const handler = withRateLimit(async (_request: NextRequest) => NextResponse.json({ ok: true }), { maxRequests: 1 });
    const from = (forwardedFor: string) =>
      handler(new NextRequest('http://interakt.test/api/x', { headers: { 'X-Forwarded-For': forwardedFor } }));
    expect((await from('2001:db8:1:200::1')).status).toBe(200);
    expect((await from('2001:db8:1:2ff:abcd::9')).status).toBe(429);
    expect((await from('2001:db8:1:300::1')).status).toBe(200);
  });

  it('counts by a key function that answers asynchronously', async () => {
    rateLimiter.clear();
    const limited = withRateLimit(async (_request: NextRequest) => NextResponse.json({ ok: true }), { maxRequests: 1, keyFn: async () => ({ key: 'k', shared: false }) });
    const req = () => new NextRequest('http://localhost/api/x');
    expect((await limited(req())).status).toBe(200);
    expect((await limited(req())).status).toBe(429);
  });

  it('counts requests with no trusted address together, at ten times the limit, apart from addressed clients', async () => {
    rateLimiter.clear();
    const limited = withRateLimit(async (_request: NextRequest) => NextResponse.json({ ok: true }), { maxRequests: 1 });
    const unaddressed = () => limited(new NextRequest('http://localhost/api/x'));
    for (let i = 0; i < 10; i++) {
      const response = await unaddressed();
      expect(response.status).toBe(200);
      expect(response.headers.get('X-RateLimit-Limit')).toBe('10');
    }
    const refused = await unaddressed();
    expect(refused.status).toBe(429);
    expect(refused.headers.get('X-RateLimit-Limit')).toBe('10');
    // A client with a trusted address keeps its own count
    expect((await limited(new NextRequest('http://localhost/api/x', { headers: { 'X-Forwarded-For': '1.1.1.1' } }))).status).toBe(200);
  });

  it('refuses in the shared shape, with a request id, when to try again and the limit', async () => {
    const handler = withRateLimit(async (_request: NextRequest) => NextResponse.json({ ok: true }), { maxRequests: 1 });
    const ask = () => handler(new NextRequest('http://interakt.test/api/x', { headers: { 'X-Forwarded-For': '1.1.1.1' } }));
    await ask();
    const refused = await ask();

    expect(refused.status).toBe(429);
    expect(await refused.json()).toMatchObject({
      success: false, code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests', error: 'Too many requests',
      requestId: expect.any(String), retryAfter: expect.any(Number),
    });
    expect(refused.headers.get('Retry-After')).toMatch(/^\d+$/);
    expect(refused.headers.get('X-RateLimit-Limit')).toBe('1');
    expect(refused.headers.get('X-RateLimit-Remaining')).toBe('0');
  });
});
