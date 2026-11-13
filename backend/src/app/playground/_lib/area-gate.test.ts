// src/app/playground/_lib/area-gate.test.ts

import { describe, expect, it } from 'vitest';

import { initialSearchTab, initialWidgetKind, SEARCH_TAB_AREA, WIDGET_KIND_AREA } from './area-gate';

import { settledChoice } from '@/shared/access/area-gate';

const on = () => true;
const offFor = (...off: string[]) => (a: string) => !off.includes(a);

describe('settledChoice', () => {
  const loading = () => false;
  it('settles on a usable kind once access loads, though it first rendered while loading', () => {
    // While loading every area reads off; once loaded with Chat off, Search is shown
    expect(settledChoice(null, WIDGET_KIND_AREA, loading, initialWidgetKind)).toBe('chat');
    expect(settledChoice(null, WIDGET_KIND_AREA, offFor('chat'), initialWidgetKind)).toBe('search');
  });

  it('keeps the pick while its area is on, and leaves it when that area is switched off', () => {
    expect(settledChoice('search', WIDGET_KIND_AREA, on, initialWidgetKind)).toBe('search');
    expect(settledChoice('chat', WIDGET_KIND_AREA, offFor('chat'), initialWidgetKind)).toBe('search');
    expect(settledChoice('index', SEARCH_TAB_AREA, offFor('managed-indexes'), initialSearchTab)).toBe('experience');
  });
});

describe('initialWidgetKind', () => {
  it('opens on chat, or search when chat is off', () => {
    expect(initialWidgetKind(on)).toBe('chat');
    expect(initialWidgetKind(offFor('chat'))).toBe('search');
  });
});

describe('initialSearchTab', () => {
  it('opens on Index Search unless Managed indexes is off and Search is on', () => {
    expect(initialSearchTab(on)).toBe('index');
    expect(initialSearchTab(offFor('managed-indexes'))).toBe('experience');
    expect(initialSearchTab(offFor('search'))).toBe('index');
    expect(initialSearchTab(offFor('managed-indexes', 'search'))).toBe('index');
  });
});
