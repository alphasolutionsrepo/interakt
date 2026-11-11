// src/app/api/analytics/chat/chat.routes.errors.test.ts

/**
 * The analytics chat routes answer a failure on our side without its text (a database
 * error is its SQL), with a request id, and log it once. A request that is wrong keeps
 * its status.
 */

import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DELETE as deleteSession, GET as getSession, PATCH as updateSession } from './sessions/[sessionId]/route';
import { GET as listSessions, POST as createSession } from './sessions/route';
import { POST as ask } from './stream/route';

import { errorEvent, expectInternalFailure, expectInvalidJson, failedQuery, notJson } from '@/shared/test/error-answers';
import { reported, type LogLine } from '@/shared/test/log-recorder';

const logs = vi.hoisted(() => [] as LogLine[]);
vi.mock('@/features/feature-switches/feature-switches.service', async () => (await import('@/shared/test/feature-switches-stub')).featureSwitchesService);
vi.mock('@/features/auth/auth.api.handlers', async () => (await import('@/shared/test/access-stub')).signedInAuth);
vi.mock('@/features/access/access.service', async () => (await import('@/shared/test/access-stub')).accessService);
vi.mock('@/shared/logger/logger', async () => (await import('@/shared/test/log-recorder')).recordingLogger(logs));
const sessions = vi.hoisted(() => ({
  listAdminChatSessions: vi.fn(),
  getAdminChatSessionCount: vi.fn(),
  createAdminChatSession: vi.fn(),
  getAdminChatSession: vi.fn(),
  updateAdminChatSession: vi.fn(),
  deleteAdminChatSession: vi.fn(),
  addAdminChatMessages: vi.fn(),
}));
vi.mock('@/features/analytics', () => sessions);
const pipeline = vi.hoisted(() => ({ runAnalyticsPipeline: vi.fn() }));
vi.mock('@/features/analytics/pipeline/analytics-pipeline-orchestrator', () => pipeline);


const ID = '5b0e3a52-8a7e-4a0e-9f61-2f1e9b1f2c11';
const request = (path: string, method = 'GET', body?: unknown) =>
  new NextRequest(`http://localhost/api/analytics/chat${path}`, { method, ...(body !== undefined && { body: JSON.stringify(body) }) });
const params = { params: Promise.resolve({ sessionId: ID }) };

beforeEach(() => {
  logs.length = 0;
  vi.clearAllMocks();
});

describe('an analytics chat request that fails on our side', () => {
  it.each([
    ['listing sessions', 'listAdminChatSessions', () => listSessions(request('/sessions?limit=20&offset=0')), 'listAnalyticsChatSessions'],
    ['starting a session', 'createAdminChatSession', () => createSession(request('/sessions', 'POST', {})), 'createAnalyticsChatSession'],
    ['opening a session', 'getAdminChatSession', () => getSession(request(`/sessions/${ID}`), params), 'getAnalyticsChatSession'],
    ['renaming a session', 'getAdminChatSession', () => updateSession(request(`/sessions/${ID}`, 'PATCH', { title: 'Q3' }), params), 'updateAnalyticsChatSession'],
    ['deleting a session', 'deleteAdminChatSession', () => deleteSession(request(`/sessions/${ID}`, 'DELETE'), params), 'deleteAnalyticsChatSession'],
  ] as const)('%s answers 500 without the SQL, with a request id, logged once', async (_, failing, call, operation) => {
    const down = failedQuery();
    sessions.getAdminChatSessionCount.mockResolvedValue(0);
    sessions[failing].mockRejectedValue(down);

    const res = await call();

    expect(res.status).toBe(500);
    expectInternalFailure(await res.json(), logs, operation, down);
  });

  it('asking a question sends an error event without the error text, with a request id, logged once', async () => {
    const down = failedQuery();
    pipeline.runAnalyticsPipeline.mockRejectedValue(down);

    const res = await ask(request('/stream', 'POST', { message: 'How many searches today?' }));

    expect(res.status).toBe(200);
    expectInternalFailure(await errorEvent(res), logs, 'analyticsChatStream', down);
  });
});

describe('an analytics chat request that is wrong', () => {
  it.each([
    ['listing sessions with a bad limit', () => listSessions(request('/sessions?limit=0'))],
    ['starting a session with a bad title', () => createSession(request('/sessions', 'POST', { title: '' }))],
    ['renaming a session with a bad title', () => updateSession(request(`/sessions/${ID}`, 'PATCH', { title: '' }), params)],
    ['asking without a question', () => ask(request('/stream', 'POST', { message: '' }))],
  ])('%s answers 400 with the fields that are wrong, and logs nothing', async (_, call) => {
    const res = await call();

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: 'VALIDATION_ERROR', fields: [expect.objectContaining({ field: expect.any(String) })] });
    expect(reported(logs)).toEqual([]);
  });

  it.each([
    ['renaming a session', () => updateSession(notJson(`http://localhost/api/analytics/chat/sessions/${ID}`, 'PATCH'), params)],
    ['asking a question', () => ask(notJson('http://localhost/api/analytics/chat/stream', 'POST'))],
  ])('%s with a body that is not JSON answers 400, logged once as a warning', async (_, call) => {
    await expectInvalidJson(await call(), logs);
  });

  it('opening a session that is gone answers 404 as before', async () => {
    sessions.getAdminChatSession.mockResolvedValue(null);

    const res = await getSession(request(`/sessions/${ID}`), params);

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: 'Session not found' });
  });
});
