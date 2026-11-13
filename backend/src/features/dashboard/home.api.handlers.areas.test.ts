// src/features/dashboard/home.api.handlers.areas.test.ts

/** GET /api/dashboard/home: every feature area is read for the role filter, and a failed read is a 500. */

import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/features/feature-switches/feature-switches.service', async () => (await import('@/shared/test/feature-switches-stub')).featureSwitchesService);
vi.mock('@/features/auth/auth.api.handlers', async () => (await import('@/shared/test/access-stub')).signedInAuth);
vi.mock('@/features/access/access.service', async () => (await import('@/shared/test/access-stub')).accessService);
vi.mock('./home.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./home.service')>()),
  getHomeData: async () => ({
    generatedAt: 'now', period: {}, live: { requestsLast5Min: 7 }, health: null, checklist: null,
    metrics: [], cards: [], tips: [], recent: [],
    tasks: [{ id: 'reindex', href: '/search-indexes' }, { id: 'chat-task', href: '/experiences/ai/a' }, { id: 'jobs', href: '/jobs' }],
    experiences: [
      { id: 'e', name: 'Shop', type: 'search', active: true, volume: 0, issue: null, trend: [], href: '/experiences/search/e' },
      { id: 'a', name: 'Helper', type: 'ai', active: true, volume: 0, issue: null, trend: [], href: '/experiences/ai/a' },
    ],
  }),
}));

import { GET } from '@/app/api/dashboard/home/route';
import { accessStub } from '@/shared/test/access-stub';
import { featureSwitchesService, featureSwitchesStub } from '@/shared/test/feature-switches-stub';

type Home = { tasks: Array<{ id: string }>; experiences: Array<{ id: string }> };
const get = async () => {
  const res = await GET(new NextRequest('http://localhost/api/dashboard/home?tz=UTC'));
  return { status: res.status, body: (await res.json()) as { data?: Home } };
};

afterEach(() => {
  vi.restoreAllMocks();
  accessStub.reset();
  featureSwitchesStub.reset();
});

describe('the home page and the feature areas', () => {
  it('drops nothing with every area on', async () => {
    const { body } = await get();
    expect(body.data!.tasks.map((t) => t.id)).toEqual(['reindex', 'chat-task', 'jobs']);
    expect(body.data!.experiences.map((e) => e.id)).toEqual(['e', 'a']);
  });

  it('drops a chat task and a chat experience with Chat off', async () => {
    featureSwitchesStub.off = new Set(['chat']);
    const { body } = await get();
    expect(body.data!.tasks.map((t) => t.id)).toEqual(['reindex', 'jobs']);
    expect(body.data!.experiences.map((e) => e.id)).toEqual(['e']);
  });

  it('drops a /search-indexes task with Managed indexes off', async () => {
    featureSwitchesStub.off = new Set(['managed-indexes']);
    expect((await get()).body.data!.tasks.map((t) => t.id)).toEqual(['chat-task', 'jobs']);
  });

  it('answers 500 and no partial data when a switch cannot be read', async () => {
    vi.spyOn(featureSwitchesService, 'isAreaOn').mockRejectedValue(new Error('db down'));
    const { status, body } = await get();
    expect(status).toBe(500);
    expect(body.data).toBeUndefined();
  });
});
