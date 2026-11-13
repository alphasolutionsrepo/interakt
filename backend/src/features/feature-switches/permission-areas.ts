// src/features/feature-switches/permission-areas.ts

/**
 * Which area each permission belongs to, for the role editor: a permission whose area is off
 * stays listed but greyed out with the area's off note, so nobody grants something that does
 * nothing and nothing looks lost. Roles keep what they hold; turning the area back on restores it. Pure and safe to import from client code.
 *
 * Areas are grouped by what someone uses, so tools:* and prompts:* belong to Chat and
 * documents:edit to Managed indexes. A permission that belongs to no area is core (null).
 * analytics:manage is listed under Analytics although the analytics settings page stays
 * reachable with Analytics off: greying it out only stops new grants, the role keeps it.
 */

import type { Area } from './areas';

import type { Permission } from '@/features/access/permissions';

const BY_PREFIX: ReadonlyArray<readonly [string, Area]> = [
  ['search-experiences:', 'search'],
  ['ai-experiences:', 'chat'],
  ['tools:', 'chat'],
  ['prompts:', 'chat'],
  ['search-indexes:', 'managed-indexes'],
  ['analytics:', 'analytics'],
];

const BY_NAME: Readonly<Record<string, Area>> = {
  'documents:edit': 'managed-indexes',
  'playground:use': 'playground',
};

/** The area a permission belongs to, or null for a core permission (always shown). */
export function permissionArea(permission: Permission): Area | null {
  return BY_NAME[permission] ?? BY_PREFIX.find(([prefix]) => permission.startsWith(prefix))?.[1] ?? null;
}
