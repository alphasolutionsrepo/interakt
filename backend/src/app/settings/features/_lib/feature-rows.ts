// app/settings/features/_lib/feature-rows.ts

/**
 * What each row of Settings → Features shows and sends. Pure, so the rules are tested on
 * their own. Types only are imported from the service (it is server-only).
 */

import { PINNED_OFF_MESSAGE, type Area } from '@/features/feature-switches/areas';
import type { FeatureSwitch } from '@/features/feature-switches/feature-switches.service';


export type FeatureRow = FeatureSwitch;

export interface UpdateBody {
  areas: Partial<Record<Area, boolean>>;
}

/** "Needs Search" / "Needs Search or Chat" */
export function needsLabel(row: FeatureRow, areas: readonly FeatureRow[]): string {
  const names = row.needsAnyOf.map((id) => areas.find((a) => a.id === id)?.label ?? id);
  return `Needs ${names.join(' or ')}`;
}

/**
 * The switch shows what the Admin chose. Only the deployment pinning the area off locks it
 * (`locked`, with `reason`). What an area needs is information (`needs`), never a lock: an
 * Admin can always switch an area off, and can switch it on before its need is on, when it
 * stays inactive until then.
 */
export function rowState(
  row: FeatureRow,
  areas: readonly FeatureRow[],
): { checked: boolean; locked: boolean; reason: string | null; needs: string | null } {
  if (row.pinnedOff) return { checked: false, locked: true, reason: PINNED_OFF_MESSAGE, needs: null };
  const needsUnmet = row.needsAnyOf.length > 0 && !row.needsAnyOf.some((id) => areas.find((a) => a.id === id)?.on);
  return { checked: row.switchedOn, locked: false, reason: null, needs: needsUnmet ? needsLabel(row, areas) : null };
}

/** Areas switched on that need only the one being switched off: the Admin is asked about them. */
export function dependentsToAsk(id: Area, next: boolean, areas: readonly FeatureRow[]): Area[] {
  if (next) return [];
  return areas
    .filter((a) => a.switchedOn && a.needsAnyOf.length === 1 && a.needsAnyOf[0] === id)
    .map((a) => a.id);
}

/** One PUT body: the area, plus any dependents the Admin chose to switch off with it. */
export function updateBody(id: Area, next: boolean, alsoOff: readonly Area[] = []): UpdateBody {
  const areas: Partial<Record<Area, boolean>> = { [id]: next };
  for (const dep of alsoOff) areas[dep] = false;
  return { areas };
}
