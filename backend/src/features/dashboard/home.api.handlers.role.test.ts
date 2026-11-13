// src/features/dashboard/home.api.handlers.role.test.ts

/** GET /api/dashboard/home through the real route: analytics figures only for analytics:view. */

import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/features/feature-switches/feature-switches.service', async () => (await import('@/shared/test/feature-switches-stub')).featureSwitchesService);
vi.mock('@/features/auth/auth.api.handlers', async () => (await import('@/shared/test/access-stub')).signedInAuth);
vi.mock('@/features/access/access.service', async () => (await import('@/shared/test/access-stub')).accessService);
vi.mock('./home.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./home.service')>()),
  // The aggregate the page shows (it reads both databases); the role filter is the real one
  getHomeData: async () => ({
    generatedAt: 'now', period: {}, live: { requestsLast5Min: 7 }, health: null, checklist: null,
    metrics: [{ id: 'searches' }], tasks: [{ id: 'reindex', href: '/search-indexes' }, { id: 'jobs', href: '/jobs' }], cards: [{ id: 'c', href: '/analytics' }],
    tips: [{ id: 'tip:x', action: { label: 'Look', href: '/analytics' } }], experiences: [], recent: [],
  }),
}));

import { GET } from '@/app/api/dashboard/home/route';
import { accessStub } from '@/shared/test/access-stub';
import { featureSwitchesStub } from '@/shared/test/feature-switches-stub';

const get = async () => {
  const res = await GET(new NextRequest('http://localhost/api/dashboard/home?tz=UTC'));
  return { status: res.status, data: ((await res.json()) as { data: { metrics: unknown[]; cards: unknown[]; tips: unknown[]; tasks: Array<{ id: string }> } }).data };
};

afterEach(() => {
  accessStub.reset();
  featureSwitchesStub.reset();
});

describe('the home page by role', () => {
  it('shows the analytics figures to a role with analytics:view', async () => {
    accessStub.access = { ...accessStub.access!, isAdmin: false, permissions: new Set(['analytics:view']) };
    expect((await get()).data).toMatchObject({ metrics: [{ id: 'searches' }], cards: [{ id: 'c' }], tips: [{ id: 'tip:x' }] });
  });

  it('leaves them out for a role without it', async () => {
    accessStub.access = { ...accessStub.access!, isAdmin: false, permissions: new Set(['search-indexes:view']) };
    const { status, data } = await get();
    expect(status).toBe(200);
    expect(data).toMatchObject({ metrics: [], cards: [], tips: [] });
  });
});

describe('the home page with a feature area off', () => {
  it("leaves out tasks that open a page of an area that is off, for an Admin too", async () => {
    expect((await get()).data.tasks.map((t) => t.id)).toEqual(['reindex', 'jobs']);
    featureSwitchesStub.off = new Set(['managed-indexes']);
    expect((await get()).data.tasks.map((t) => t.id)).toEqual(['jobs']);
  });
});
