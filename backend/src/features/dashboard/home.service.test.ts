// src/features/dashboard/home.service.test.ts

/**
 * Home page tips appear only when this install's data supports them, and one
 * kind can't crowd out the others.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('@/db/index', () => ({ db: null, analyticsDB: null }));

import { buildChecklist, buildRecent, buildTips, type Setup } from './home.service';

const now = new Date('2026-10-26T12:00:00Z');
const daysAgo = (n: number) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000);

function setup(overrides: Partial<Setup> = {}): Setup {
  return { experiences: [], indexes: [], enabledProviders: 2, ...overrides };
}
const experience = (id: string, createdDaysAgo: number, isActive = true) => ({
  id,
  name: `Experience ${id}`,
  type: 'ai' as const,
  isActive,
  createdAt: daysAgo(createdDaysAgo),
  guardrailEnforced: false,
});
const index = (overrides: Partial<Setup['indexes'][number]> = {}): Setup['indexes'][number] => ({
  id: '00000000-0000-0000-0000-000000000001',
  name: 'Catalog',
  status: 'ready',
  isActive: true,
  requiresReindex: false,
  searchType: 'lexical',
  documentCount: 100,
  lastIndexedAt: daysAgo(1),
  usedByActiveExperience: true,
  ...overrides,
});
const none = { lexical: 0, semantic: 0, hybrid: 0 };
const ids = (tips: Array<{ id: string }>) => tips.map((t) => t.id);

describe('buildTips', () => {
  it('suggests nothing for a healthy, used install', () => {
    const tips = buildTips({
      setup: setup({ experiences: [experience('a', 30)], indexes: [index()] }),
      summaries: [{ id: 'a', name: 'A', type: 'ai', volume: 50, deleted: false, successRate: 1, zeroResultRate: 0, avgLatencyMs: 900 }],
      zeroQueries: [],
      searchTypes: { lexical: 30, semantic: 0, hybrid: 10 },
      now,
    });
    expect(tips).toEqual([]);
  });

  it('names one quiet experience at a time, the newest, and not one created today', () => {
    const tips = buildTips({
      setup: setup({ experiences: [experience('old', 40), experience('newer', 10), experience('today', 0.2), experience('off', 20, false)] }),
      summaries: [],
      zeroQueries: [],
      searchTypes: none,
      now,
    });
    expect(ids(tips)).toEqual(['tip:no_traffic:newer']);
  });

  it('moves on to the next quiet experience once one is dismissed', () => {
    const tips = buildTips({
      setup: setup({ experiences: [experience('old', 40), experience('newer', 10)] }),
      summaries: [],
      zeroQueries: [],
      searchTypes: none,
      now,
      dismissed: new Set(['tip:no_traffic:newer']),
    });
    expect(ids(tips)).toEqual(['tip:no_traffic:old']);
  });

  it('suggests synonyms once three typed searches keep finding nothing', () => {
    const repeated = (query: string, occurrenceCount: number) => ({ query, occurrenceCount });
    const two = buildTips({ setup: setup(), summaries: [], zeroQueries: [repeated('gift card', 9), repeated('e-gift', 6), repeated('*', 40)], searchTypes: none, now });
    expect(ids(two)).toEqual([]);

    const three = buildTips({
      setup: setup(),
      summaries: [],
      zeroQueries: [repeated('gift card', 9), repeated('e-gift', 6), repeated('voucher', 5), repeated('rare', 2)],
      searchTypes: none,
      now,
    });
    expect(three[0]).toMatchObject({ id: 'tip:synonyms', title: '3 searches keep finding nothing' });
    expect(three[0].body).toContain('“gift card”, “e-gift”, “voucher” found nothing 20 times');
  });

  it('points out keyword-only searching when an index supports semantic search', () => {
    const args = { summaries: [], zeroQueries: [], now };
    expect(ids(buildTips({ ...args, setup: setup({ indexes: [index({ searchType: 'hybrid' })] }), searchTypes: { lexical: 40, semantic: 0, hybrid: 0 } }))).toEqual(['tip:keyword_only']);
    // Lexical-only indexes, or some hybrid use already: nothing to suggest
    expect(buildTips({ ...args, setup: setup({ indexes: [index()] }), searchTypes: { lexical: 40, semantic: 0, hybrid: 0 } })).toEqual([]);
    expect(buildTips({ ...args, setup: setup({ indexes: [index({ searchType: 'hybrid' })] }), searchTypes: { lexical: 40, semantic: 0, hybrid: 3 } })).toEqual([]);
  });

  it('flags content an active experience uses that is over 30 days old, and a single AI provider', () => {
    const tips = buildTips({
      setup: setup({
        indexes: [index({ lastIndexedAt: daysAgo(45) }), index({ id: '00000000-0000-0000-0000-000000000002', lastIndexedAt: daysAgo(90), usedByActiveExperience: false })],
        enabledProviders: 1,
      }),
      summaries: [],
      zeroQueries: [],
      searchTypes: none,
      now,
    });
    expect(ids(tips)).toEqual(['tip:stale:00000000-0000-0000-0000-000000000001', 'tip:single_provider']);
    expect(tips[0].title).toBe('Catalog was last updated 45 days ago');
  });
});

describe('buildChecklist', () => {
  const noUse = { anyTraffic: false, askedAQuestion: false };

  it('walks a new installation through setup, ticking off what is done', () => {
    const steps = buildChecklist(setup({ enabledProviders: 1 }), noUse);
    expect(steps?.map((s) => [s.id, s.done])).toEqual([
      ['provider', true],
      ['content', false],
      ['experience', false],
      ['traffic', false],
      ['ask', false],
    ]);
  });

  it('points the widget step at the first experience', () => {
    const steps = buildChecklist(setup({ experiences: [experience('a', 3)] }), noUse);
    expect(steps?.find((s) => s.id === 'traffic')?.href).toBe('/experiences/ai/a');
  });

  it('goes away once every step is done', () => {
    const done = buildChecklist(setup({ experiences: [experience('a', 3)], indexes: [index()], enabledProviders: 1 }), {
      anyTraffic: true,
      askedAQuestion: true,
    });
    expect(done).toBeNull();
  });
});

describe('buildRecent', () => {
  it('lists edits, indexing and job runs from the last 14 days, newest first', () => {
    const edited = { ...experience('a', 30), updatedAt: daysAgo(1) };
    const created = { ...experience('b', 2), updatedAt: daysAgo(2) };
    const old = { ...experience('c', 60), updatedAt: daysAgo(30) };
    const changes = buildRecent(
      setup({ experiences: [edited, created, old], indexes: [index({ lastIndexedAt: daysAgo(3), updatedAt: daysAgo(3) })] }),
      [{ id: 'j1', name: 'refresh-insights', state: 'failed', at: daysAgo(0.5) }],
      now,
    );
    expect(changes.map((c) => [c.label, c.detail])).toEqual([
      ['Insights refresh', 'Background job failed'],
      ['Experience a', 'Experience edited'],
      ['Experience b', 'Experience created'],
      ['Catalog', 'Content indexed'],
    ]);
    expect(changes[0].failed).toBe(true);
  });
});
