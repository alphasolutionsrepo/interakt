// src/features/feature-switches/feature-switches.service.ts

/**
 * Which areas are on for this installation. Two levels:
 *  - the deployment setting INTERAKT_FEATURES_OFF=chat,analytics turns areas off for good
 *    (an Admin can't turn them back on);
 *  - within that, an Admin turns areas on or off (stored with the installation settings).
 * An area is on when neither turns it off and, if it needs another area, one of those is on.
 *
 * isAreaOn is the one answer every gate asks (gate.ts). The stored state is read with a short
 * cache that a save refreshes, so a change applies to the next request in this process and
 * within CACHE_MS on the others.
 */

import 'server-only';

import { AREAS, AREA_IDS, FEATURES_OFF_ENV, isArea, needsOf, PINNED_OFF_MESSAGE, type Area } from './areas';

import { getStoredFeaturesOff, updateFeaturesOff } from '@/features/global-settings';
import { AppError } from '@/shared/errors/app-error';
import { createLogger } from '@/shared/logger/logger';

const logger = createLogger('feature-switches');

const CACHE_MS = 5_000;

let stored: { off: ReadonlySet<Area>; at: number } | null = null;
let reading: Promise<ReadonlySet<Area>> | null = null;
// Bumped by a reset, so a read that started before it doesn't write its answer back
let generation = 0;

async function readStored(): Promise<ReadonlySet<Area>> {
  const mine = generation;
  try {
    const off = new Set((await getStoredFeaturesOff()).filter(isArea));
    if (mine === generation) stored = { off, at: Date.now() };
    return off;
  } catch (error) {
    if (!stored) throw error;
    // Keep serving the last known switches for another CACHE_MS before the database is tried
    // again, and log once per window rather than once per request
    stored = { off: stored.off, at: Date.now() };
    logger.error('Could not read the feature switches; using the last known ones', error instanceof Error ? error : new Error(String(error)));
    return stored.off;
  }
}

/**
 * The areas an Admin turned off. A failed read uses the last known answer; with none, it
 * throws, and the gate answers the request as an error (as when the role lookup fails).
 * Requests that arrive while a read is under way share it.
 */
async function storedOff(): Promise<ReadonlySet<Area>> {
  if (stored && Date.now() - stored.at < CACHE_MS) return stored.off;
  if (!reading) {
    const read: Promise<ReadonlySet<Area>> = readStored().finally(() => { if (reading === read) reading = null; });
    reading = read;
  }
  return reading;
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
export async function setFeatureSwitches(
  changes: Partial<Record<Area, boolean>>,
  actingUserId?: string,
): Promise<FeatureSwitch[]> {
  const pins = pinnedOff();
  const pinnedOn = (Object.keys(changes) as Area[]).filter((a) => changes[a] === true && pins.has(a));
  if (pinnedOn.length) {
    throw new AppError(`${pinnedOn.join(', ')}: ${PINNED_OFF_MESSAGE}`, { code: 'FEATURE_PINNED_OFF', status: 409 });
  }
  // Read and write under one lock, so a save doesn't undo another Admin's change
  const { before, after } = await updateFeaturesOff((current) => {
    const next = new Set(current.filter(isArea));
    for (const [area, wanted] of Object.entries(changes) as Array<[Area, boolean]>) {
      if (wanted) next.delete(area);
      else next.add(area);
    }
    return AREA_IDS.filter((a) => next.has(a));
  });
  const off = new Set(after.filter(isArea));
  const helpWasOn = on('help-assistant', new Set([...pins, ...before.filter(isArea)]));
  const areas = Object.keys(changes) as Area[];
  logger.info('Feature switches changed', {
    userId: actingUserId,
    switchedOn: areas.filter((a) => changes[a] === true),
    switchedOff: areas.filter((a) => changes[a] === false),
    featuresOff: after,
  });
  // What was just saved is the latest known state: keep it as the cache (and the fallback
  // for a failed read), rather than clearing it
  // and it wins over any read that started before it: that read may carry the old list
  generation++;
  reading = null;
  stored = { off, at: Date.now() };
  // Start-up skips the docs search while the Help assistant is off: build it once back on
  if (!helpWasOn && on('help-assistant', new Set([...pins, ...off]))) startDocsSearchBuild();
  return listFeatureSwitches();
}

let docsBuild: Promise<void> | null = null;

/** Builds docs search in the background (skipped when the docs are unchanged); one at a time. */
function startDocsSearchBuild(): void {
  if (docsBuild) return;
  docsBuild = import('@/shared/seeders/docs/docs-search.seeder')
    .then(({ buildDocsSearchOnStartup }) => buildDocsSearchOnStartup())
    .catch((error) => logger.error('Could not build docs search', error instanceof Error ? error : new Error(String(error))))
    .finally(() => { docsBuild = null; });
}

/** Forget everything cached, the last known switches too (for tests): the next check reads the database. */
export function clearFeatureSwitchCache(): void {
  generation++;
  stored = null;
  reading = null;
}
