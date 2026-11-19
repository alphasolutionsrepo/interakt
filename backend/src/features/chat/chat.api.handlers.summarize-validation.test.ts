// src/features/chat/chat.api.handlers.summarize-validation.test.ts

/** The token summarize route answers an invalid body with the standard validation body, our wording, CORS headers kept. */

import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('./summary-stream', () => ({ createSummaryStream: vi.fn() }));
vi.mock('@/features/analytics/analytics-source-context', () => ({ withAnalyticsSource: (_s: unknown, fn: () => unknown) => fn() }));
vi.mock('@/features/auth/token-or-session', () => ({ analyticsSourceOfTokenCaller: async () => 'widget' }));
vi.mock('@/features/search-experience/access-token.middleware', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/search-experience/access-token.middleware')>()),
  openPublicRequest: async () => ({
    experience: { id: 'e1', allowedOrigins: [], aiConfig: { enabled: true, summary: { enabled: true } } },
    origin: null,
  }),
}));

import { handleSummarize } from './chat.api.handlers';

const post = (body: unknown) => new NextRequest('http://localhost/api/v1/summarize', { method: 'POST', body: JSON.stringify(body) });

describe('POST /api/v1/summarize with an invalid body', () => {
  it('answers 400 with a field per problem, a code and our wording, and the CORS header', async () => {
    const res = await handleSummarize(post({ results: [] }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(body).toMatchObject({ success: false, code: 'VALIDATION_ERROR', message: 'Some values are not valid', requestId: expect.any(String) });
    expect(body.fields).toEqual(expect.arrayContaining([
      { field: 'query', code: 'invalid_type', message: 'This field is required.' },
      expect.objectContaining({ field: 'results', code: 'too_small', message: 'At least one result is required' }),
    ]));
    body.fields.forEach((f: { code: string; message: string }) => { expect(f.code).toBeTruthy(); expect(f.message).toBeTruthy(); });
  });
});
