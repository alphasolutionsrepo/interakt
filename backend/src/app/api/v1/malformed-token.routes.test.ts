// src/app/api/v1/malformed-token.routes.test.ts
//
// A public route given an access token that can't be one (not UUID-shaped) answers 401,
// as it does for a well-formed token nobody holds. It used to answer 500: Postgres refused
// to compare the value with the uuid column. Real services and repositories on a real
// Postgres (PGlite); only the session and the feature switches are stubbed.

import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

let testDb: AppTestDb;
vi.mock('@/db/index', () => ({ get db() { return testDb.db; } }));
vi.mock('@/features/auth/auth.api.handlers', () => ({ auth: async () => null }));
vi.mock('@/features/feature-switches/feature-switches.service', async () => (await import('@/shared/test/feature-switches-stub')).featureSwitchesService);
vi.mock('@/features/telemetry', () => ({
  flushTelemetry: vi.fn().mockResolvedValue(undefined),
  runWithTelemetryLevel: (_level: string, fn: () => unknown) => fn(),
  setExperienceTelemetryOverride: vi.fn(),
}));

import { POST as chatByToken } from './ai-experiences/chat/route';
import { GET as widgetConfig } from './ai-experiences/widget-config/route';
import { POST as autocomplete } from './autocomplete/route';
import { GET as documentById } from './documents/[documentId]/route';
import { GET as embedSnippet } from './embed-snippet/route';
import { POST as searchByToken } from './search/route';
import { POST as summaryByToken } from './summarize/route';

import { createAppTestDb, type AppTestDb } from '@/shared/test/app-test-db';

beforeAll(async () => { testDb = await createAppTestDb(); }, 60_000);
afterAll(() => testDb.close());

function req(path: string, method: string, token: string, body?: unknown): NextRequest {
  return new NextRequest(`http://interakt.test${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '1.1.1.1', 'X-Access-Token': token },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const ROUTES: Array<[string, (token: string) => Promise<Response>]> = [
  ['autocomplete', (t) => autocomplete(req('/api/v1/autocomplete', 'POST', t, { query: 'jea' }))],
  ['summarize', (t) => summaryByToken(req('/api/v1/summarize', 'POST', t, { query: 'jeans' }))],
  ['search', (t) => searchByToken(req('/api/v1/search', 'POST', t, { query: 'jeans' }))],
  ['embed snippet', (t) => embedSnippet(req('/api/v1/embed-snippet', 'GET', t))],
  ['AI chat by token', (t) => chatByToken(req('/api/v1/ai-experiences/chat', 'POST', t, { message: 'hi' }))],
  ['widget config', (t) => widgetConfig(req('/api/v1/ai-experiences/widget-config', 'GET', t))],
  ['document', (t) => documentById(req('/api/v1/documents/d1', 'GET', t), { params: Promise.resolve({ documentId: 'd1' }) })],
];

describe.each(ROUTES)('%s', (_name, call) => {
  it.each(['x', 'not-a-uuid'])('answers 401 to the token %j, as to a well-formed token nobody holds', async (token) => {
    const unknown = await call('99999999-9999-4999-8999-999999999999');
    expect(unknown.status).toBe(401);
    const response = await call(token);
    expect(response.status).toBe(401);
    // The same answer, so a token's shape tells a caller nothing
    const { requestId: _a, ...got } = await response.json();
    const { requestId: _b, ...want } = await unknown.json();
    expect(got).toEqual(want);
  });
});
