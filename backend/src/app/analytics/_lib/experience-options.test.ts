// src/app/analytics/_lib/experience-options.test.ts

import { describe, expect, it } from 'vitest';

import { experiencesWithAreaOn, type ExperienceOption } from './experience-options';

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
