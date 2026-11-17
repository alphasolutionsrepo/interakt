// src/shared/access/area-gate.test.ts

import { describe, expect, it } from 'vitest';

import { areaGateFor, settledChoice } from './area-gate';

import type { Area } from '@/features/feature-switches/areas';

const on = () => true;
const offFor = (...off: string[]) => (a: string) => !off.includes(a);

describe('areaGateFor', () => {
  it('leaves the gate alone while the area is on', () => {
    expect(areaGateFor({ state: 'allowed' }, 'playground', on)).toEqual({ state: 'allowed' });
    expect(areaGateFor({ state: 'locked', reason: 'no permission' }, 'playground', on)).toEqual({ state: 'locked', reason: 'no permission' });
  });

  it('locks with the area reason when the area is off', () => {
    expect(areaGateFor({ state: 'allowed' }, 'playground', offFor('playground'))).toEqual({
      state: 'locked', reason: 'Playground is turned off for this installation.',
    });
  });

  it('names the first off area when several are needed', () => {
    expect(areaGateFor({ state: 'allowed' }, ['playground', 'ai-summaries'], offFor('ai-summaries'))).toEqual({
      state: 'locked', reason: 'AI summaries is turned off for this installation.',
    });
  });

  it('names the root cause: Search and Chat, not Playground, when only they are switched off', () => {
    const areaOn = offFor('search', 'chat', 'playground', 'ai-summaries');
    expect(areaGateFor({ state: 'allowed' }, 'playground', areaOn, { switchedOff: ['search', 'chat'], pinnedOff: [] })).toEqual({
      state: 'locked', reason: 'Search and Chat are turned off for this installation.',
    });
  });

  it('says a pinned area is turned off by the deployment setting', () => {
    const reason = areaGateFor({ state: 'allowed' }, 'playground', offFor('playground'), { switchedOff: [], pinnedOff: ['playground'] });
    expect(reason).toMatchObject({ state: 'locked' });
    expect((reason as { reason: string }).reason).toMatch(/^Playground: .*deployment/);
  });

  it('keeps loading as loading', () => {
    expect(areaGateFor({ state: 'loading' }, 'playground', offFor('playground'))).toEqual({ state: 'loading' });
  });
});

describe('settledChoice', () => {
  type Pane = 'talk' | 'find';
  const PANE_AREA: Record<Pane, Area> = { talk: 'chat', find: 'search' };
  const firstOn = (areaOn: (area: Area) => boolean): Pane => (areaOn('chat') || !areaOn('search') ? 'talk' : 'find');

  it('keeps the pick while its area is on', () => {
    expect(settledChoice<Pane>('find', PANE_AREA, on, firstOn)).toBe('find');
  });

  it('falls back once the picked area is switched off', () => {
    expect(settledChoice<Pane>('talk', PANE_AREA, offFor('chat'), firstOn)).toBe('find');
  });

  it('uses the fallback for the areas on now when nothing was picked', () => {
    expect(settledChoice<Pane>(null, PANE_AREA, on, firstOn)).toBe('talk');
    expect(settledChoice<Pane>(null, PANE_AREA, offFor('chat'), firstOn)).toBe('find');
  });
});
