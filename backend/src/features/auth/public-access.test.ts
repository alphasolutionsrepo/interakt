// src/features/auth/public-access.test.ts

import { NextRequest } from 'next/server';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const warn = vi.hoisted(() => vi.fn());
vi.mock('@/shared/logger/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn, error: vi.fn() }),
}));

import {
  aiExperienceAccess,
  checkPublicAccess,
  isOriginAllowed,
  readAccessToken,
  searchExperienceAccess,
  type ExperienceAccess,
} from './public-access';

import { rateLimiter } from '@/shared/api/rate-limit';

function request(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://interakt.test/api/v1/search', { headers });
}

function access(policy: Partial<ExperienceAccess['policy']> = {}): ExperienceAccess {
  return { scope: 'search:e1', accessToken: 't1', policy: { allowedOrigins: [], perMinute: 60, ...policy } };
}

describe('readAccessToken', () => {
  it('reads X-Access-Token first, then a Bearer token, trimmed', () => {
    expect(readAccessToken(request({ 'X-Access-Token': ' t1 ' }))).toBe('t1');
    expect(readAccessToken(request({ Authorization: 'Bearer t2' }))).toBe('t2');
    expect(readAccessToken(request({ 'X-Access-Token': 't1', Authorization: 'Bearer t2' }))).toBe('t1');
  });

  it('returns an empty string without a token', () => {
    expect(readAccessToken(request())).toBe('');
    expect(readAccessToken(request({ Authorization: 'Basic abc' }))).toBe('');
  });
});

describe('isOriginAllowed', () => {
  it('allows any site, and requests without an Origin, when the list is empty', () => {
    expect(isOriginAllowed([], 'https://a.example')).toBe(true);
    expect(isOriginAllowed([], null)).toBe(true);
  });

  it('allows only listed sites when the list is set', () => {
    const list = ['https://shop.example'];
    expect(isOriginAllowed(list, 'https://shop.example')).toBe(true);
    expect(isOriginAllowed(list, 'https://other.example')).toBe(false);
  });

  it('matches entries saved with a trailing slash or a path by their site', () => {
    expect(isOriginAllowed(['https://shop.example/'], 'https://shop.example')).toBe(true);
    expect(isOriginAllowed(['https://shop.example/store/'], 'https://shop.example')).toBe(true);
    expect(isOriginAllowed(['https://shop.example/'], 'https://www.shop.example')).toBe(false);
    expect(isOriginAllowed(['https://shop.example/'], 'http://shop.example')).toBe(false);
  });

  it('allows requests that name no site (servers, apps); the rate limits still apply to them', () => {
    expect(isOriginAllowed(['https://shop.example'], null)).toBe(true);
  });

  it('refuses pages that report their site as "null" (sandboxed frames, local files) when the list is set', () => {
    expect(isOriginAllowed(['https://shop.example'], 'null')).toBe(false);
    expect(isOriginAllowed([], 'null')).toBe(true);
  });
});

describe('experience access settings', () => {
  it('reads a search experience: origins and searches per minute, with no daily total', () => {
    const stored = { searchPerMinute: 5, chatPerMinute: 7, requestsPerDay: 100 };
    expect(searchExperienceAccess({
      id: 'e1', accessToken: 't1', allowedOrigins: ['https://shop.example'], rateLimitConfig: stored,
    })).toEqual({ scope: 'search:e1', accessToken: 't1', policy: { allowedOrigins: ['https://shop.example'], perMinute: 5 } });
    expect(searchExperienceAccess({ id: 'e1' }).policy).toEqual({ allowedOrigins: [], perMinute: 60 });
  });

  it('reads an AI experience: origins, chats per minute and requests per day from its access settings', () => {
    expect(aiExperienceAccess({
      id: 'a1', accessToken: 't9',
      accessConfig: { allowedOrigins: ['https://shop.example'], rateLimits: { chatPerMinute: 3, requestsPerDay: 10 } },
    })).toEqual({ scope: 'ai:a1', accessToken: 't9', policy: { allowedOrigins: ['https://shop.example'], perMinute: 3, perDay: 10 } });
    expect(aiExperienceAccess({ id: 'a1', accessConfig: null }).policy).toEqual({ allowedOrigins: [], perMinute: 60, perDay: undefined });
  });
});

