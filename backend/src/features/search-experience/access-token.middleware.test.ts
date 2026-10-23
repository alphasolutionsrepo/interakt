// src/features/search-experience/access-token.middleware.test.ts
//
// The middleware behind /api/v1/search, /autocomplete, /summarize and /documents.

import { NextRequest } from 'next/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({ getSearchExperienceByAccessToken: vi.fn() }));

vi.mock('@/shared/logger/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock('./search-experience.service', () => {
  class UnauthorizedError extends Error {}
  class ForbiddenError extends Error {}
  return { getSearchExperienceByAccessToken: mocks.getSearchExperienceByAccessToken, UnauthorizedError, ForbiddenError };
});

import { authenticateAccessToken, createCorsHeaders } from './access-token.middleware';
import * as service from './search-experience.service';

import { checkPublicAccess, searchExperienceAccess } from '@/features/auth/public-access';
import { rateLimiter } from '@/shared/api/rate-limit';

const experience = {
  id: 's1', isActive: true, accessToken: 'tok', allowedOrigins: ['https://shop.example'],
  rateLimitConfig: { searchPerMinute: 2, chatPerMinute: 9 },
};

function req(headers: Record<string, string>): NextRequest {
  return new NextRequest('http://interakt.test/api/v1/search', { method: 'POST', headers });
}

describe('authenticateAccessToken', () => {
  beforeEach(() => {
    rateLimiter.clear();
    mocks.getSearchExperienceByAccessToken.mockReset();
    mocks.getSearchExperienceByAccessToken.mockResolvedValue(experience);
  });

  it('answers 401 without a token or with an unknown one, and 403 for an inactive experience', async () => {
    expect(await authenticateAccessToken(req({}))).toMatchObject({ success: false, response: { status: 401 } });

    mocks.getSearchExperienceByAccessToken.mockRejectedValueOnce(new service.UnauthorizedError('no'));
    expect(await authenticateAccessToken(req({ 'X-Access-Token': 'nope' }))).toMatchObject({ success: false, response: { status: 401 } });

    mocks.getSearchExperienceByAccessToken.mockRejectedValueOnce(new service.ForbiddenError('inactive'));
    expect(await authenticateAccessToken(req({ 'X-Access-Token': 'tok' }))).toMatchObject({ success: false, response: { status: 403 } });
  });

  it("applies the experience's allowed origins and rate limit", async () => {
    const other = await authenticateAccessToken(req({ 'X-Access-Token': 'tok', Origin: 'https://other.example' }));
    expect(other).toMatchObject({ success: false, response: { status: 403 } });

    const shop = { Authorization: 'Bearer tok', Origin: 'https://shop.example' };
    expect(await authenticateAccessToken(req(shop))).toEqual({ success: true, experience });
    expect(await authenticateAccessToken(req(shop))).toEqual({ success: true, experience });
    expect(await authenticateAccessToken(req(shop))).toMatchObject({ success: false, response: { status: 429 } });
  });

  it('applies no daily total to search experiences, whatever is stored', async () => {
    mocks.getSearchExperienceByAccessToken.mockResolvedValue({
      ...experience, allowedOrigins: [], rateLimitConfig: { searchPerMinute: 100, chatPerMinute: 100, requestsPerDay: 2 },
    });
    for (let i = 0; i < 5; i++) {
      expect(await authenticateAccessToken(req({ 'X-Access-Token': 'tok', 'X-Forwarded-For': `1.1.1.${i}` }))).toMatchObject({ success: true });
    }
  });

  it('shares one limit with the slug routes of the same experience', async () => {
    const shop = { 'X-Access-Token': 'tok', Origin: 'https://shop.example' };
    // Two requests through a slug route use up the per-minute limit of 2 …
    expect(checkPublicAccess(req(shop), searchExperienceAccess(experience))).toBeNull();
    expect(checkPublicAccess(req(shop), searchExperienceAccess(experience))).toBeNull();
    // … so the token route refuses the third.
    expect(await authenticateAccessToken(req(shop))).toMatchObject({ success: false, response: { status: 429 } });
  });
});

describe('createCorsHeaders', () => {
  const corsFor = (allowedOrigins: string[], origin: string | null) =>
    createCorsHeaders({ ...experience, allowedOrigins } as never, origin).get('Access-Control-Allow-Origin');

  it('names a listed site back to the browser, matching saved entries by site', () => {
    expect(corsFor(['https://shop.example/'], 'https://shop.example')).toBe('https://shop.example');
    expect(corsFor(['https://shop.example/'], 'https://other.example')).toBeNull();
  });

  it('answers any site when the list is empty', () => {
    expect(corsFor([], 'https://other.example')).toBe('https://other.example');
    expect(corsFor([], null)).toBe('*');
  });
});

describe('requests that name no site', () => {
  beforeEach(() => {
    rateLimiter.clear();
    mocks.getSearchExperienceByAccessToken.mockResolvedValue(experience);
  });

  it('are let through (servers, apps) and still rate limited', async () => {
    expect(await authenticateAccessToken(req({ 'X-Access-Token': 'tok' }))).toEqual({ success: true, experience });
    expect(await authenticateAccessToken(req({ 'X-Access-Token': 'tok' }))).toEqual({ success: true, experience });
    expect(await authenticateAccessToken(req({ 'X-Access-Token': 'tok' }))).toMatchObject({ success: false, response: { status: 429 } });
  });
});
