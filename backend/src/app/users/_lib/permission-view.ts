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
import { permissionArea } from '@/features/feature-switches/permission-areas';

export interface PermissionRow {
  id: Permission;
  label: string;
  held: boolean;
  /** Its area is off, so it can't be changed here (the role keeps it as it is) */
  disabled: boolean;
  disabledArea: Area | null;
}

export interface PermissionGroupView {
  id: string;
  label: string;
  rows: PermissionRow[];
  /** Off areas that have a permission in this group: one note each */
  offAreas: Area[];
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
      const area = permissionArea(p.id);
      const disabledArea = area !== null && !areaOn(area) ? area : null;
      return { id: p.id, label: p.label, held: held.has(p.id), disabled: disabledArea !== null, disabledArea };
    });
    const offAreas = [...new Set(rows.map((r) => r.disabledArea).filter((a): a is Area => a !== null))];
    return { id: group.id, label: group.label, rows, offAreas };
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
  const isBlocked = (p: Permission) => {
    const area = permissionArea(p);
    return area !== null && !areaOn(area);
  };
  const blocked = missing.filter(isBlocked);
  const blockedAreas = [...new Set(blocked.map((p) => permissionArea(p)).filter((a): a is Area => a !== null))];
  return { missing, tickable: missing.filter((p) => !isBlocked(p)), blocked, blockedAreas };
}
