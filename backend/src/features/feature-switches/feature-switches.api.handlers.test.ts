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
});
