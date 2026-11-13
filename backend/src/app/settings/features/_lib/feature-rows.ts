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
 * The switch shows what the Admin chose. It is locked (with the reason) when the deployment
 * turns the area off, or when it is switched on but nothing it needs is on; it keeps its
 * choice and comes back with its needs.
 */
export function rowState(row: FeatureRow, areas: readonly FeatureRow[]): { checked: boolean; reason: string | null } {
  if (row.pinnedOff) return { checked: false, reason: PINNED_OFF_MESSAGE };
  const needsUnmet =
    row.switchedOn && row.needsAnyOf.length > 0 && !row.needsAnyOf.some((id) => areas.find((a) => a.id === id)?.on);
  return { checked: row.switchedOn, reason: needsUnmet ? needsLabel(row, areas) : null };
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
