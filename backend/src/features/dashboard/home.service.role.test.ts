// src/features/dashboard/home.service.role.test.ts

import { describe, expect, it } from 'vitest';

import { homeDataForRole, type HomeData } from './home.service';

const data = {
  generatedAt: 'now', period: { from: 'a', to: 'b', label: 'Last 7 days', previousLabel: 'p', days: ['d'] },
  live: { requestsLast5Min: 12 }, health: null, checklist: null,
  metrics: [{ id: 'searches' }], tasks: [{ id: 't' }], cards: [{ id: 'c' }], tips: [{ id: 'tip:x' }],
  experiences: [{ id: 'e', name: 'Shop', type: 'search', active: true, volume: 40, issue: 'Few results', trend: [1, 2], href: '/x' }],
  recent: [{ id: 'r' }],
} as unknown as HomeData;

describe('the home page for each role', () => {
  it('keeps everything for a role that may view analytics', () => {
    expect(homeDataForRole(data, true)).toBe(data);
  });

  it('drops traffic figures, insight cards and tips for a role that may not, and keeps the rest', () => {
    const seen = homeDataForRole(data, false);
    expect(seen).toMatchObject({ live: { requestsLast5Min: 0 }, metrics: [], cards: [], tips: [], tasks: data.tasks, recent: data.recent });
    expect(seen.experiences).toEqual([{ ...data.experiences[0], volume: 0, issue: null, trend: [] }]);
  });
});
