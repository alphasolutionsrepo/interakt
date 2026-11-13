// src/app/analytics/_lib/experience-options.test.ts

import { describe, expect, it } from 'vitest';

import { experiencesWithAreaOn, selectionChange, type ExperienceOption } from './experience-options';

import type { Area } from '@/features/feature-switches/areas';

const exp = (id: string, type: 'ai' | 'search'): ExperienceOption => ({ id, name: id, slug: id, type, isActive: true });
const list = [exp('a', 'ai'), exp('s', 'search')];
const offFor = (...off: Area[]) => (a: Area) => !off.includes(a);

describe('experiencesWithAreaOn', () => {
  it('keeps both types with both areas on', () => {
    expect(experiencesWithAreaOn(list, offFor()).map((e) => e.id)).toEqual(['a', 's']);
  });
  it('drops chat experiences when chat is off', () => {
    expect(experiencesWithAreaOn(list, offFor('chat')).map((e) => e.id)).toEqual(['s']);
  });
  it('drops search experiences when search is off', () => {
    expect(experiencesWithAreaOn(list, offFor('search')).map((e) => e.id)).toEqual(['a']);
  });
});

describe('selectionChange', () => {
  const base = { experiences: list, areaOn: offFor(), loading: false, complete: true, keepWhenMissing: false };
  const sel = (id: string, name = id, type?: 'ai' | 'search') => ({ id, name, type });

  it('resets a restored chat experience when Chat is off', () => {
    expect(selectionChange({ ...base, areaOn: offFor('chat'), selected: sel('a') })).toEqual({ kind: 'reset' });
  });
  it('resets a restored Ask scope on a chat experience when Chat is off, even when scopes are kept', () => {
    expect(selectionChange({ ...base, areaOn: offFor('chat'), keepWhenMissing: true, selected: sel('a', 'a', 'ai') })).toEqual({ kind: 'reset' });
  });
  it('keeps a search experience while Chat is off', () => {
    expect(selectionChange({ ...base, areaOn: offFor('chat'), selected: sel('s', 's', 'search') })).toEqual({ kind: 'keep' });
  });
  it('does nothing while access or the list is loading', () => {
    expect(selectionChange({ ...base, areaOn: offFor('chat'), loading: true, selected: sel('a') })).toEqual({ kind: 'keep' });
  });
  it('does nothing with no selection', () => {
    expect(selectionChange({ ...base, areaOn: offFor('chat'), selected: {} })).toEqual({ kind: 'keep' });
  });
  it('fills in name and type of a known experience', () => {
    expect(selectionChange({ ...base, selected: { id: 'a' }, experiences: [{ ...exp('a', 'ai'), name: 'Helper' }] })).toEqual({ kind: 'fill', id: 'a', name: 'Helper', type: 'ai' });
  });
  it('resets a deleted experience only when the list is complete and the scope is not kept', () => {
    expect(selectionChange({ ...base, selected: sel('gone') })).toEqual({ kind: 'reset' });
    expect(selectionChange({ ...base, complete: false, selected: sel('gone') })).toEqual({ kind: 'keep' });
    expect(selectionChange({ ...base, keepWhenMissing: true, selected: sel('gone') })).toEqual({ kind: 'keep' });
  });
});
