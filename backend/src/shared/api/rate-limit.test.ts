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

describe('rateLimiter limits', () => {
  beforeEach(() => rateLimiter.clear());
  afterEach(() => rateLimiter.setMaxEntries());

  it('holds at most its set number of entries, dropping the oldest first', () => {
    rateLimiter.setMaxEntries(3);
    for (const id of ['a', 'b', 'c', 'd', 'e']) rateLimiter.check(id, 5, 60_000);
    expect(rateLimiter.size()).toBe(3);
    // a and b went first: they start again; e still has its count
    expect(rateLimiter.check('a', 5, 60_000)).toMatchObject({ remaining: 4 });
    expect(rateLimiter.check('e', 5, 60_000)).toMatchObject({ remaining: 3 });
  });

  it('drops by when a window started: a counter whose window restarted is kept over older ones', () => {
    vi.useFakeTimers();
    try {
      rateLimiter.setMaxEntries(3);
      rateLimiter.check('a', 5, 1_000);
      vi.advanceTimersByTime(500);
      rateLimiter.check('b', 5, 60_000);
      rateLimiter.check('c', 5, 60_000);
      vi.advanceTimersByTime(600);
      // a's window is over: it starts a new one, now the newest
      rateLimiter.check('a', 5, 1_000);
      rateLimiter.check('a', 5, 1_000);
      rateLimiter.check('d', 5, 60_000);
      // b went (the oldest window); a kept its new count
      expect(rateLimiter.check('a', 5, 1_000)).toMatchObject({ remaining: 2 });
      expect(rateLimiter.check('b', 5, 60_000)).toMatchObject({ remaining: 4 });
    } finally {
      vi.useRealTimers();
    }
  });

  it('tells how many requests an identifier has in its window, and when the window ends', () => {
    vi.useFakeTimers();
    try {
      expect(rateLimiter.count('c')).toBe(0);
      expect(rateLimiter.retryAfter('c')).toBe(0);
      rateLimiter.check('c', 5, 60_000);
      rateLimiter.check('c', 5, 60_000);
      vi.advanceTimersByTime(20_000);
      expect(rateLimiter.count('c')).toBe(2);
      expect(rateLimiter.retryAfter('c')).toBe(40);
      vi.advanceTimersByTime(40_000);
      expect(rateLimiter.count('c')).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('when full, drops expired entries first, even with the regular sweep not due', () => {
    vi.useFakeTimers();
    try {
      rateLimiter.setMaxEntries(3);
      rateLimiter.check('day', 5, 24 * 60 * 60_000);
      rateLimiter.check('short', 5, 1_000);
      rateLimiter.check('m', 5, 60_000);
      vi.advanceTimersByTime(2_000); // short is over; the once-a-minute sweep isn't due
      rateLimiter.check('n', 5, 60_000);
      // short went, not the daily total or the minute counters
      expect(rateLimiter.size()).toBe(3);
      expect(rateLimiter.check('day', 5, 24 * 60 * 60_000)).toMatchObject({ remaining: 3 });
      expect(rateLimiter.check('m', 5, 60_000)).toMatchObject({ remaining: 3 });
    } finally {
      vi.useRealTimers();
    }
  });

  it('when full of live counters, keeps a daily total and drops the short windows that started first', () => {
    rateLimiter.setMaxEntries(3);
    rateLimiter.check('day', 5, 24 * 60 * 60_000);
    rateLimiter.check('day', 5, 24 * 60 * 60_000);
    for (const id of ['a', 'b', 'c', 'd']) rateLimiter.check(id, 5, 60_000);
    expect(rateLimiter.size()).toBe(3);
    // the daily total kept its count through a flood of new keys
    expect(rateLimiter.check('day', 5, 24 * 60 * 60_000)).toMatchObject({ remaining: 2 });
    expect(rateLimiter.check('d', 5, 60_000)).toMatchObject({ remaining: 3 });
  });

  it('drops long windows too once nothing shorter is left', () => {
    rateLimiter.setMaxEntries(2);
    for (const id of ['x', 'y', 'z']) rateLimiter.check(id, 5, 24 * 60 * 60_000);
    expect(rateLimiter.size()).toBe(2);
    expect(rateLimiter.check('x', 5, 24 * 60 * 60_000)).toMatchObject({ remaining: 4 });
  });
});

describe('withRateLimit', () => {
  beforeEach(() => rateLimiter.clear());

  it('counts a route as one, whatever id is in its path, and keeps routes apart', async () => {
    const one = withRateLimit(async (_request: NextRequest) => NextResponse.json({ ok: true }), { maxRequests: 2 });
    const other = withRateLimit(async (_request: NextRequest) => NextResponse.json({ ok: true }), { maxRequests: 2 });
    const at = (path: string) => new NextRequest(`http://interakt.test${path}`, { headers: { 'X-Forwarded-For': '1.1.1.1' } });
    expect((await one(at('/api/docs/a'))).status).toBe(200);
    expect((await one(at('/api/docs/b'))).status).toBe(200);
    expect((await one(at('/api/docs/c'))).status).toBe(429);
    expect((await other(at('/api/docs/a'))).status).toBe(200);
  });

  it("counts each of the route's own [id] apart, and an id below it (a document) together", async () => {
    type Ctx = { params: Promise<Record<string, string>> };
    const health = withRateLimit(async (_request: NextRequest, _ctx: Ctx) => NextResponse.json({ ok: true }), { maxRequests: 2 });
    const req = () => new NextRequest('http://interakt.test/api/x', { headers: { 'X-Forwarded-For': '1.1.1.2' } });
    const ctx = (params: Record<string, string>): Ctx => ({ params: Promise.resolve(params) });
    // Two data sources: each has its own allowance
    expect((await health(req(), ctx({ id: 'source-a' }))).status).toBe(200);
    expect((await health(req(), ctx({ id: 'source-a' }))).status).toBe(200);
    expect((await health(req(), ctx({ id: 'source-a' }))).status).toBe(429);
    expect((await health(req(), ctx({ id: 'source-b' }))).status).toBe(200);
    // Documents in one index: one allowance, whatever the document id
    const doc = withRateLimit(async (_request: NextRequest, _ctx: Ctx) => NextResponse.json({ ok: true }), { maxRequests: 2 });
    expect((await doc(req(), ctx({ id: 'index-a', documentId: 'd1' }))).status).toBe(200);
    expect((await doc(req(), ctx({ id: 'index-a', documentId: 'd2' }))).status).toBe(200);
    expect((await doc(req(), ctx({ id: 'index-a', documentId: 'd3' }))).status).toBe(429);
    expect((await doc(req(), ctx({ id: 'index-b', documentId: 'd1' }))).status).toBe(200);
  });

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

  it("hands the route's own [id] to the key function, which decides whether it is counted apart", async () => {
    type Ctx = { params: Promise<Record<string, string>> };
    const seen: (string | undefined)[] = [];
    const limited = withRateLimit(async (_request: NextRequest, _ctx: Ctx) => NextResponse.json({ ok: true }), {
      maxRequests: 1,
      keyFn: (_request, id) => { seen.push(id); return { key: 'one-count', shared: false }; },
    });
    const req = () => new NextRequest('http://interakt.test/api/x');
    expect((await limited(req(), { params: Promise.resolve({ id: 'a', documentId: 'd' }) })).status).toBe(200);
    // The key function left the id out, so a second id shares the count
    expect((await limited(req(), { params: Promise.resolve({ id: 'b' }) })).status).toBe(429);
    expect(seen).toEqual(['a', 'b']);
  });

  it('leaves a request to the handler, uncounted and without headers, when the key function answers null', async () => {
    rateLimiter.clear();
    const limited = withRateLimit(async (_request: NextRequest) => NextResponse.json({ ok: true }), { maxRequests: 1, keyFn: () => null });
    const req = () => new NextRequest('http://localhost/api/x');
    expect((await limited(req())).status).toBe(200);
    const second = await limited(req());
    expect(second.status).toBe(200);
    expect(second.headers.get('X-RateLimit-Limit')).toBeNull();
    expect(rateLimiter.size()).toBe(0);
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
