// src/features/feature-switches/page-areas.test.ts

import { describe, expect, it } from 'vitest';

import type { Area } from './areas';
import { pageAreasOn, pageAreaRule } from './page-areas';

const offOf = (...off: Area[]) => (a: Area) => !off.includes(a);
const allOn = offOf();

describe('which areas a page needs', () => {
  it('opens every page with everything on', () => {
    for (const p of ['/experiences', '/experiences/search/x', '/playground/widget', '/analytics/overview', '/search-indexes/x', '/users']) {
      expect(pageAreasOn(p, allOn)).toBe(true);
    }
  });

  it('closes search pages when Search is off, chat pages when Chat is off', () => {
    expect(pageAreasOn('/experiences/search/x/edit', offOf('search'))).toBe(false);
    expect(pageAreasOn('/search-experiences/create', offOf('search'))).toBe(false);
    for (const p of ['/experiences/ai/x', '/ai-experiences/x', '/tools', '/tools/x/edit', '/mcp-connections/create', '/prompt-templates']) {
      expect(pageAreasOn(p, offOf('chat'))).toBe(false);
      expect(pageAreasOn(p, offOf('search'))).toBe(true);
    }
  });

  it('keeps the experiences hub and create page open while either Search or Chat is on', () => {
    for (const p of ['/experiences', '/experiences/create']) {
      expect(pageAreasOn(p, offOf('search'))).toBe(true);
      expect(pageAreasOn(p, offOf('chat'))).toBe(true);
      expect(pageAreasOn(p, offOf('search', 'chat'))).toBe(false);
    }
  });

  it('closes index pages with Managed indexes off, but not data sources', () => {
    expect(pageAreasOn('/search-indexes', offOf('managed-indexes'))).toBe(false);
    expect(pageAreasOn('/search-indexes/x/upload', offOf('managed-indexes'))).toBe(false);
    expect(pageAreasOn('/data-sources', offOf('managed-indexes'))).toBe(true);
  });

  it('closes analytics pages but leaves the analytics settings reachable', () => {
    expect(pageAreasOn('/analytics', offOf('analytics'))).toBe(false);
    expect(pageAreasOn('/analytics/chat', offOf('analytics'))).toBe(false);
    expect(pageAreasOn('/analytics/settings', offOf('analytics'))).toBe(true);
  });

  it('needs the section\'s own area as well as Analytics on each analytics section', () => {
    expect(pageAreasOn('/analytics/search', offOf('search'))).toBe(false);
    expect(pageAreasOn('/analytics/search/x', offOf('search'))).toBe(false);
    expect(pageAreasOn('/analytics/search', offOf('chat'))).toBe(true);
    for (const p of ['/analytics/conversations', '/analytics/ai']) {
      expect(pageAreasOn(p, offOf('chat'))).toBe(false);
      expect(pageAreasOn(p, offOf('search'))).toBe(true);
      expect(pageAreasOn(p, offOf('analytics'))).toBe(false);
    }
    expect(pageAreasOn('/analytics/traces', offOf('search'))).toBe(true);
    expect(pageAreasOn('/analytics/traces', offOf('chat'))).toBe(true);
    expect(pageAreasOn('/analytics/traces', offOf('search', 'chat'))).toBe(false);
    expect(pageAreasOn('/analytics/overview', offOf('search', 'chat'))).toBe(true);
    expect(pageAreasOn('/analytics/settings', offOf('search', 'chat', 'analytics'))).toBe(true);
  });

  it('needs Playground, and the area tested, for the Test pages', () => {
    expect(pageAreasOn('/playground', offOf('playground'))).toBe(false);
    expect(pageAreasOn('/playground/ai-service', offOf('playground'))).toBe(false);
    expect(pageAreasOn('/playground/ai-service', offOf('chat', 'search'))).toBe(true);
    expect(pageAreasOn('/playground/search', offOf('managed-indexes'))).toBe(false);
    expect(pageAreasOn('/playground/search', offOf('playground'))).toBe(false);
    expect(pageAreasOn('/playground/unified-search', offOf('search'))).toBe(false);
    expect(pageAreasOn('/playground/widget', offOf('search'))).toBe(true);
    expect(pageAreasOn('/playground/widget', offOf('search', 'chat'))).toBe(false);
    expect(pageAreasOn('/playground/widget', offOf('playground'))).toBe(false);
  });

  it('leaves core pages always open, even with every area off', () => {
    const none = () => false;
    for (const p of ['/', '/dashboard', '/data-sources', '/ai-providers', '/users', '/settings', '/settings/features', '/jobs', '/health', '/docs', '/setup', '/secrets']) {
      expect(pageAreasOn(p, none)).toBe(true);
      expect(pageAreaRule(p)).toBeUndefined();
    }
  });

  it('does not let a look-alike path borrow a rule and ignores a trailing slash', () => {
    expect(pageAreasOn('/toolsmith', offOf('chat'))).toBe(true);
    expect(pageAreasOn('/tools/', offOf('chat'))).toBe(false);
  });
});
