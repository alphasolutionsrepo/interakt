// src/features/access/built-in-experiences.routes.test.ts

/**
 * Only an Admin changes the built-in help experiences, on the real experience routes (the
 * experience lookups and the change itself stubbed).
 */

import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/features/auth/auth.api.handlers', async () => (await import('@/shared/test/access-stub')).signedInAuth);
vi.mock('@/features/access/access.service', async () => (await import('@/shared/test/access-stub')).accessService);

const world = vi.hoisted(() => ({ isBuiltIn: false, lookupError: null as Error | null, changed: [] as string[] }));
vi.mock('@/features/ai-experience/ai-experience.repository', () => ({
  getAIExperienceById: async (id: string) => {
    if (world.lookupError) throw world.lookupError;
    return { id, isBuiltIn: world.isBuiltIn };
  },
}));
vi.mock('@/features/search-experience/search-experience.repository', () => ({
  getSearchExperienceById: async (id: string) => ({ id, isBuiltIn: world.isBuiltIn }),
}));
vi.mock('@/features/ai-experience/ai-experience.api.handlers', () => ({
  handleUpdateAIExperience: async () => { world.changed.push('chat:update'); return Response.json({ success: true }); },
  handleAssignTool: async () => { world.changed.push('chat:tool'); return Response.json({ success: true }); },
}));
vi.mock('@/features/search-experience/search-experience.admin.handlers', () => ({
  handleAddIndex: async () => { world.changed.push('search:index'); return Response.json({ success: true }); },
}));

import * as chatOne from '@/app/api/ai-experiences/[id]/route';
import * as chatTools from '@/app/api/ai-experiences/[id]/tools/route';
import * as searchIndexes from '@/app/api/search-experiences/[id]/indexes/route';
import { accessStub } from '@/shared/test/access-stub';

import { EDITOR_DEFAULT_PERMISSIONS } from './permissions';

type Route = (r: NextRequest, c: { params: Promise<{ id: string }> }) => Promise<Response>;
const changes: Array<[string, unknown, string]> = [
  ['update a chat experience', chatOne.PUT, 'chat:update'],
  ['attach a tool to a chat experience', chatTools.POST, 'chat:tool'],
  ['add an index to a search experience', searchIndexes.POST, 'search:index'],
];
const call = (fn: unknown) =>
  (fn as Route)(new NextRequest('http://localhost/api/x', { method: 'POST', body: '{}' }), { params: Promise.resolve({ id: 'e1' }) });
const asEditor = () => {
  accessStub.access = { ...accessStub.access!, isAdmin: false, roleName: 'Editor', permissions: new Set(EDITOR_DEFAULT_PERMISSIONS) };
};

beforeEach(() => { world.isBuiltIn = false; world.lookupError = null; world.changed = []; });
afterEach(() => accessStub.reset());

describe('changing the built-in help experiences', () => {
  it.each(changes)('%s: an Editor is refused on the built-in help, before any change', async (_name, fn) => {
    world.isBuiltIn = true;
    asEditor();
    const res = await call(fn);
    expect(res.status).toBe(403);
    expect((await res.json()).message).toMatch(/Only an Admin can change the built-in help/);
    expect(world.changed).toEqual([]);
  });

  it.each(changes)('%s: an Admin may change the built-in help', async (_name, fn, change) => {
    world.isBuiltIn = true;
    expect((await call(fn)).status).toBe(200);
    expect(world.changed).toEqual([change]);
  });

  it.each(changes)('%s: an Editor may change any other experience', async (_name, fn, change) => {
    asEditor();
    expect((await call(fn)).status).toBe(200);
    expect(world.changed).toEqual([change]);
  });

  it("refuses with an error, changing nothing, when it can't tell whether the experience is built in", async () => {
    asEditor();
    world.lookupError = new Error('database down');
    expect((await call(chatOne.PUT)).status).toBe(500);
    expect(world.changed).toEqual([]);
  });
});
