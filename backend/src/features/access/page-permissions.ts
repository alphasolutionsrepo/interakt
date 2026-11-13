// src/features/access/page-permissions.ts

/**
 * Which permission opens which admin page. One table for the sidebar (hide what the role
 * can't open) and the page gate in AppShell (explain instead of showing failing requests).
 * The server refuses the page's API calls on its own; this is the UI following it.
 *
 * Most specific first. A page that matches no rule needs only a session (dashboard, docs,
 * health). Each rule lists the permissions of which any one is enough.
 *
 * A page of a feature area that is off (feature-switches/page-areas.ts) is closed to everyone:
 * pass `areaOn` (useAccess) to canOpenPage to apply that too.
 */

import type { Permission } from './permissions';

import type { Area } from '@/features/feature-switches/areas';
import { pageAreasOn } from '@/features/feature-switches/page-areas';

const ID = '[^/]+';

const PAGE_RULES: ReadonlyArray<readonly [RegExp, readonly Permission[]]> = [
  [new RegExp(`^/experiences/create$`), ['search-experiences:edit', 'ai-experiences:edit']],
  [new RegExp(`^/experiences/search/${ID}/edit$`), ['search-experiences:edit']],
  [new RegExp(`^/experiences/ai/${ID}/edit$`), ['ai-experiences:edit']],
  [new RegExp(`^/experiences/search(/|$)`), ['search-experiences:view']],
  [new RegExp(`^/experiences/ai(/|$)`), ['ai-experiences:view']],
  [new RegExp(`^/experiences$`), ['search-experiences:view', 'ai-experiences:view']],
  [new RegExp(`^/search-experiences/(create|${ID}/edit)$`), ['search-experiences:edit']],
  [new RegExp(`^/search-experiences(/|$)`), ['search-experiences:view']],
  [new RegExp(`^/ai-experiences/(create|${ID}/edit)$`), ['ai-experiences:edit']],
  [new RegExp(`^/ai-experiences(/|$)`), ['ai-experiences:view']],
  [new RegExp(`^/search-indexes/${ID}/upload$`), ['documents:edit']],
  [new RegExp(`^/search-indexes/(create|${ID}/edit|${ID}/mappings)$`), ['search-indexes:edit']],
  [new RegExp(`^/search-indexes(/|$)`), ['search-indexes:view']],
  [new RegExp(`^/data-sources/(create|${ID}/edit)$`), ['data-sources:edit']],
  [new RegExp(`^/data-sources(/|$)`), ['data-sources:view']],
  [new RegExp(`^/(tools|mcp-connections)/(create|${ID}/edit)$`), ['tools:edit']],
  [new RegExp(`^/(tools|mcp-connections)(/|$)`), ['tools:view']],
  [new RegExp(`^/prompt-templates(/|$)`), ['prompts:view']],
  [new RegExp(`^/playground(/|$)`), ['playground:use']],
  [new RegExp(`^/analytics/chat(/|$)`), ['analytics:ask']],
  [new RegExp(`^/analytics/settings(/|$)`), ['analytics:manage']],
  [new RegExp(`^/analytics(/|$)`), ['analytics:view']],
  [new RegExp(`^/jobs(/|$)`), ['settings:view']],
  [new RegExp(`^/ai-providers(/|$)`), ['ai-providers:view']],
  [new RegExp(`^/secrets(/|$)`), ['secrets:manage']],
  [new RegExp(`^/settings(/|$)`), ['settings:view']],
  [new RegExp(`^/users(/|$)`), ['users:manage']],
  [new RegExp(`^/setup(/|$)`), ['setup:run']],
];

/** The permissions that open a page (any one), or [] when a session is enough. */
export function permissionsForPage(pathname: string): readonly Permission[] {
  const path = pathname.replace(/\/+$/, '') || '/';
  return PAGE_RULES.find(([pattern]) => pattern.test(path))?.[1] ?? [];
}

/**
 * Whether the user can open a page. With `areaOn` the page's feature areas must be on as well
 * (an Admin too); without it only the permission counts.
 */
export function canOpenPage(pathname: string, can: (p: Permission) => boolean, areaOn?: (area: Area) => boolean): boolean {
  if (areaOn && !pageAreasOn(pathname, areaOn)) return false;
  const needed = permissionsForPage(pathname);
  return needed.length === 0 || needed.some(can);
}
