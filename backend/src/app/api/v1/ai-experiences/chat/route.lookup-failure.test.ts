// src/app/api/v1/ai-experiences/chat/route.lookup-failure.test.ts
//
// A chat request whose login lookup or experience lookup fails, before any turn starts,
// through both public chat routes: answered like any error (JSON, a plain message to the
// caller, the request id), logged once as an error with the operation and the error.

import { NextRequest } from 'next/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  getAIExperienceBySlug: vi.fn(),
  getAIExperienceByAccessToken: vi.fn(),
}));

const logs = vi.hoisted(() => [] as LogLine[]);
vi.mock('@/shared/logger/logger', async () => (await import('@/shared/test/log-recorder')).recordingLogger(logs));
vi.mock('@/features/auth/auth.api.handlers', () => ({ auth: mocks.auth }));
vi.mock('@/features/ai-experience/ai-experience.service', () => ({
  getAIExperienceBySlug: mocks.getAIExperienceBySlug,
  getAIExperienceByAccessToken: mocks.getAIExperienceByAccessToken,
}));
// No turn starts in these tests
vi.mock('@/features/pipeline/chat-event-stream', () => ({ chatEventStream: vi.fn() }));

import { POST as chatBySlug } from '../[slug]/chat/route';

import { POST as chatByToken } from './route';

import { PUBLIC_FAILURE_MESSAGE } from '@/shared/api/response';
import { TEST_MARKER_HEADER } from '@/shared/constants/test-marker.constants';
import { reported, type LogLine } from '@/shared/test/log-recorder';

const experience = {
  id: 'a1', slug: 'assistant', name: 'Assistant', isActive: true, accessToken: 'chat-token',
  accessConfig: { allowedOrigins: [], rateLimits: { chatPerMinute: 100, requestsPerDay: 100 } },
};

const down = () => new Error('connect ECONNREFUSED 10.0.0.5:5432');

function chatRequest(path: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(`http://interakt.test${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ message: 'do you have jeans?' }),
  });
}

const byToken = (headers: Record<string, string> = {}) => chatByToken(chatRequest('/api/v1/ai-experiences/chat', headers));
const bySlug = (headers: Record<string, string> = {}) =>
  chatBySlug(chatRequest('/api/v1/ai-experiences/assistant/chat', headers), { params: Promise.resolve({ slug: 'assistant' }) });

beforeEach(() => {
  logs.length = 0;
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue(null);
  mocks.getAIExperienceBySlug.mockResolvedValue(experience);
  mocks.getAIExperienceByAccessToken.mockResolvedValue(experience);
});

describe('a chat request whose lookup fails', () => {
  it.each([
    ['the login, on the token route without a token', 'auth', () => byToken(), 'chatByToken'],
    ['the login, on the token route for a test from the playground', 'auth', () => byToken({ 'X-Access-Token': 'chat-token', [TEST_MARKER_HEADER]: '1' }), 'chatByToken'],
    ['the experience, on the token route', 'getAIExperienceByAccessToken', () => byToken({ 'X-Access-Token': 'chat-token' }), 'chatByToken'],
    ['the login, on the slug route', 'auth', () => bySlug(), 'chatBySlug'],
    ['the experience, on the slug route', 'getAIExperienceBySlug', () => bySlug(), 'chatBySlug'],
  ] as const)('of %s answers 500 with the request id, logged once', async (_, failing, call, operation) => {
    const err = down();
    mocks[failing].mockRejectedValue(err);

    const res = await call();
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body).toMatchObject({ code: 'INTERNAL_ERROR', message: PUBLIC_FAILURE_MESSAGE, requestId: expect.any(String) });
    expect(JSON.stringify(body)).not.toContain('10.0.0.5');
    expect(reported(logs)).toEqual([
      expect.objectContaining({ level: 'error', context: expect.objectContaining({ operation, requestId: body.requestId, err }) }),
    ]);
  });
});
