// src/features/access/access.api.handlers.areas.test.ts

/** GET /api/me/access also lists the areas that are on, so the admin UI can hide the ones that are off. */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { handleGetMyAccess } from './access.api.handlers';

import type { Area } from '@/features/feature-switches/areas';

const mocks = vi.hoisted(() => ({ list: vi.fn(), check: vi.fn() }));
vi.mock('./route-guard', () => ({ checkAccess: mocks.check, SIGNED_IN: 'signed-in' }));
vi.mock('@/features/feature-switches/feature-switches.service', () => ({ listFeatureSwitches: mocks.list }));

const sw = (id: Area, on: boolean) => ({ id, on });

beforeEach(() => {
  mocks.list.mockReset();
  mocks.check.mockResolvedValue({
    access: { userId: 'u', roleId: 'r', roleName: 'Editor', isAdmin: false, permissions: new Set(['tools:view']) },
    response: null,
  });
});

describe('GET /api/me/access areas', () => {
  it('lists only the areas that are on', async () => {
    mocks.list.mockResolvedValue([sw('search', true), sw('chat', false), sw('analytics', true)]);
    const body = await (await handleGetMyAccess()).json();
    expect(body.data.areas).toEqual(['search', 'analytics']);
    expect(body.data.permissions).toEqual(['tools:view']);
  });

  it('answers the error, not a guess, when the switches cannot be read (the UI then shows everything)', async () => {
    mocks.list.mockRejectedValue(new Error('db down'));
    const response = await handleGetMyAccess();
    expect(response.status).toBe(500);
  });

  it('does not read the switches for a caller who is not signed in', async () => {
    mocks.check.mockResolvedValue({ access: null, response: new Response(null, { status: 401 }) });
    expect((await handleGetMyAccess()).status).toBe(401);
    expect(mocks.list).not.toHaveBeenCalled();
  });
});
