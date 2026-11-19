// src/features/analytics/analytics.api.handlers.validation.test.ts

/**
 * A bad analytics parameter answers with the standard validation envelope (our wording, a
 * code per field), not zod's error dumped as JSON text inside the message.
 */

import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/db/index', () => ({ analyticsDB: null, db: {} }));
vi.mock('@/shared/utils/auth-utils', () => ({ getCurrentUserId: async () => 'admin' }));

import { handleGetOverview, handleGetPopularQueries } from './analytics.api.handlers';

describe('analytics handlers: invalid parameters', () => {
  it.each([
    ['overview', handleGetOverview],
    ['popular queries', handleGetPopularQueries],
  ])('%s answers 400 with the standard envelope and a field error, not a raw JSON dump', async (_name, handler) => {
    const res = await handler(new NextRequest('http://localhost/api/analytics/x?timeRange=yesterday'));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body).toMatchObject({ success: false, code: 'VALIDATION_ERROR', message: 'Some values are not valid' });
    expect(body.fields).toEqual([
      expect.objectContaining({ field: 'timeRange', code: 'invalid_value', message: expect.stringMatching(/^Choose one of: /) }),
    ]);
    expect(String(body.message)).not.toContain('"code"');
    expect(String(body.error ?? '')).not.toContain('"code"');
    expect(String(body.message)).not.toMatch(/^Invalid parameters/);
  });
});
