// src/features/embed/embed-access.test.ts

import { NextRequest } from 'next/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  getAIExperienceByAccessToken: vi.fn(),
  getSearchExperienceByAccessToken: vi.fn(),
}));

vi.mock('@/shared/logger/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock('@/features/ai-experience/ai-experience.service', () => ({ getAIExperienceByAccessToken: mocks.getAIExperienceByAccessToken }));
vi.mock('@/features/search-experience/search-experience.service', () => {
  class UnauthorizedError extends Error {}
  class ForbiddenError extends Error {}
  return { getSearchExperienceByAccessToken: mocks.getSearchExperienceByAccessToken, UnauthorizedError, ForbiddenError };
});

import { authenticateEmbedRequest } from './embed-access';

import * as searchService from '@/features/search-experience/search-experience.service';

const ai = {
  id: 'a1', name: 'Assistant', isActive: true,
  accessConfig: { allowedOrigins: ['https://shop.example'], rateLimits: { chatPerMinute: 1, requestsPerDay: 100 }, embedConfig: { widgetTheme: 'dark' } },
};
const search = { id: 's1', name: 'Catalog', allowedOrigins: ['https://shop.example'], rateLimitConfig: { searchPerMinute: 1, chatPerMinute: 1 } };

function req(headers: Record<string, string>): NextRequest {
  return new NextRequest('http://interakt.test/api/v1/embed-snippet', { headers });
}

describe('authenticateEmbedRequest', () => {
  beforeEach(() => {
    mocks.getAIExperienceByAccessToken.mockReset().mockImplementation(async (t: string) => (t === 'chat-tok' ? ai : null));
    mocks.getSearchExperienceByAccessToken.mockReset().mockImplementation(async (t: string) => {
      if (t === 'search-tok') return search;
      throw new searchService.UnauthorizedError('unknown');
    });
  });

  it('answers 401 without a token, for an unknown one, and for an inactive experience', async () => {
    expect((await authenticateEmbedRequest(req({}))).response?.status).toBe(401);
    expect((await authenticateEmbedRequest(req({ 'X-Access-Token': 'nope' }))).response?.status).toBe(401);
    mocks.getAIExperienceByAccessToken.mockResolvedValue({ ...ai, isActive: false });
    expect((await authenticateEmbedRequest(req({ 'X-Access-Token': 'chat-tok' }))).response?.status).toBe(401);
  });

  it('finds a chat or a search experience, from any site', async () => {
    expect(await authenticateEmbedRequest(req({ 'X-Access-Token': 'chat-tok', Origin: 'https://other.example' }))).toEqual({
      experience: { accessToken: 'chat-tok', widget: 'chat', name: 'Assistant', embedConfig: { widgetTheme: 'dark' } },
    });
    expect(await authenticateEmbedRequest(req({ 'X-Access-Token': 'search-tok', Origin: 'https://other.example' }))).toEqual({
      experience: { accessToken: 'search-tok', widget: 'search', name: 'Catalog', embedConfig: {} },
    });
  });

  it("isn't counted towards any limit (a setup call)", async () => {
    for (let i = 0; i < 5; i++) {
      expect((await authenticateEmbedRequest(req({ 'X-Access-Token': 'search-tok' }))).experience).toBeDefined();
    }
  });
});
