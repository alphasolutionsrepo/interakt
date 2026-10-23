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
});
