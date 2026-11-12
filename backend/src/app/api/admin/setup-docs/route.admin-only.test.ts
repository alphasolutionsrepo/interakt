// src/app/api/admin/setup-docs/route.admin-only.test.ts

/**
 * Building, rebuilding or removing the docs assistant changes the built-in help, so only an
 * Admin may do it, even with setup:run; reading its status needs setup:run only. Through the
 * real route and permission gate; the session, the role lookup and the seeder are stubbed.
 */

import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GET, POST } from './route';

import { BUILT_IN_REFUSAL, EDITOR_DEFAULT_PERMISSIONS } from '@/features/access/permissions';
import { accessStub } from '@/shared/test/access-stub';

vi.mock('@/features/auth/auth.api.handlers', async () => (await import('@/shared/test/access-stub')).signedInAuth);
vi.mock('@/features/access/access.service', async () => (await import('@/shared/test/access-stub')).accessService);
vi.mock('server-only', () => ({}));
const seeder = vi.hoisted(() => ({
  seedDocs: vi.fn(async () => ({ skipped: true, documents: 0 })),
  resetDocs: vi.fn(async () => ({ deleted: [] })),
  getDocsSeedStatus: vi.fn(async () => ({ ready: true })),
}));
vi.mock('@/shared/seeders/docs', () => seeder);

/** A setup runner: setup:run and everything it needs to take effect, but not Admin */
const asSetupRunner = () => {
  accessStub.access = {
    ...accessStub.access!,
    isAdmin: false,
    roleName: 'Setup runner',
    permissions: new Set([...EDITOR_DEFAULT_PERMISSIONS, 'ai-providers:view', 'ai-providers:manage', 'settings:view', 'settings:manage', 'setup:run']),
  };
};

const post = (body: Record<string, unknown>) => POST(new NextRequest('http://localhost/api/admin/setup-docs', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
}));

beforeEach(() => vi.clearAllMocks());
afterEach(() => accessStub.reset());

describe('the docs assistant setup route', () => {
  it.each([
    ['build', { action: 'seed' }],
    ['rebuild', { action: 'seed', force: true }],
    ['stream a build', { action: 'seed', stream: true }],
    ['remove', { action: 'reset' }],
    ['send an unknown action', { action: 'check-only' }],
  ])("refuses a non-Admin with setup:run who tries to %s, and runs nothing", async (_, body) => {
    asSetupRunner();

    const res = await post(body);

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: BUILT_IN_REFUSAL });
    expect(seeder.seedDocs).not.toHaveBeenCalled();
    expect(seeder.resetDocs).not.toHaveBeenCalled();
  });

  it('lets an Admin build and remove it', async () => {
    expect((await post({ action: 'seed' })).status).toBe(200);
    expect(seeder.seedDocs).toHaveBeenCalledOnce();
    expect((await post({ action: 'reset' })).status).toBe(200);
    expect(seeder.resetDocs).toHaveBeenCalledOnce();
  });

  it('still shows a non-Admin with setup:run the status', async () => {
    asSetupRunner();

    expect((await GET()).status).toBe(200);
  });
});
