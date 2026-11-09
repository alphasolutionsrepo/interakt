// src/features/dashboard/home.service.role.test.ts

import { describe, expect, it } from 'vitest';

import { homeDataForRole, type HomeData } from './home.service';

import type { Permission } from '@/features/access/permissions';

const holding = (...list: Permission[]) => (p: Permission) => list.includes(p);

const data = {
  generatedAt: 'now', period: { from: 'a', to: 'b', label: 'Last 7 days', previousLabel: 'p', days: ['d'] },
  live: { requestsLast5Min: 12 }, health: null, checklist: null,
  metrics: [{ id: 'searches' }],
  tasks: [
    { id: 'failed-turns', href: '/analytics/traces?status=ERROR' },
    { id: 'reindex', href: '/search-indexes' },
    { id: 'failed-jobs', href: '/jobs' },
    { id: 'health:es', href: '/health' },
  ], cards: [{ id: 'c' }], tips: [{ id: 'tip:x' }],
  experiences: [{ id: 'e', name: 'Shop', type: 'search', active: true, volume: 40, issue: 'Few results', trend: [1, 2], href: '/x' }],
  recent: [{ id: 'r' }],
} as unknown as HomeData;

describe('the home page for each role', () => {
  it('keeps everything for a role that may view analytics', () => {
    expect(homeDataForRole(data, holding('analytics:view', 'search-indexes:view', 'settings:view'))).toBe(data);
  });

  it('drops traffic figures, insight cards and tips for a role that may not, and keeps the rest', () => {
    const seen = homeDataForRole(data, holding('search-indexes:view'));
    expect(seen).toMatchObject({ live: { requestsLast5Min: 0 }, metrics: [], cards: [], tips: [], recent: data.recent });
    // Tasks whose page the role can't open (analytics, jobs) go; the rest stay
    expect(seen.tasks.map((t) => t.id)).toEqual(['reindex', 'health:es']);
    expect(seen.experiences).toEqual([{ ...data.experiences[0], volume: 0, issue: null, trend: [] }]);
  });
});
