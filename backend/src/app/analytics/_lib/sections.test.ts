// src/app/analytics/_lib/sections.test.ts

import { describe, expect, it } from 'vitest';

import { ANALYTICS_SECTIONS, hiddenSectionAreas, visibleSections } from './sections';

import { ANALYTICS_SECTION_NEEDS } from '@/features/feature-switches/analytics-section-areas';
import type { Area } from '@/features/feature-switches/areas';
import { pageAreasOn } from '@/features/feature-switches/page-areas';

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

describe('the section menu and the page gate', () => {
  // Analytics on; Search and Chat in every combination
  const combos: Array<readonly Area[]> = [[], ['search'], ['chat'], ['search', 'chat']];

  it.each(combos)('agree on every section with %j off', (...off: Area[]) => {
    const areaOn = (a: Area) => !off.includes(a);
    const shown = visibleSections(areaOn).map((s) => s.href);
    for (const section of ANALYTICS_SECTIONS) {
      expect(shown.includes(section.href), section.href).toBe(pageAreasOn(section.href, areaOn));
    }
  });
});

describe('the analytics section needs table', () => {
  it('names only sections that exist, so a renamed section cannot silently lose its areas', () => {
    const hrefs = ANALYTICS_SECTIONS.map((s) => s.href);
    for (const href of Object.keys(ANALYTICS_SECTION_NEEDS)) expect(hrefs, href).toContain(href);
  });
});
