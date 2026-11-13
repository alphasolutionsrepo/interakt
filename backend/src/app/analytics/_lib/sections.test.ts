// src/app/analytics/_lib/sections.test.ts

import { describe, expect, it } from 'vitest';

import { hiddenSectionAreas, visibleSections } from './sections';

import type { Area } from '@/features/feature-switches/areas';

const offFor = (...off: Area[]) => (a: Area) => !off.includes(a);
const labels = (areaOn: (a: Area) => boolean) => visibleSections(areaOn).map((s) => s.label);

describe('visibleSections', () => {
  it('shows every section with every area on', () => {
    expect(labels(offFor())).toEqual(['Overview', 'Search', 'Conversations', 'AI & cost', 'Traces', 'Settings']);
  });

  it('drops Search when search is off', () => {
    expect(labels(offFor('search'))).toEqual(['Overview', 'Conversations', 'AI & cost', 'Traces', 'Settings']);
  });

  it('drops Conversations and AI & cost when chat is off, keeping Traces for search', () => {
    expect(labels(offFor('chat'))).toEqual(['Overview', 'Search', 'Traces', 'Settings']);
  });

  it('drops Traces only when both search and chat are off', () => {
    expect(labels(offFor('search', 'chat'))).toEqual(['Overview', 'Settings']);
  });
});

describe('hiddenSectionAreas', () => {
  it('names the off areas whose sections are hidden', () => {
    expect(hiddenSectionAreas(offFor())).toEqual([]);
    expect(hiddenSectionAreas(offFor('chat'))).toEqual(['chat']);
    expect(hiddenSectionAreas(offFor('search', 'chat', 'playground'))).toEqual(['search', 'chat']);
  });
});
