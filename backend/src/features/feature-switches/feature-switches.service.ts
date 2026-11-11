// src/features/feature-switches/feature-switches.service.ts

/**
 * Which areas are on for this installation. Two levels:
 *  - the deployment setting INTERAKT_FEATURES_OFF=chat,analytics turns areas off for good
 *    (an Admin can't turn them back on);
 *  - within that, an Admin turns areas on or off (stored with the installation settings).
 * An area is on when neither turns it off and, if it needs another area, one of those is on.
 *
 * isAreaOn is the one answer every gate asks (gate.ts). The stored state is read with a short
 * cache that a save clears, so a change applies to the next request in this process and
 * within CACHE_MS on the others.
 */

import 'server-only';

import { AREAS, AREA_IDS, FEATURES_OFF_ENV, isArea, needsOf, PINNED_OFF_MESSAGE, type Area } from './areas';

import { getStoredFeaturesOff, saveFeaturesOff } from '@/features/global-settings';
import { AppError } from '@/shared/errors/app-error';
import { createLogger } from '@/shared/logger/logger';

const logger = createLogger('feature-switches');

const CACHE_MS = 5_000;

let stored: { off: ReadonlySet<Area>; at: number } | null = null;

/**
 * The areas an Admin turned off. A failed read uses the last known answer; with none, it
 * throws, and the gate answers the request as an error (as when the role lookup fails).
 */
async function storedOff(): Promise<ReadonlySet<Area>> {
  if (stored && Date.now() - stored.at < CACHE_MS) return stored.off;
  try {
    const off = new Set((await getStoredFeaturesOff()).filter(isArea));
    stored = { off, at: Date.now() };
    return off;
  } catch (error) {
    if (!stored) throw error;
    logger.error('Could not read the feature switches; using the last known ones', error instanceof Error ? error : new Error(String(error)));
    return stored.off;
  }
}

let pinned: { raw: string; off: ReadonlySet<Area> } | null = null;

/** The areas the deployment setting turns off (parsed once per value). */
export function pinnedOff(): ReadonlySet<Area> {
  const raw = process.env[FEATURES_OFF_ENV] ?? '';
  if (pinned?.raw === raw) return pinned.off;
  const names = raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  const unknown = names.filter((n) => !isArea(n));
  if (unknown.length) {
    logger.error(`${FEATURES_OFF_ENV} names areas that don't exist; they are ignored`, undefined, { unknown, areas: AREA_IDS });
  }
  pinned = { raw, off: new Set(names.filter(isArea)) };
  return pinned.off;
}

function on(area: Area, off: ReadonlySet<Area>): boolean {
  if (off.has(area)) return false;
  const needs = needsOf(area);
  return needs.length === 0 || needs.some((n) => on(n, off));
}

async function allOff(): Promise<ReadonlySet<Area>> {
  return new Set([...pinnedOff(), ...(await storedOff())]);
}

/** Whether this area is on for the installation now. */
export async function isAreaOn(area: Area): Promise<boolean> {
  return on(area, await allOff());
}

export type FeatureSwitch = {
  id: Area;
  label: string;
  description: string;
  /** On now: switched on, not pinned off, and what it needs is on. */
  on: boolean;
  /** What the Admin chose. */
  switchedOn: boolean;
  /** Turned off by the deployment setting: the Admin can't turn it on. */
  pinnedOff: boolean;
  /** At least one of these must be on for this area to work. */
  needsAnyOf: readonly Area[];
};

/** Every area with its state, for the settings API (and the admin UI). */
export async function listFeatureSwitches(): Promise<FeatureSwitch[]> {
  const pins = pinnedOff();
  const chosen = await storedOff();
  const off = new Set([...pins, ...chosen]);
  return AREAS.map((a) => ({
    id: a.id,
    label: a.label,
    description: a.description,
    on: on(a.id, off),
    switchedOn: !chosen.has(a.id),
    pinnedOff: pins.has(a.id),
    needsAnyOf: needsOf(a.id),
  }));
}

/**
 * Switch areas on or off (the ones not named keep their state). Turning on an area the
 * deployment setting turns off is refused. Data is never touched.
 */
export async function setFeatureSwitches(changes: Partial<Record<Area, boolean>>): Promise<FeatureSwitch[]> {
  const pins = pinnedOff();
  const pinnedOn = (Object.keys(changes) as Area[]).filter((a) => changes[a] === true && pins.has(a));
  if (pinnedOn.length) {
    throw new AppError(`${pinnedOn.join(', ')}: ${PINNED_OFF_MESSAGE}`, { code: 'FEATURE_PINNED_OFF', status: 409 });
  }
  // Read fresh, so a save doesn't undo another Admin's change still in the cache
  const off = new Set((await getStoredFeaturesOff()).filter(isArea));
  for (const [area, wanted] of Object.entries(changes) as Array<[Area, boolean]>) {
    if (wanted) off.delete(area);
    else off.add(area);
  }
  await saveFeaturesOff(AREA_IDS.filter((a) => off.has(a)));
  clearFeatureSwitchCache();
  return listFeatureSwitches();
}

/** Forget the cached stored state: the next check reads it again. */
export function clearFeatureSwitchCache(): void {
  stored = null;
}
