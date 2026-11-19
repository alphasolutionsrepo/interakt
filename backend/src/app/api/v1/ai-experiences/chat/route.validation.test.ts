// src/app/api/v1/ai-experiences/chat/route.validation.test.ts
//
// A chat request with an invalid body, through both public chat routes: answered 400 with the
// first problem as the message (our wording), not a 500 from reading the zod error.

import { NextRequest } from 'next/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  getAIExperienceBySlug: vi.fn(),
  getAIExperienceByAccessToken: vi.fn(),
  chatEventStream: vi.fn(),
}));

vi.mock('@/features/feature-switches/feature-switches.service', async () => (await import('@/shared/test/feature-switches-stub')).featureSwitchesService);
vi.mock('@/features/auth/auth.api.handlers', () => ({ auth: mocks.auth }));
vi.mock('@/features/ai-experience/ai-experience.service', () => ({
  getAIExperienceBySlug: mocks.getAIExperienceBySlug,
  getAIExperienceByAccessToken: mocks.getAIExperienceByAccessToken,
}));
vi.mock('@/features/pipeline/chat-event-stream', () => ({ chatEventStream: mocks.chatEventStream }));

import { POST as chatBySlug } from '../[slug]/chat/route';

import { POST as chatByToken } from './route';

const request = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  new NextRequest(`http://interakt.test${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '1.1.1.1', ...headers },
    body: JSON.stringify(body),
  });

const byToken = (body: unknown) => chatByToken(request('/api/v1/ai-experiences/chat', body, { 'X-Access-Token': 'chat-token' }));
const bySlug = (body: unknown) =>
  chatBySlug(request('/api/v1/ai-experiences/assistant/chat', body), { params: Promise.resolve({ slug: 'assistant' }) });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue(null);
});

describe.each([
  ['the token route', byToken],
  ['the slug route', bySlug],
] as const)('%s with an invalid body', (_, call) => {
  it('answers 400 with a missing message in our wording, not 500', async () => {
    const res = await call({});
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body).toMatchObject({ success: false, code: 'BAD_REQUEST', message: 'This field is required.' });
    expect(mocks.chatEventStream).not.toHaveBeenCalled();
  });

  it('answers 400 with the message rule for an empty message', async () => {
    const res = await call({ message: '   ' });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body).toMatchObject({ code: 'BAD_REQUEST', message: 'message is required and must be a non-empty string' });
  });
});
