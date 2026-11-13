// src/features/feature-switches/permission-areas.ts

/**
 * Which areas a permission is useful in, for the role editor: a permission is greyed out with
 * the areas' off note only when ALL of its areas are off, so nobody grants something that does
 * nothing and nothing looks lost. One area on is enough, because its routes still work. Roles
 * keep what they hold; turning an area back on restores it. Pure and safe to import from client code.
 *
 * The map follows the routes (route-areas.ts and the route -> permission snapshot; a test
 * compares them): tools:* belongs to Chat and documents:edit to Managed indexes, but prompts:*
 * to both, since prompt templates and the knowledge base are Chat while an index's domain
 * knowledge is Managed indexes. playground:use also gates Chat's "generate tool description"
 * and AI summaries' "generate instructions". A permission with no areas is core (always shown).
 * analytics:manage is listed under Analytics although the analytics settings pages stay
 * reachable with Analytics off: greying it out only stops new grants, the role keeps it.
 */

import type { Area } from './areas';

import type { Permission } from '@/features/access/permissions';

const BY_PREFIX: ReadonlyArray<readonly [string, readonly Area[]]> = [
  ['search-experiences:', ['search']],
  ['ai-experiences:', ['chat']],
  ['tools:', ['chat']],
  ['prompts:', ['chat', 'managed-indexes']],
  ['search-indexes:', ['managed-indexes']],
  ['analytics:', ['analytics']],
];

const BY_NAME: Readonly<Record<string, readonly Area[]>> = {
  'documents:edit': ['managed-indexes'],
  'playground:use': ['playground', 'chat', 'ai-summaries'],
};

/** The areas a permission is useful in (any one on is enough), or [] for a core permission (always shown). */
export function permissionAreas(permission: Permission): readonly Area[] {
  return BY_NAME[permission] ?? BY_PREFIX.find(([prefix]) => permission.startsWith(prefix))?.[1] ?? [];
}

/** The areas that make a permission unusable here: all of its areas when every one is off, else none. */
export function offPermissionAreas(permission: Permission, areaOn: (area: Area) => boolean): readonly Area[] {
  const areas = permissionAreas(permission);
  return areas.length > 0 && areas.every((a) => !areaOn(a)) ? areas : [];
}
