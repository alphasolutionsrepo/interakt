// src/features/access/access.api.handlers.areas.test.ts

/** GET /api/me/access also lists the areas that are on, so the admin UI can hide the ones that are off. */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { handleGetMyAccess } from './access.api.handlers';

import type { Area } from '@/features/feature-switches/areas';

const mocks = vi.hoisted(() => ({ list: vi.fn(), check: vi.fn(), logError: vi.fn() }));
vi.mock('@/shared/logger/logger', () => ({
  createLogger: () => ({ error: mocks.logError, warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));
vi.mock('./route-guard', () => ({ checkAccess: mocks.check, SIGNED_IN: 'signed-in' }));
vi.mock('@/features/feature-switches/feature-switches.service', () => ({ listFeatureSwitches: mocks.list }));

const sw = (id: Area, on: boolean) => ({ id, on });

beforeEach(() => {
  mocks.list.mockReset();
  mocks.logError.mockReset();
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

  it('still answers who the caller is, without areas, when the switches cannot be read (the UI then shows everything)', async () => {
    mocks.list.mockRejectedValue(new Error('db down'));
    const response = await handleGetMyAccess();
    expect(response.status).toBe(200);
    const { data } = await response.json();
    expect(data).toEqual({
      userId: 'u',
      role: { id: 'r', name: 'Editor', isAdmin: false },
      permissions: ['tools:view'],
    });
    expect('areas' in data).toBe(false);
    expect(mocks.logError).toHaveBeenCalledTimes(1);
  });

  it('answers 500 when the permission lookup itself fails', async () => {
    mocks.check.mockRejectedValue(new Error('roles table down'));
    expect((await handleGetMyAccess()).status).toBe(500);
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it('does not read the switches for a caller who is not signed in', async () => {
    mocks.check.mockResolvedValue({ access: null, response: new Response(null, { status: 401 }) });
    expect((await handleGetMyAccess()).status).toBe(401);
    expect(mocks.list).not.toHaveBeenCalled();
  });
});
