// src/app/api/v1/ai-experiences/chat/route.context-failure.test.ts
//
// A chat turn whose context can't be loaded (the session store is down), run through the
// public chat routes and the real pipeline. Only the session store and the experience
// lookup are faked; the error's text names a database address the visitor must not see.

import { NextRequest } from 'next/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  getAIExperienceBySlug: vi.fn(),
  getAIExperienceByAccessToken: vi.fn(),
  getSessionById: vi.fn(),
}));

const logs = vi.hoisted(() => [] as LogLine[]);
vi.mock('@/shared/logger/logger', async () => (await import('@/shared/test/log-recorder')).recordingLogger(logs));
vi.mock('@/features/auth/auth.api.handlers', () => ({ auth: mocks.auth }));
vi.mock('@/features/ai-experience/ai-experience.service', () => ({
  getAIExperienceBySlug: mocks.getAIExperienceBySlug,
  getAIExperienceByAccessToken: mocks.getAIExperienceByAccessToken,
}));
vi.mock('@/features/sessions/sessions.repository', () => ({ getSessionById: mocks.getSessionById }));

import { POST as chatBySlug } from '../[slug]/chat/route';

import { POST as chatByToken } from './route';

import { PUBLIC_FAILURE_MESSAGE } from '@/shared/api/response';
import { INTERNAL_MESSAGE } from '@/shared/errors/app-error';
import { reported, type LogLine } from '@/shared/test/log-recorder';

const experience = {
  id: 'a1', slug: 'assistant', name: 'Assistant', isActive: true, accessToken: 'chat-token',
  accessConfig: { allowedOrigins: [], rateLimits: { chatPerMinute: 100, requestsPerDay: 100 } },
  personaConfig: {}, sessionConfig: {}, tools: [], mcpConnections: [],
};

/** The session store's driver error: its text names the database's address. */
const storeDown = () => Object.assign(new Error('connect ECONNREFUSED 10.0.0.5:5432'), {
  code: 'ECONNREFUSED', syscall: 'connect', address: '10.0.0.5', port: 5432,
});

function chatRequest(path: string, headers: Record<string, string>): NextRequest {
  return new NextRequest(`http://interakt.test${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ message: 'do you have jeans?', sessionId: 'b6f1c1de-0000-4000-8000-000000000001' }),
  });
}

/** The events the stream sent, in order. */
async function events(res: Response): Promise<Array<Record<string, unknown>>> {
  const text = await res.text();
  return text.split('\n').filter((l) => l.startsWith('data: ')).map((l) => JSON.parse(l.slice(6)));
}

beforeEach(() => {
  logs.length = 0;
  mocks.auth.mockResolvedValue(null);
  mocks.getAIExperienceBySlug.mockResolvedValue(experience);
  mocks.getAIExperienceByAccessToken.mockImplementation(async (token: string) => (token === 'chat-token' ? experience : null));
});

describe('a chat turn whose context fails to load', () => {
  it('tells the visitor plainly, marks the step failed, and logs it once with the cause', async () => {
    const down = storeDown();
    mocks.getSessionById.mockRejectedValueOnce(down);

    const sent = await events(await chatByToken(chatRequest('/api/v1/ai-experiences/chat', { 'X-Access-Token': 'chat-token' })));
    const errors = sent.filter((e) => e.type === 'error');

    expect(errors).toEqual([expect.objectContaining({ message: PUBLIC_FAILURE_MESSAGE, requestId: expect.any(String) })]);
    expect(JSON.stringify(sent)).not.toContain('10.0.0.5');
    expect(sent).toContainEqual(expect.objectContaining({ type: 'step_complete', stepId: 'context-assembly', status: 'error' }));
    expect(reported(logs)).toEqual([expect.objectContaining({
      level: 'error',
      context: expect.objectContaining({ operation: 'chatTurn', requestId: errors[0].requestId, err: expect.objectContaining({ cause: down }) }),
    })]);
  });

  it('answers an admin testing on the slug route with the request id to look it up, not the address', async () => {
    mocks.auth.mockResolvedValue({ user: { id: 'admin' } });
    mocks.getSessionById.mockRejectedValueOnce(storeDown());

    const sent = await events(await chatBySlug(chatRequest('/api/v1/ai-experiences/assistant/chat', {}), { params: Promise.resolve({ slug: 'assistant' }) }));
    const errors = sent.filter((e) => e.type === 'error');

    // A failure we don't recognise isn't explained to anyone; its log line has the cause
    expect(errors).toEqual([expect.objectContaining({ code: 'INTERNAL_ERROR', message: INTERNAL_MESSAGE, requestId: expect.any(String) })]);
    expect(JSON.stringify(sent)).not.toContain('10.0.0.5');
    expect(sent).toContainEqual(expect.objectContaining({ type: 'step_complete', stepId: 'context-assembly', status: 'error' }));
  });
});