describe('checkPublicAccess', () => {
  beforeEach(() => {
    rateLimiter.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-22T12:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('refuses a site that is not on the list with 403', async () => {
    const refused = checkPublicAccess(request({ Origin: 'https://other.example' }), access({ allowedOrigins: ['https://shop.example'] }));
    expect(refused?.status).toBe(403);
    expect(await refused?.json()).toMatchObject({ code: 'FORBIDDEN' });
    expect(checkPublicAccess(request({ Origin: 'https://shop.example' }), access({ allowedOrigins: ['https://shop.example'] }))).toBeNull();
  });

  it('answers 429 with Retry-After once a client is past its per-minute limit, and frees up after the minute', async () => {
    const settings = access({ perMinute: 2 });
    const client = request({ 'X-Forwarded-For': '1.1.1.1' });
    expect(checkPublicAccess(client, settings)).toBeNull();
    expect(checkPublicAccess(client, settings)).toBeNull();

    vi.advanceTimersByTime(20_000);
    const refused = checkPublicAccess(client, settings);
    expect(refused?.status).toBe(429);
    expect(refused?.headers.get('Retry-After')).toBe('40');
    expect(await refused?.json()).toMatchObject({ code: 'RATE_LIMIT_EXCEEDED', retryAfter: 40 });

    vi.advanceTimersByTime(40_000);
    expect(checkPublicAccess(client, settings)).toBeNull();
  });

  it('counts each client separately per minute', () => {
    const settings = access({ perMinute: 1 });
    expect(checkPublicAccess(request({ 'X-Forwarded-For': '1.1.1.1' }), settings)).toBeNull();
    expect(checkPublicAccess(request({ 'X-Forwarded-For': '2.2.2.2' }), settings)).toBeNull();
    expect(checkPublicAccess(request({ 'X-Forwarded-For': '1.1.1.1' }), settings)?.status).toBe(429);
  });

  it('counts each experience separately', () => {
    const client = request({ 'X-Forwarded-For': '1.1.1.1' });
    expect(checkPublicAccess(client, { ...access({ perMinute: 1 }), scope: 'search:e1' })).toBeNull();
    expect(checkPublicAccess(client, { ...access({ perMinute: 1 }), scope: 'ai:e1' })).toBeNull();
  });

  it('applies the daily total across all clients of an experience, until 24 hours after it started', () => {
    const settings = access({ perMinute: 10, perDay: 2 });
    expect(checkPublicAccess(request({ 'X-Forwarded-For': '1.1.1.1' }), settings)).toBeNull();
    expect(checkPublicAccess(request({ 'X-Forwarded-For': '2.2.2.2' }), settings)).toBeNull();
    expect(checkPublicAccess(request({ 'X-Forwarded-For': '3.3.3.3' }), settings)?.status).toBe(429);

    vi.advanceTimersByTime(24 * 60 * 60_000);
    expect(checkPublicAccess(request({ 'X-Forwarded-For': '3.3.3.3' }), settings)).toBeNull();
  });

  it("doesn't count setup calls (widget settings) towards any limit, but checks their origin", () => {
    const settings = access({ allowedOrigins: ['https://shop.example'], perMinute: 1, perDay: 1 });
    const setup = { setup: true };
    const visitor = request({ Origin: 'https://shop.example', 'X-Forwarded-For': '1.1.1.1' });
    for (let i = 0; i < 5; i++) expect(checkPublicAccess(visitor, settings, setup)).toBeNull();
    expect(checkPublicAccess(request({ Origin: 'https://other.example' }), settings, setup)?.status).toBe(403);
    // the visitor's one message for the minute, and the experience's one for the day, are still there
    expect(checkPublicAccess(visitor, settings)).toBeNull();
    expect(checkPublicAccess(visitor, settings)?.status).toBe(429);
    expect(checkPublicAccess(request({ Origin: 'https://shop.example', 'X-Forwarded-For': '2.2.2.2' }), settings)?.status).toBe(429);
  });

  it('forgets each per-client counter once its minute is over, and the daily one after its day', () => {
    const settings = access({ perMinute: 10, perDay: 1000 });
    for (let i = 0; i < 50; i++) checkPublicAccess(request({ 'X-Forwarded-For': `10.0.0.${i}` }), settings);
    expect(rateLimiter.size()).toBe(51); // 50 clients + the daily total

    vi.advanceTimersByTime(2 * 60_000);
    checkPublicAccess(request({ 'X-Forwarded-For': '10.0.1.1' }), settings);
    expect(rateLimiter.size()).toBe(2); // the daily total + the new client

    vi.advanceTimersByTime(24 * 60 * 60_000);
    checkPublicAccess(request({ 'X-Forwarded-For': '10.0.1.2' }), settings);
    expect(rateLimiter.size()).toBe(2); // a new day + the new client
  });

  it('counts a client by the address the proxy added, whatever the client writes before it', () => {
    const settings = access({ perMinute: 1 });
    expect(checkPublicAccess(request({ 'X-Forwarded-For': '10.0.0.1, 9.9.9.9' }), settings)).toBeNull();
    expect(checkPublicAccess(request({ 'X-Forwarded-For': '10.0.0.2, 9.9.9.9' }), settings)?.status).toBe(429);
    expect(checkPublicAccess(request({ 'X-Forwarded-For': '10.0.0.1, 8.8.8.8' }), settings)).toBeNull();
  });

  it("doesn't use up the daily total with requests the per-minute limit refuses", () => {
    const settings = access({ perMinute: 1, perDay: 3 });
    const busy = request({ 'X-Forwarded-For': '1.1.1.1' });
    expect(checkPublicAccess(busy, settings)).toBeNull();
    for (let i = 0; i < 4; i++) expect(checkPublicAccess(busy, settings)?.status).toBe(429);
    expect(checkPublicAccess(request({ 'X-Forwarded-For': '2.2.2.2' }), settings)).toBeNull();
    expect(checkPublicAccess(request({ 'X-Forwarded-For': '3.3.3.3' }), settings)).toBeNull();
    expect(checkPublicAccess(request({ 'X-Forwarded-For': '4.4.4.4' }), settings)?.status).toBe(429);
  });

  it("logs which limit refused a request: the client's per-minute limit or the experience's daily total", () => {
    const settings = access({ perMinute: 1, perDay: 2 });
    checkPublicAccess(request({ 'X-Forwarded-For': '1.1.1.1' }), settings);
    checkPublicAccess(request({ 'X-Forwarded-For': '1.1.1.1' }), settings);
    expect(warn).toHaveBeenLastCalledWith('Rate limit exceeded', expect.objectContaining({ scope: 'search:e1' }));
    checkPublicAccess(request({ 'X-Forwarded-For': '2.2.2.2' }), settings);
    checkPublicAccess(request({ 'X-Forwarded-For': '3.3.3.3' }), settings);
    expect(warn).toHaveBeenLastCalledWith('Daily total reached', expect.objectContaining({ scope: 'search:e1' }));
  });

  it("counts requests from Interakt's own pages towards the limits", () => {
    const settings = access({ allowedOrigins: ['https://shop.example'], perMinute: 1, perDay: 2 });
    const own = { Origin: 'https://admin.example', 'Sec-Fetch-Site': 'same-origin', 'X-Forwarded-For': '1.1.1.1' };
    expect(checkPublicAccess(request(own), settings)).toBeNull();
    expect(checkPublicAccess(request(own), settings)?.status).toBe(429);
    expect(checkPublicAccess(request({ ...own, 'X-Forwarded-For': '2.2.2.2' }), settings)).toBeNull();
    expect(checkPublicAccess(request({ ...own, 'X-Forwarded-For': '3.3.3.3' }), settings)?.status).toBe(429);
  });

  it("always allows Interakt's own pages (the admin's widget previews), as the browser reports them", () => {
    const settings = access({ allowedOrigins: ['https://shop.example'] });
    expect(checkPublicAccess(request({ Origin: 'https://admin.example', 'Sec-Fetch-Site': 'same-origin' }), settings)).toBeNull();
    expect(checkPublicAccess(request({ Origin: 'https://admin.example', 'Sec-Fetch-Site': 'cross-site' }), settings)?.status).toBe(403);
    expect(checkPublicAccess(request({ Origin: 'https://admin.example' }), settings)?.status).toBe(403);
  });

  it('does not take forwarded headers as proof that a request comes from Interakt', () => {
    const settings = access({ allowedOrigins: ['https://shop.example'] });
    const forged = { Origin: 'https://other.example', 'X-Forwarded-Proto': 'https', 'X-Forwarded-Host': 'other.example' };
    expect(checkPublicAccess(request(forged), settings)?.status).toBe(403);
    expect(checkPublicAccess(request({ Origin: 'http://interakt.test' }), settings)?.status).toBe(403);
  });

  it('refuses the origin before counting, so refused sites do not use up the limit', () => {
    const settings = access({ allowedOrigins: ['https://shop.example'], perMinute: 1 });
    expect(checkPublicAccess(request({ Origin: 'https://other.example' }), settings)?.status).toBe(403);
    expect(checkPublicAccess(request({ Origin: 'https://shop.example' }), settings)).toBeNull();
  });
});
