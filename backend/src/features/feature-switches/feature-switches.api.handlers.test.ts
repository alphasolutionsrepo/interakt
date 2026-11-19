// src/features/feature-switches/feature-switches.api.handlers.test.ts

/** The save handler tells the service who is saving. */

import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';

const service = vi.hoisted(() => ({ listFeatureSwitches: vi.fn(), setFeatureSwitches: vi.fn(async () => []) }));

vi.mock('server-only', () => ({}));
vi.mock('./feature-switches.service', () => service);
vi.mock('@/features/access/route-guard', () => ({
  checkAccess: async () => ({ access: { userId: 'admin-9', isAdmin: true }, response: null }),
}));

import { handleUpdateFeatureSwitches } from './feature-switches.api.handlers';

describe('PUT /api/settings/features', () => {
  it('passes the acting user to the save', async () => {
    const request = new NextRequest('http://localhost/api/settings/features', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ areas: { chat: false } }),
    });
    const res = await handleUpdateFeatureSwitches(request);
    expect(res.status).toBe(200);
    expect(service.setFeatureSwitches).toHaveBeenCalledWith({ chat: false }, 'admin-9');
  });

  const put = (body: unknown) => handleUpdateFeatureSwitches(new NextRequest('http://localhost/api/settings/features', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }));

  it('accepts a request naming one area, without having to name them all', async () => {
    service.setFeatureSwitches.mockClear();
    expect((await put({ areas: { chat: true } })).status).toBe(200);
    expect(service.setFeatureSwitches).toHaveBeenCalledWith({ chat: true }, 'admin-9');
  });

  it('refuses an unknown area with a field error at areas.<name>', async () => {
    service.setFeatureSwitches.mockClear();
    const res = await put({ areas: { nonsense: true } });
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body).toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(body.fields).toContainEqual({ field: 'areas.nonsense', code: 'unrecognized_key', message: 'Unknown field: "nonsense".' });
    expect(service.setFeatureSwitches).not.toHaveBeenCalled();
  });

  it('refuses an empty areas object', async () => {
    const res = await put({ areas: {} });
    expect(res.status).toBe(400);
  });
});
