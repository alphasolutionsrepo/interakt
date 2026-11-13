// app/users/_components/AccessOverview.tsx

'use client';

import { unmetNeeds, viewGroups } from '../_lib/permission-view';
import type { RoleResponse } from '../_lib/roles-api';

import { Switch } from '@/components/ui/switch';
import {
  effectivePermissions,
  isPermission,
  PERMISSION_GROUPS,
  type Permission,
} from '@/features/access/permissions';
import type { Area } from '@/features/feature-switches/areas';
import { AreaOffNote, areaLabel, rolesKeepDetail } from '@/shared/access/AreaOffNote';
import { useAccess } from '@/shared/access/useAccess';

/**
 * How one permission stands in one role:
 *  - on: the role holds it
 *  - included: another permission the role holds brings it (changing implies seeing)
 *  - unmet: ticked, but it needs companions the role lacks, so it grants nothing yet
 *  - off: the role doesn't hold it
 * Admin holds everything, always.
 */
export type CellState = 'on' | 'included' | 'unmet' | 'off';

export function cellState(role: Pick<RoleResponse, 'isBuiltIn' | 'permissions'>, permission: Permission): CellState {
  if (role.isBuiltIn) return 'on';
  const stored = role.permissions.includes(permission);
  const granted = effectivePermissions(role.permissions.filter(isPermission)).includes(permission);
  if (stored) return granted ? 'on' : 'unmet';
  return granted ? 'included' : 'off';
}

/** The role's stored permissions after switching one on or off. */
export function toggled(role: Pick<RoleResponse, 'permissions'>, permission: Permission, on: boolean): Permission[] {
  const kept = role.permissions.filter(isPermission).filter((p) => p !== permission);
  return on ? [...kept, permission] : kept;
}

const cellTitle = (state: CellState, permission: Permission, role: RoleResponse, areaOn: (area: Area) => boolean): string | undefined => {
  if (role.isBuiltIn) return 'Admin holds every permission';
  if (state === 'included') return 'Included by another permission this role has';
  if (state === 'unmet') return unmetTitle(role.permissions, permission, areaOn);
  return undefined;
};

const LABELS = new Map<string, string>(PERMISSION_GROUPS.flatMap((g) => g.permissions.map((p) => [p.id, p.label] as const)));

/**
 * Why a ticked permission grants nothing yet: the companions this role still lacks, by name.
 * Companions in a turned-off area are named apart, since nobody can switch them on for now.
 */
export function unmetTitle(stored: readonly string[], permission: Permission, areaOn: (area: Area) => boolean = () => true): string {
  const { tickable, blocked, blockedAreas } = unmetNeeds(stored, permission, areaOn);
  const names = (list: readonly Permission[]) => list.map((p) => LABELS.get(p) ?? p).join('; ');
  const parts: string[] = [];
  if (tickable.length > 0) parts.push(`Takes effect only once this role also has: ${names(tickable)}`);
  if (blocked.length > 0) {
    const areas = blockedAreas.map(areaLabel).join(' and ');
    parts.push(`${parts.length > 0 ? 'Also needs' : 'Takes effect only once this role also has'}: ${names(blocked)} (${areas} ${blockedAreas.length > 1 ? 'are' : 'is'} turned off for this installation, so ${blocked.length > 1 ? 'these' : 'this'} can't be switched on now)`);
  }
  return parts.join('. ');
}

/**
 * Every role against every permission, on one screen. An Admin switches permissions here
 * (each switch saves that role); other user managers see it read-only.
 */
export function AccessOverview({
  roles,
  editable,
  saving = false,
  onChange,
}: {
  roles: RoleResponse[];
  /** Only an Admin changes roles (the server refuses everyone else) */
  editable: boolean;
  /**
   * A save is in flight: every switch waits for it and the fresh roles, because each save sends
   * the role's whole list and a click on stale data would undo the one before
   */
  saving?: boolean;
  onChange: (role: RoleResponse, permissions: Permission[]) => void;
}) {
  const { areaOn } = useAccess();
  const groups = viewGroups(PERMISSION_GROUPS, areaOn, new Set());
  return (
    <section className="space-y-3" aria-labelledby="access-overview-heading">
      <div>
        <h3 id="access-overview-heading" className="text-base font-semibold">Access overview</h3>
        <p className="text-sm text-muted-foreground">
          {editable
            ? 'What each role can do. Switch a permission to change it for everyone with that role.'
            : 'What each role can do. Only an Admin can change it.'}
        </p>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-border/60">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/60">
              <th scope="col" className="sticky left-0 z-10 min-w-[18rem] bg-background p-3 text-left font-medium text-muted-foreground">Permission</th>
              {roles.map((role) => (
                <th key={role.id} scope="col" className="p-3 text-center font-semibold whitespace-nowrap">{role.name}</th>
              ))}
            </tr>
          </thead>
          {groups.map((group) => (
            <tbody key={group.id} className="border-b border-border/60 last:border-b-0">
              <tr>
                <th scope="rowgroup" colSpan={roles.length + 1} className="bg-muted/40 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <span className="sticky left-3">{group.label}</span>
                </th>
              </tr>
              {group.offNotes.map((areas) => (
                <tr key={areas.join(',')}>
                  <td colSpan={roles.length + 1} className="px-3 py-2">
                    <AreaOffNote areas={areas} detail={rolesKeepDetail(areas)} />
                  </td>
                </tr>
              ))}
              {group.rows.map((p) => (
                <tr key={p.id}>
                  <th scope="row" className="sticky left-0 z-10 min-w-[18rem] bg-background p-3 text-left font-normal">{p.label}</th>
                  {roles.map((role) => {
                    const state = cellState(role, p.id);
                    const fixed = role.isBuiltIn || state === 'included' || p.disabled;
                    return (
                      <td key={role.id} className="p-3 text-center" title={cellTitle(state, p.id, role, areaOn)}>
                        <Switch
                          checked={state !== 'off'}
                          disabled={!editable || fixed || saving}
                          onCheckedChange={(on) => onChange(role, toggled(role, p.id, on))}
                          aria-label={`${p.label}: ${role.name}`}
                          data-state-detail={state}
                          className={state === 'unmet' ? 'data-[state=checked]:bg-amber-500' : undefined}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
    </section>
  );
}
