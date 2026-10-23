// src/features/ai-experience/access-token.middleware.test.ts

import { NextRequest } from 'next/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({ getAIExperienceByAccessToken: vi.fn() }));

vi.mock('@/shared/logger/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock('./ai-experience.service', () => ({ getAIExperienceByAccessToken: mocks.getAIExperienceByAccessToken }));

import { authenticateAIAccessToken } from './access-token.middleware';

import { rateLimiter } from '@/shared/api/rate-limit';

const experience = {
  id: 'a1', isActive: true, accessToken: 'tok',
  accessConfig: { allowedOrigins: ['https://shop.example'], rateLimits: { chatPerMinute: 1, requestsPerDay: 100 } },
};

function req(headers: Record<string, string>): NextRequest {
  return new NextRequest('http://interakt.test/api/v1/ai-experiences/chat', { method: 'POST', headers });
}

describe('authenticateAIAccessToken', () => {
  beforeEach(() => {
    rateLimiter.clear();
    mocks.getAIExperienceByAccessToken.mockReset();
    mocks.getAIExperienceByAccessToken.mockImplementation(async (token: string) => (token === 'tok' ? experience : null));
  });

  it('answers 401 without a token or with an unknown one', async () => {
    expect((await authenticateAIAccessToken(req({}))).response?.status).toBe(401);
    expect((await authenticateAIAccessToken(req({ 'X-Access-Token': 'nope' }))).response?.status).toBe(401);
  });

  it('answers 403 for an inactive experience', async () => {
    mocks.getAIExperienceByAccessToken.mockResolvedValue({ ...experience, isActive: false });
    const result = await authenticateAIAccessToken(req({ 'X-Access-Token': 'tok' }));
    expect(result.response?.status).toBe(403);
    expect(await result.response?.json()).toEqual({ error: 'AI Experience is not active' });
  });

  it("returns the experience within its settings, and refuses outside them", async () => {
    expect((await authenticateAIAccessToken(req({ 'X-Access-Token': 'tok', Origin: 'https://other.example' }))).response?.status).toBe(403);
    expect(await authenticateAIAccessToken(req({ Authorization: 'Bearer tok', Origin: 'https://shop.example' }))).toEqual({ experience });
    expect((await authenticateAIAccessToken(req({ Authorization: 'Bearer tok', Origin: 'https://shop.example' }))).response?.status).toBe(429);
  });
});
