// src/features/feature-switches/off-causes.ts

/**
 * Why areas are off, for the UI to say the real reason. An area can be off because an Admin
 * switched it off, because the deployment setting pins it off, or because it is switched on
 * but everything it needs (needsAnyOf) is off. Only the first two can be fixed by naming that
 * area; for the third the cause is the needs. Pure and safe to import from client code.
 */

import { needsOf, type Area } from './areas';

/** What /api/me/access says about why areas are off; each list is absent from an older server. */
export type OffReasons = { pinnedOff?: readonly Area[]; switchedOff?: readonly Area[] };

export type OffCauses = {
  /** Turned off by the deployment setting: can't be turned on in Settings → Features */
  pinned: Area[];
  /** Turned off by an Admin (or the reason is unknown): can be turned on in Settings → Features */
  switchable: Area[];
};

/**
 * Sorts the off areas by root cause. An area that is off only because what it needs is off is
 * replaced by those needs (the ones that are off). Without `switchedOff` (an older server) every
 * area counts as switched off, as before.
 */
export function offCauses(areas: readonly Area[], areaOn: (area: Area) => boolean, reasons: OffReasons = {}): OffCauses {
  const pinned: Area[] = [];
  const switchable: Area[] = [];
  const seen = new Set<Area>();
  const visit = (area: Area) => {
    if (seen.has(area)) return;
    seen.add(area);
    if (reasons.pinnedOff?.includes(area)) { pinned.push(area); return; }
    if (!reasons.switchedOff || reasons.switchedOff.includes(area)) { switchable.push(area); return; }
    const needs = needsOf(area).filter((n) => !areaOn(n));
    if (needs.length === 0) { switchable.push(area); return; }
    needs.forEach(visit);
  };
  areas.forEach(visit);
  return { pinned, switchable };
}
