// src/app/users/_lib/permission-view.ts

/**
 * How the role screens show permissions when a feature area is off: the permission stays listed
 * (greyed out, still held or not as the role has it) and its group notes the area. Pure, so the
 * role form and the Access overview agree. Nothing here removes or adds a permission.
 */

import {
  effectivePermissions,
  isPermission,
  PERMISSION_GROUPS,
  REQUIRED_WITH,
  type Permission,
} from '@/features/access/permissions';
import type { Area } from '@/features/feature-switches/areas';
import { offPermissionAreas } from '@/features/feature-switches/permission-areas';

export interface PermissionRow {
  id: Permission;
  label: string;
  held: boolean;
  /** Its area is off, so it can't be changed here (the role keeps it as it is) */
  disabled: boolean;
  /** The areas that are all off for this permission (it needs only one of them on); empty when enabled */
  disabledAreas: readonly Area[];
}

export interface PermissionGroupView {
  id: string;
  label: string;
  rows: PermissionRow[];
  /** One note per distinct set of off areas that has a permission in this group */
  offNotes: Area[][];
}

interface GroupLike {
  id: string;
  label: string;
  permissions: ReadonlyArray<{ id: Permission; label: string }>;
}

export function viewGroups(
  groups: readonly GroupLike[],
  areaOn: (area: Area) => boolean,
  held: ReadonlySet<string>,
): PermissionGroupView[] {
  return groups.map((group) => {
    const rows = group.permissions.map((p): PermissionRow => {
      const disabledAreas = offPermissionAreas(p.id, areaOn);
      return { id: p.id, label: p.label, held: held.has(p.id), disabled: disabledAreas.length > 0, disabledAreas };
    });
    const offNotes = new Map<string, Area[]>();
    for (const r of rows) if (r.disabled) offNotes.set(r.disabledAreas.join(','), [...r.disabledAreas]);
    return { id: group.id, label: group.label, rows, offNotes: [...offNotes.values()] };
  });
}

/** What a role form saves: every held permission, those of an off area exactly as they were. */
export function rolePermissionsToSave(held: ReadonlySet<string>): Permission[] {
  return [...held].filter(isPermission);
}

const TOTAL = PERMISSION_GROUPS.reduce((n, g) => n + g.permissions.length, 0);

/** "N of M permissions": everything the role grants, off areas included, out of the real total. */
export function permissionCount(role: { isBuiltIn: boolean; permissions: readonly string[] }): { held: number; total: number } {
  return { held: role.isBuiltIn ? TOTAL : effectivePermissions(role.permissions.filter(isPermission)).length, total: TOTAL };
}

/**
 * What a ticked permission still needs (REQUIRED_WITH), split into what can be ticked now and
 * what sits in a turned-off area, which nobody can tick until that area is back on.
 */
export function unmetNeeds(stored: readonly string[], permission: Permission, areaOn: (area: Area) => boolean) {
  const has = new Set(effectivePermissions(stored.filter(isPermission)));
  const missing = (REQUIRED_WITH[permission] ?? []).filter((p) => !has.has(p));
  const isBlocked = (p: Permission) => offPermissionAreas(p, areaOn).length > 0;
  const blocked = missing.filter(isBlocked);
  const blockedAreas = [...new Set(blocked.flatMap((p) => offPermissionAreas(p, areaOn)))];
  return { missing, tickable: missing.filter((p) => !isBlocked(p)), blocked, blockedAreas };
}
