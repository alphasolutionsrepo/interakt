// src/app/playground/_lib/area-gate.test.ts

import { describe, expect, it } from 'vitest';

import { areaGateFor, initialWidgetKind } from './area-gate';

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

  it('keeps loading as loading', () => {
    expect(areaGateFor({ state: 'loading' }, 'playground', offFor('playground'))).toEqual({ state: 'loading' });
  });
});

describe('initialWidgetKind', () => {
  it('opens on chat, or search when chat is off', () => {
    expect(initialWidgetKind(on)).toBe('chat');
    expect(initialWidgetKind(offFor('chat'))).toBe('search');
  });
});
