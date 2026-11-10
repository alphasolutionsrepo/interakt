// app/users/_components/AccessOverview.tsx

'use client';

import type { RoleResponse } from '../_lib/roles-api';

import { Switch } from '@/components/ui/switch';
import {
  effectivePermissions,
  isPermission,
  PERMISSION_GROUPS,
  REQUIRED_WITH,
  type Permission,
} from '@/features/access/permissions';

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

const cellTitle = (state: CellState, permission: Permission, role: RoleResponse): string | undefined => {
  if (role.isBuiltIn) return 'Admin holds every permission';
  if (state === 'included') return 'Included by another permission this role has';
  if (state === 'unmet') {
    const missing = (REQUIRED_WITH[permission] ?? []).length;
    return `Takes effect only together with ${missing} other permissions`;
  }
  return undefined;
};

/**
 * Every role against every permission, on one screen. An Admin switches permissions here
 * (each switch saves that role); other user managers see it read-only.
 */
export function AccessOverview({
  roles,
  editable,
  savingRoleId,
  onChange,
}: {
  roles: RoleResponse[];
  /** Only an Admin changes roles (the server refuses everyone else) */
  editable: boolean;
  /** A role whose save is in flight: its switches wait, so two clicks can't overwrite each other */
  savingRoleId?: string | null;
  onChange: (role: RoleResponse, permissions: Permission[]) => void;
}) {
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
              <th scope="col" className="p-3 text-left font-medium text-muted-foreground">Permission</th>
              {roles.map((role) => (
                <th key={role.id} scope="col" className="p-3 text-center font-semibold whitespace-nowrap">{role.name}</th>
              ))}
            </tr>
          </thead>
          {PERMISSION_GROUPS.map((group) => (
            <tbody key={group.id} className="border-b border-border/60 last:border-b-0">
              <tr>
                <th scope="rowgroup" colSpan={roles.length + 1} className="bg-muted/40 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {group.label}
                </th>
              </tr>
              {group.permissions.map((p) => (
                <tr key={p.id}>
                  <th scope="row" className="p-3 text-left font-normal">{p.label}</th>
                  {roles.map((role) => {
                    const state = cellState(role, p.id);
                    const fixed = role.isBuiltIn || state === 'included';
                    return (
                      <td key={role.id} className="p-3 text-center" title={cellTitle(state, p.id, role)}>
                        <Switch
                          checked={state !== 'off'}
                          disabled={!editable || fixed || savingRoleId === role.id}
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
