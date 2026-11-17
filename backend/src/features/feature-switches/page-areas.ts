// src/features/feature-switches/page-areas.ts

/**
 * Which areas an admin page needs: one ordered table like route-areas.ts (first match wins, so
 * the specific rules come first), read by canOpenPage (the sidebar, links and the page gate).
 * A page that matches no rule is core and always open (data sources, AI providers, users,
 * settings, jobs, health, docs, setup, dashboard). Pure and safe to import from client code.
 *
 * A rule lists areas that must all be on (`all`) and areas of which one must be on (`anyOf`).
 * The server refuses the page's API calls on its own (route-areas.ts); this is the UI following it.
 *
 * Analytics settings stay reachable with Analytics off, as their API is core, so an Admin can
 * still change collection and retention.
 */

import { ANALYTICS_SECTION_NEEDS, type AreaNeeds } from './analytics-section-areas';
import { EXPERIENCE_TYPE_AREA, type Area } from './areas';

export type PageAreaRule = {
  /** Every one of these must be on */
  all?: readonly Area[];
  /** At least one of these must be on */
  anyOf?: readonly Area[];
};

const ID = '[^/]+';
/** The path and everything under it */
const under = (path: string) => new RegExp(`^${path}(/.*)?$`);

/** The analytics sections that need more than Analytics itself (Search, Conversations, AI & cost, Traces), from the same table the section nav reads */
const ANALYTICS_SECTION_RULES: ReadonlyArray<readonly [RegExp, PageAreaRule]> = (Object.entries(ANALYTICS_SECTION_NEEDS) as Array<[string, AreaNeeds]>).map(
  ([href, needs]) => [under(href), { all: ['analytics', ...(needs.all ?? [])], ...(needs.anyOf && { anyOf: needs.anyOf }) }] as const,
);

/** Both experience kinds' areas: a page serving search and chat alike needs either */
const EITHER_KIND: readonly Area[] = [EXPERIENCE_TYPE_AREA.search, EXPERIENCE_TYPE_AREA.ai];

const RULES: ReadonlyArray<readonly [RegExp, PageAreaRule | null]> = [
  // The experiences hub and the create page serve search and chat alike
  [/^\/experiences$/, { anyOf: EITHER_KIND }],
  [/^\/experiences\/create$/, { anyOf: EITHER_KIND }],
  [under('/experiences/search'), { all: ['search'] }],
  [under('/search-experiences'), { all: ['search'] }],
  [under('/experiences/ai'), { all: ['chat'] }],
  [under('/ai-experiences'), { all: ['chat'] }],
  [under('/tools'), { all: ['chat'] }],
  [under('/mcp-connections'), { all: ['chat'] }],
  [under('/prompt-templates'), { all: ['chat'] }],
  [under('/search-indexes'), { all: ['managed-indexes'] }],
  [new RegExp(`^/analytics/settings(/${ID})*$`), null],
  ...ANALYTICS_SECTION_RULES,
  [under('/analytics'), { all: ['analytics'] }],
  // The Test pages: Playground, plus the area tested
  // The index tab needs Managed indexes, the Experience Search tab needs Search: the page opens on either
  [/^\/playground\/search$/, { all: ['playground'], anyOf: ['managed-indexes', 'search'] }],
  [/^\/playground\/unified-search$/, { all: ['search', 'playground'] }],
  [/^\/playground\/widget$/, { all: ['playground'], anyOf: ['search', 'chat'] }],
  [under('/playground'), { all: ['playground'] }],
];

/** The areas a page needs, or undefined for a core page that is always open. */
export function pageAreaRule(pathname: string): PageAreaRule | undefined {
  const path = pathname.replace(/\/+$/, '') || '/';
  return RULES.find(([pattern]) => pattern.test(path))?.[1] ?? undefined;
}

/** Whether every area this page needs is on (always true for a core page). */
export function pageAreasOn(pathname: string, areaOn: (area: Area) => boolean): boolean {
  const rule = pageAreaRule(pathname);
  if (!rule) return true;
  return (rule.all ?? []).every(areaOn) && (!rule.anyOf || rule.anyOf.some(areaOn));
}

/**
 * The areas that keep this page closed, so the gate can name them: every `all` area that is off,
 * then the `anyOf` areas when none of them is on. Empty when the page is open.
 */
export function pageAreasOff(pathname: string, areaOn: (area: Area) => boolean): Area[] {
  const rule = pageAreaRule(pathname);
  if (!rule) return [];
  const off = (rule.all ?? []).filter((a) => !areaOn(a));
  if (rule.anyOf && !rule.anyOf.some(areaOn)) off.push(...rule.anyOf.filter((a) => !off.includes(a)));
  return off;
}
