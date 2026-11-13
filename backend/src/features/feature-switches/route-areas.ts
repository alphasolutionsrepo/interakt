// src/features/feature-switches/route-areas.ts

/**
 * Which area each API route belongs to: one table, like the page rules, read by the one
 * server check (gate.ts). First match wins, so the more specific rules come first. Every
 * admin and public route must match a rule, 'core' (always on) included; a test fails for a
 * route that matches none, so a new route can't be forgotten.
 *
 * A route belongs to one area. A Test button inside another area also needs Playground
 * (testing a chat tool needs both Chat and Playground on).
 *
 * Public experience routes (`experience: true`) serve whichever experience the token or slug
 * names. A built-in help experience belongs to the Help assistant, so it keeps working when
 * Search or Chat is off; for any other the route's own area applies. The token and session
 * checks decide once they know the experience and have accepted the caller.
 *
 * A path no rule covers is refused (gate.ts).
 */

import type { Area } from './areas';

export type RouteArea = {
  /**
   * All must be on; empty for core routes (always on). For an experience route, the areas an
   * experience it serves can belong to (the token check picks the experience's own).
   */
  areas: readonly Area[];
  /** A public route that serves an experience: built-in help experiences are the Help assistant's. */
  experience: boolean;
};

type Rule = {
  pattern: RegExp;
  /** Only these methods (any method when left out). */
  methods?: readonly string[];
  area: 'core' | Area | readonly Area[];
  experience?: boolean;
};

const ID = '[^/]+';
// dotAll ('s'): a line break in a segment (\n, \r, U+2028, U+2029, sent percent-encoded) must
// still match its rule, or the route would match none and go unchecked
const re = (path: string) => new RegExp(`^/api/${path}$`, 's');
/** The path and everything under it */
const under = (path: string) => new RegExp(`^/api/${path}(/.*)?$`, 's');

const RULES: readonly Rule[] = [
  // ── Public API (/api/v1): the widgets and API clients ─────────────────────────
  { pattern: re(`v1/search/${ID}/summarize`), area: 'ai-summaries', experience: true },
  { pattern: re('v1/summarize'), area: 'ai-summaries', experience: true },
  { pattern: under('v1/search'), area: 'search', experience: true },
  { pattern: re('v1/autocomplete'), area: 'search', experience: true },
  { pattern: under('v1/documents'), area: 'search', experience: true },
  { pattern: under('v1/ai-experiences'), area: 'chat', experience: true },
  // Serves a search or a chat snippet: the token check applies the experience's own kind
  { pattern: re('v1/embed-snippet'), area: ['search', 'chat'], experience: true },

  // ── Test buttons: their area and Playground ──────────────────────────────────
  { pattern: re(`tools/${ID}/test`), methods: ['POST'], area: ['chat', 'playground'] },
  { pattern: re(`mcp-connections/${ID}/test`), methods: ['POST'], area: ['chat', 'playground'] },
  { pattern: under('search/(index|name)'), area: ['managed-indexes', 'playground'] },
  { pattern: re('ai-service/providers'), area: 'core' }, // the model pickers read it
  { pattern: under('ai-service'), area: 'playground' },

  // ── Search and AI summaries ──────────────────────────────────────────────────
  { pattern: re('search-experiences/generate-instructions'), area: 'ai-summaries' },
  { pattern: under('search-experiences'), area: 'search' },

  // ── Chat, with what only chat uses ───────────────────────────────────────────
  { pattern: under('ai-experiences'), area: 'chat' },
  { pattern: under('tools'), area: 'chat' },
  { pattern: under('mcp-connections'), area: 'chat' },
  { pattern: under('prompt-templates'), area: 'chat' },
  { pattern: under('knowledge-base'), area: 'chat' },

  // ── Managed indexes (domain knowledge and ingestion keys included) ───────────
  // The index pickers of search experiences and the data-source wizard read the index list and
  // an index's fields; they must load while Managed indexes is off (an experience can still be
  // edited against its sources)
  { pattern: re('search-indexes'), methods: ['GET'], area: 'core' },
  { pattern: re('search-indexes/all'), methods: ['GET'], area: 'core' },
  { pattern: re(`search-indexes/${ID}/fields`), methods: ['GET'], area: 'core' },
  // Settings → Cache is always on; its index card reads and clears the index configuration cache
  { pattern: under('search-indexes/cache'), area: 'core' },
  { pattern: under('search-indexes'), area: 'managed-indexes' },
  { pattern: re('search/health'), area: 'managed-indexes' },

  // ── Analytics ────────────────────────────────────────────────────────────────
  // Collection and retention settings stay reachable, so an Admin can change them while off
  { pattern: under('analytics/config'), area: 'core' },
  { pattern: under('telemetry/config'), area: 'core' },
  // Erasing recorded data stays possible while off (retention keeps deleting old rows too)
  { pattern: re('analytics/data'), methods: ['DELETE'], area: 'core' },
  { pattern: re('telemetry/traces'), methods: ['DELETE'], area: 'core' },
  { pattern: re(`telemetry/traces/${ID}`), methods: ['DELETE'], area: 'core' },
  { pattern: re(`analytics/chat/sessions/${ID}`), methods: ['DELETE'], area: 'core' },
  // The Search report needs Search on as well, AI & cost needs Chat (as the pages do). All
  // must be on, so Traces (Search or Chat) can't be written here; its data comes from
  // /analytics/dashboard, which stays with Analytics alone.
  { pattern: under('analytics/search'), area: ['analytics', 'search'] },
  { pattern: under('analytics/ai'), area: ['analytics', 'chat'] },
  { pattern: under('analytics'), area: 'analytics' },
  { pattern: under('telemetry'), area: 'analytics' },

  // ── Help assistant ───────────────────────────────────────────────────────────
  { pattern: re('admin/setup-docs'), area: 'help-assistant' },

  // ── Always on ────────────────────────────────────────────────────────────────
  { pattern: under('admin'), area: 'core' }, // setup and the demo
  { pattern: under('ai-providers'), area: 'core' },
  { pattern: under('ai-provider-models'), area: 'core' },
  { pattern: under('system-defaults'), area: 'core' },
  { pattern: under('data-sources'), area: 'core' },
  // Dismissing a tip: core, as hiding the setup checklist is; the handler refuses the analytics
  // tips with Analytics off (the rule can't see which tip the body names)
  { pattern: under('dashboard'), area: 'core' },
  { pattern: under('health'), area: 'core' },
  { pattern: under('help'), area: 'core' }, // the docs pages
  { pattern: under('jobs'), area: 'core' },
  { pattern: under('me'), area: 'core' },
  { pattern: under('roles'), area: 'core' },
  { pattern: under('users'), area: 'core' },
  { pattern: under('secrets'), area: 'core' },
  { pattern: under('settings'), area: 'core' },
  // Stored user memories are still recalled into the Help assistant's prompts with Chat off,
  // so an Admin must always be able to see and delete them
  { pattern: under('user-memories'), area: 'core' },
];

/** The area of an API route by its path (/api/...) and method, or undefined for a route no rule covers. */
export function routeArea(pathname: string, method: string): RouteArea | undefined {
  const rule = RULES.find((r) => r.pattern.test(pathname) && (!r.methods || r.methods.includes(method.toUpperCase())));
  if (!rule) return undefined;
  const areas = rule.area === 'core' ? [] : typeof rule.area === 'string' ? [rule.area] : rule.area;
  return { areas, experience: rule.experience === true };
}
