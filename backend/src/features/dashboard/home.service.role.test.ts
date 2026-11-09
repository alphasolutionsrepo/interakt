// src/features/dashboard/home.service.role.test.ts

import { describe, expect, it } from 'vitest';

import { homeDataForRole, type HomeData } from './home.service';

import type { Permission } from '@/features/access/permissions';

const holding = (...list: Permission[]) => (p: Permission) => list.includes(p);

const data = {
  generatedAt: 'now', analytics: true, period: { from: 'a', to: 'b', label: 'Last 7 days', previousLabel: 'p', days: ['d'] },
  live: { requestsLast5Min: 12 }, health: null,
  checklist: [{ id: 'index', href: '/search-indexes/create' }, { id: 'ask', href: '#home-ask' }],
  metrics: [{ id: 'searches' }],
  tasks: [
    { id: 'failed-turns', href: '/analytics/traces?status=ERROR' },
    { id: 'reindex', href: '/search-indexes' },
    { id: 'failed-jobs', href: '/jobs' },
    { id: 'health:es', href: '/health' },
  ], cards: [{ id: 'c' }], tips: [{ id: 'tip:x' }],
  experiences: [{ id: 'e', name: 'Shop', type: 'search', active: true, volume: 40, issue: 'Few results', trend: [1, 2], href: '/x' }],
  recent: [{ id: 'job', href: '/jobs' }, { id: 'index', href: '/search-indexes/abc' }],
} as unknown as HomeData;

describe('the home page for each role', () => {
  it('keeps everything for a role that may view analytics', () => {
    expect(homeDataForRole(data, holding('analytics:view', 'search-indexes:view', 'search-indexes:edit', 'settings:view'))).toEqual(data);
  });

  it('drops traffic figures, insight cards and tips for a role that may not, and keeps the rest', () => {
    const seen = homeDataForRole(data, holding('search-indexes:view'));
    expect(seen).toMatchObject({ analytics: false, live: { requestsLast5Min: 0 }, metrics: [], cards: [], tips: [] });
    // Tasks whose page the role can't open (analytics, jobs) go; the rest stay
    expect(seen.tasks.map((t) => t.id)).toEqual(['reindex', 'health:es']);
    expect(seen.experiences).toEqual([{ ...data.experiences[0], volume: 0, issue: null, trend: [] }]);
  });
});

describe('home links a role can follow', () => {
  it("drops recent changes and getting-started steps that link to pages the role can't open, keeps in-page steps", () => {
    const seen = homeDataForRole(data, holding('analytics:view', 'search-indexes:view'));
    expect(seen.recent.map((r) => r.id)).toEqual(['index']);
    expect(seen.checklist?.map((c) => c.id)).toEqual(['ask']);
  });
});
