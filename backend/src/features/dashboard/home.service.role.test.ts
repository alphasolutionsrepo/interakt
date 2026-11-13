// src/features/dashboard/home.service.role.test.ts

import { describe, expect, it } from 'vitest';

import { homeDataForRole, type HomeData } from './home.service';

import type { Permission } from '@/features/access/permissions';
import type { Area } from '@/features/feature-switches/areas';

const holding = (...list: Permission[]) => (p: Permission) => list.includes(p);

const data = {
  generatedAt: 'now', analytics: true, period: { from: 'a', to: 'b', label: 'Last 7 days', previousLabel: 'p', days: ['d'] },
  live: { requestsLast5Min: 12 }, health: null,
  checklist: [{ id: 'index', href: '/search-indexes/create', done: false }, { id: 'ask', href: '#home-ask', done: false }],
  metrics: [{ id: 'searches' }],
  cards: [{ id: 'c', href: '/analytics/search' }, { id: 'idx', href: '/search-indexes/abc' }], tips: [{ id: 'tip:x', action: { label: 'Set up', href: '/ai-providers' } }],
  tasks: [
    { id: 'failed-turns', href: '/analytics/traces?status=ERROR' },
    { id: 'reindex', href: '/search-indexes' },
    { id: 'failed-jobs', href: '/jobs' },
    { id: 'health:es', href: '/health' },
  ],
  experiences: [
    { id: 'e', name: 'Shop', type: 'search', active: true, volume: 40, issue: 'Few results', trend: [1, 2], href: '/experiences/search/e' },
    { id: 'a', name: 'Helper', type: 'ai', active: true, volume: 3, issue: null, trend: [1], href: '/experiences/ai/a' },
  ],
  recent: [{ id: 'job', href: '/jobs' }, { id: 'index', href: '/search-indexes/abc' }],
} as unknown as HomeData;

describe('the home page for each role', () => {
  it('keeps everything for a role that may view analytics', () => {
    expect(homeDataForRole(data, holding('analytics:view', 'analytics:ask', 'search-indexes:view', 'search-indexes:edit', 'settings:view', 'ai-providers:view', 'search-experiences:view', 'ai-experiences:view'))).toEqual(data);
  });

  it('drops traffic figures, insight cards and tips for a role that may not, and keeps the rest', () => {
    const seen = homeDataForRole(data, holding('search-indexes:view', 'search-experiences:view'));
    expect(seen).toMatchObject({ analytics: false, live: { requestsLast5Min: 0 }, metrics: [], cards: [], tips: [] });
    // Tasks whose page the role can't open (analytics, jobs) go; the rest stay
    expect(seen.tasks.map((t) => t.id)).toEqual(['reindex', 'health:es']);
    // Only the experiences the role can open, without their traffic
    expect(seen.experiences).toEqual([{ ...data.experiences[0], volume: 0, issue: null, trend: [] }]);
  });
});

describe('home links a role can follow', () => {
  it("drops recent changes and getting-started steps that link to pages the role can't open, keeps in-page steps", () => {
    const seen = homeDataForRole(data, holding('analytics:view', 'analytics:ask', 'search-indexes:view'));
    expect(seen.recent.map((r) => r.id)).toEqual(['index']);
    expect(seen.checklist?.map((c) => c.id)).toEqual(['ask']);
  });

  it('keeps the Ask step only for a role that may ask', () => {
    const seen = homeDataForRole(data, holding('analytics:view', 'search-indexes:view', 'search-indexes:edit'));
    expect(seen.checklist?.map((c) => c.id)).toEqual(['index']);
  });

  it('drops the checklist once every step the role sees is done, though others are not', () => {
    const steps = [
      { id: 'provider', href: '/ai-providers', done: false },
      { id: 'traffic', href: '/experiences/search/e', done: true },
      { id: 'ask', href: '#home-ask', done: false },
    ];
    const withSteps = { ...data, checklist: steps } as unknown as HomeData;
    // A Viewer: no providers page, no Ask; the one step left is done
    expect(homeDataForRole(withSteps, holding('search-experiences:view', 'analytics:view')).checklist).toBeNull();
    // A role that may ask still has a step to do
    expect(homeDataForRole(withSteps, holding('search-experiences:view', 'analytics:view', 'analytics:ask')).checklist?.map((c) => c.id)).toEqual(['traffic', 'ask']);
  });

  it('drops the traffic step with Analytics off (no traffic is recorded), and the list once the rest is done', () => {
    const steps = [
      { id: 'experience', href: '/experiences/create', done: true },
      { id: 'traffic', href: '/experiences/search/e', done: false },
    ];
    const withSteps = { ...data, checklist: steps } as unknown as HomeData;
    const role = holding('search-experiences:view', 'search-experiences:edit', 'analytics:view');
    expect(homeDataForRole(withSteps, role).checklist?.map((c) => c.id)).toEqual(['experience', 'traffic']);
    expect(homeDataForRole(withSteps, role, { analyticsOn: false }).checklist).toBeNull();
    const notDone = { ...data, checklist: [{ ...steps[0], done: false }, steps[1]] } as unknown as HomeData;
    expect(homeDataForRole(notDone, role, { analyticsOn: false }).checklist?.map((c) => c.id)).toEqual(['experience']);
  });

  it("drops cards and tips whose action opens a page the role can't open", () => {
    const seen = homeDataForRole(data, holding('analytics:view', 'search-experiences:view'));
    expect(seen.cards.map((c) => c.id)).toEqual(['c']);
    expect(seen.tips).toEqual([]); // the tip leads to AI providers
    expect(seen.experiences.map((e) => e.id)).toEqual(['e']);
  });
});

