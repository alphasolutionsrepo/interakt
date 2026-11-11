// src/features/access/access-tokens.routes.test.ts

/**
 * Experience access tokens reach only roles that may edit that kind of experience or use the
 * playgrounds (the widget playground and search autocomplete call public routes with them), on the real
 * admin routes (the experiences themselves stubbed at the service).
 */

import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/features/feature-switches/feature-switches.service', async () => (await import('@/shared/test/feature-switches-stub')).featureSwitchesService);
vi.mock('@/features/auth/auth.api.handlers', async () => (await import('@/shared/test/access-stub')).signedInAuth);
vi.mock('@/features/access/access.service', async () => (await import('@/shared/test/access-stub')).accessService);
vi.mock('@/shared/utils/auth-utils', () => ({ getCurrentUserId: async () => 'u' }));
const chat = { id: 'a1', name: 'Assistant', slug: 'assistant', accessToken: 'chat-secret-token' };
const search = { id: 's1', name: 'Store', slug: 'store', accessToken: 'search-secret-token', indexes: [] };
vi.mock('@/features/ai-experience/ai-experience.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/ai-experience/ai-experience.service')>()),
  getAIExperienceById: async () => chat,
  listAIExperiences: async () => ({ experiences: [chat], pagination: { page: 1, pageSize: 20, totalPages: 1, totalItems: 1 } }),
}));
vi.mock('@/features/search-experience/search-experience.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/search-experience/search-experience.service')>()),
  getSearchExperienceWithIndexes: async () => search,
  listSearchExperiences: async () => ({ items: [search], total: 1, page: 1, pageSize: 20, totalPages: 1 }),
}));

import * as aiList from '@/app/api/ai-experiences/route';
import * as aiOne from '@/app/api/ai-experiences/[id]/route';
import * as searchList from '@/app/api/search-experiences/route';
import * as searchOne from '@/app/api/search-experiences/[id]/route';
import { accessStub } from '@/shared/test/access-stub';

import type { Permission } from './permissions';

afterEach(() => accessStub.reset());

const as = (...permissions: Permission[]) => {
  accessStub.access = { ...accessStub.access!, isAdmin: false, permissions: new Set(permissions) };
};
type Route = (r: NextRequest, c: { params: Promise<{ id: string }> }) => Promise<Response>;
const text = async (fn: unknown, url: string) => {
  const res = await (fn as Route)(new NextRequest(`http://localhost${url}`), { params: Promise.resolve({ id: 'x' }) });
  expect(res.status).toBe(200);
  return JSON.stringify(await res.json());
};

describe('experience access tokens in the admin API', () => {
  it('reach a role that may edit that kind of experience', async () => {
    as('ai-experiences:view', 'ai-experiences:edit', 'search-experiences:view', 'search-experiences:edit');
    expect(await text(aiList.GET, '/api/ai-experiences')).toContain('chat-secret-token');
    expect(await text(aiOne.GET, '/api/ai-experiences/a1')).toContain('chat-secret-token');
    expect(await text(searchList.GET, '/api/search-experiences')).toContain('search-secret-token');
    expect(await text(searchOne.GET, '/api/search-experiences/s1')).toContain('search-secret-token');
  });

  it('are left out for a role that may only view, which still gets the experiences', async () => {
    as('ai-experiences:view', 'search-experiences:view');
    for (const [fn, url, name] of [[aiList.GET, '/api/ai-experiences', 'Assistant'], [aiOne.GET, '/api/ai-experiences/a1', 'Assistant'], [searchList.GET, '/api/search-experiences', 'Store'], [searchOne.GET, '/api/search-experiences/s1', 'Store']] as const) {
      const body = await text(fn, url);
      expect(body).not.toMatch(/secret-token|accessToken/);
      expect(body).toContain(name);
    }
  });

  it("follow each kind's own edit permission", async () => {
    as('ai-experiences:view', 'search-experiences:view', 'search-experiences:edit');
    expect(await text(aiOne.GET, '/api/ai-experiences/a1')).not.toContain('chat-secret-token');
    expect(await text(searchOne.GET, '/api/search-experiences/s1')).toContain('search-secret-token');
  });

  it('reach a role that may use the playgrounds without editing, which the playgrounds need', async () => {
    as('ai-experiences:view', 'search-experiences:view', 'playground:use');
    expect(await text(aiList.GET, '/api/ai-experiences')).toContain('chat-secret-token');
    expect(await text(aiOne.GET, '/api/ai-experiences/a1')).toContain('chat-secret-token');
    expect(await text(searchList.GET, '/api/search-experiences')).toContain('search-secret-token');
    expect(await text(searchOne.GET, '/api/search-experiences/s1')).toContain('search-secret-token');
  });
});
