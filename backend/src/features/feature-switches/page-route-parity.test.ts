// src/features/feature-switches/page-route-parity.test.ts

/**
 * page-areas.ts (what the UI hides) and route-areas.ts (what the server refuses) are two
 * tables for the same decision. Each admin page is paired with its main API route here, so one
 * changed without the other fails: the page's areas must equal the route's, core included.
 */

import { describe, expect, it } from 'vitest';

import type { Area } from './areas';
import { pageAreaRule } from './page-areas';
import { routeArea } from './route-areas';

const sorted = (a: readonly Area[] = []) => [...a].sort();

/** [admin page, its main API route, method]: the areas must be the same. */
const SAME: ReadonlyArray<readonly [string, string, string]> = [
  // search
  ['/experiences/search/x', '/api/search-experiences/x', 'GET'],
  ['/search-experiences/create', '/api/search-experiences', 'POST'],
  // chat, with what only chat uses
  ['/experiences/ai/x', '/api/ai-experiences/x', 'GET'],
  ['/ai-experiences', '/api/ai-experiences', 'GET'],
  ['/tools', '/api/tools', 'GET'],
  ['/mcp-connections', '/api/mcp-connections', 'GET'],
  ['/prompt-templates', '/api/prompt-templates', 'GET'],
  // managed indexes
  ['/search-indexes', '/api/search-indexes/x/documents', 'GET'],
  ['/search-indexes/x/upload', '/api/search-indexes/x/documents', 'POST'],
  // analytics
  ['/analytics/overview', '/api/analytics/search/overview', 'GET'],
  ['/analytics/chat', '/api/analytics/chat', 'POST'],
  // the Test pages: Playground plus the area tested
  ['/playground', '/api/ai-service/chat', 'POST'],
  ['/playground/ai-service', '/api/ai-service/chat', 'POST'],
  ['/playground/search', '/api/search/index/x', 'POST'],
  // core: always open, page and route alike
  ['/settings/features', '/api/settings/features', 'GET'],
  ['/analytics/settings', '/api/analytics/config', 'GET'],
  ['/data-sources', '/api/data-sources', 'GET'],
  ['/ai-providers', '/api/ai-providers', 'GET'],
  ['/users', '/api/users', 'GET'],
  ['/jobs', '/api/jobs', 'GET'],
  ['/dashboard', '/api/dashboard', 'GET'],
];

describe('page areas follow route areas', () => {
  it.each(SAME)('%s matches %s %s', (page, route, method) => {
    const routeAreas = routeArea(route, method);
    expect(routeAreas, `${route} must match a route rule`).toBeDefined();
    const rule = pageAreaRule(page);
    expect(rule?.anyOf, 'a page with an any-of rule belongs in DIFFERS_ON_PURPOSE').toBeUndefined();
    expect(sorted(rule?.all)).toEqual(sorted(routeAreas!.areas));
  });

  it('covers every area and the core exceptions', () => {
    const covered = new Set(SAME.flatMap(([, route, method]) => routeArea(route, method)!.areas));
    for (const a of ['search', 'chat', 'managed-indexes', 'analytics', 'playground'] as const) expect(covered.has(a)).toBe(true);
    expect(SAME.some(([p, r, m]) => p === '/settings/features' && routeArea(r, m)!.areas.length === 0)).toBe(true);
    expect(SAME.some(([p, r, m]) => p === '/analytics/settings' && routeArea(r, m)!.areas.length === 0)).toBe(true);
  });
});

describe('pages that differ from their route on purpose', () => {
  it('lets the experiences hub and create page open with either Search or Chat on (one route per kind)', () => {
    for (const p of ['/experiences', '/experiences/create']) {
      expect(pageAreaRule(p)).toEqual({ anyOf: ['search', 'chat'] });
    }
    expect(routeArea('/api/search-experiences', 'GET')!.areas).toEqual(['search']);
    expect(routeArea('/api/ai-experiences', 'GET')!.areas).toEqual(['chat']);
  });

  it('needs Search and Playground on the search playground, which calls the search experience routes and the public search routes', () => {
    expect(pageAreaRule('/playground/unified-search')).toEqual({ all: ['search', 'playground'] });
    expect(routeArea('/api/search-experiences', 'GET')!.areas).toEqual(['search']);
    expect(routeArea('/api/v1/autocomplete', 'POST')!.areas).toEqual(['search']);
    // Its summaries follow AI summaries: the page shows them disabled with a note while it is off
    expect(routeArea('/api/v1/search/x/summarize', 'POST')!.areas).toEqual(['ai-summaries']);
  });

  it('needs Playground and one of Search or Chat on the widget page, which calls the public routes of either', () => {
    expect(pageAreaRule('/playground/widget')).toEqual({ all: ['playground'], anyOf: ['search', 'chat'] });
    expect(routeArea('/api/v1/search/x', 'POST')!.areas).toEqual(['search']);
    expect(routeArea('/api/v1/ai-experiences/x/chat', 'POST')!.areas).toEqual(['chat']);
  });

  it('needs the section\'s own area besides Analytics on the analytics sections, whose API routes are gated by Analytics alone', () => {
    expect(pageAreaRule('/analytics/search')).toEqual({ all: ['analytics', 'search'] });
    expect(pageAreaRule('/analytics/conversations')).toEqual({ all: ['analytics', 'chat'] });
    expect(pageAreaRule('/analytics/ai')).toEqual({ all: ['analytics', 'chat'] });
    expect(pageAreaRule('/analytics/traces')).toEqual({ all: ['analytics'], anyOf: ['search', 'chat'] });
    expect(routeArea('/api/analytics/search/overview', 'GET')!.areas).toEqual(['analytics']);
  });
});