describe('home with feature areas off', () => {
  const everything = holding(
    'analytics:view', 'analytics:ask', 'search-indexes:view', 'search-indexes:edit', 'settings:view', 'ai-providers:view',
    'search-experiences:view', 'search-experiences:edit', 'ai-experiences:view', 'ai-experiences:edit', 'playground:use',
  );
  const off = (...areas: Area[]) => (a: Area) => !areas.includes(a);
  const full = {
    ...data,
    checklist: [
      { id: 'provider', href: '/ai-providers', done: false },
      { id: 'content', href: '/search-indexes/create', done: false },
      { id: 'experience', href: '/experiences/create', done: false },
    ],
  } as unknown as HomeData;

  it('keeps everything while every area is on', () => {
    expect(homeDataForRole(data, everything, { areaOn: off() })).toEqual(data);
  });

  it('drops the pages of Managed indexes from tasks, recent changes, cards and the checklist', () => {
    const seen = homeDataForRole(full, everything, { areaOn: off('managed-indexes') });
    expect(seen.tasks.map((t) => t.id)).toEqual(['failed-turns', 'failed-jobs', 'health:es']);
    expect(seen.recent.map((r) => r.id)).toEqual(['job']);
    expect(seen.cards.map((c) => c.id)).toEqual(['c']);
    expect(seen.checklist?.map((c) => c.id)).toEqual(['provider', 'experience']);
  });

  it('drops the experiences of an area that is off, and the experience step only when both are off', () => {
    expect(homeDataForRole(full, everything, { areaOn: off('chat') }).experiences.map((e) => e.id)).toEqual(['e']);
    expect(homeDataForRole(full, everything, { areaOn: off('search') }).experiences.map((e) => e.id)).toEqual(['a']);
    expect(homeDataForRole(full, everything, { areaOn: off('search') }).checklist?.map((c) => c.id)).toContain('experience');
    const both = homeDataForRole(full, everything, { areaOn: off('search', 'chat') });
    expect(both.experiences).toEqual([]);
    expect(both.checklist?.map((c) => c.id)).toEqual(['provider', 'content']);
  });

  it('drops tips and analytics tasks with Analytics off', () => {
    const seen = homeDataForRole(data, everything, { areaOn: off('analytics') });
    expect(seen.tasks.map((t) => t.id)).toEqual(['reindex', 'failed-jobs', 'health:es']);
    expect(seen.cards).toEqual([{ id: 'idx', href: '/search-indexes/abc' }]);
  });
});

describe('home links to analytics sections whose area is off', () => {
  it('drops a card linking to /analytics/conversations with Chat off, keeps it with Chat on', () => {
    const withCards = { ...data, cards: [{ id: 'conv', href: '/analytics/conversations' }, { id: 'srch', href: '/analytics/search' }] } as unknown as HomeData;
    const can = holding('analytics:view');
    const chatOff = (a: Area) => a !== 'chat';
    expect(homeDataForRole(withCards, can, { areaOn: chatOff }).cards.map((c) => c.id)).toEqual(['srch']);
    expect(homeDataForRole(withCards, can, { areaOn: () => true }).cards.map((c) => c.id)).toEqual(['conv', 'srch']);
  });
});
