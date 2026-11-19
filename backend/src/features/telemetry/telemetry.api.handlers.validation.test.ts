// src/features/telemetry/telemetry.api.handlers.validation.test.ts

/** A bad trace-list parameter answers with the standard validation envelope, not a raw JSON dump. */

import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/utils/auth-utils', () => ({ getCurrentUserId: async () => 'admin' }));
vi.mock('./telemetry.config', () => ({}));
vi.mock('./telemetry-query.service', () => ({}));

import { handleGetSpans } from './telemetry.api.handlers';

describe('GET /api/telemetry/traces with an invalid parameter', () => {
  it('answers 400 with a field error in our wording and no raw JSON dump', async () => {
    const res = await handleGetSpans(new NextRequest('http://localhost/api/telemetry/traces?timeRange=yesterday'));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body).toMatchObject({ success: false, code: 'VALIDATION_ERROR', message: 'Some values are not valid' });
    expect(body.fields).toEqual([
      expect.objectContaining({ field: 'timeRange', code: 'invalid_value', message: expect.stringMatching(/^Choose one of: /) }),
    ]);
    expect(String(body.message)).not.toContain('"code"');
  });
});
