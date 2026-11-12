// src/features/feature-switches/gate.ts

/**
 * The one server check for feature switches, asked everywhere a request comes in:
 *  - admin routes: withPermission (route-guard.ts), after the session and role check;
 *  - server-to-server document writes with an ingestion key: withPermissionOrIngestionKey;
 *  - public /api/v1 routes: publicApiRoute up front, then the access-token checks once they
 *    know which experience is asked for (a built-in help experience is the Help assistant's),
 *    and the embed snippet by the experience's kind;
 *  - a dashboard session on a public experience route (the Test pages): Playground too.
 * A route whose area is off answers 404 "turned off" (to an Admin too), so a widget treats
 * the area as absent. Which area a route belongs to is route-areas.ts.
 */

import 'server-only';

import type { NextResponse } from 'next/server';

import { TURNED_OFF_CODE, TURNED_OFF_MESSAGE, type Area } from './areas';
import { isAreaOn } from './feature-switches.service';
import { routeArea } from './route-areas';

import { publicRoute } from '@/shared/api/public-route';
import { apiResponse } from '@/shared/api/response';
import { AppError } from '@/shared/errors/app-error';

export function turnedOff(): NextResponse {
  return apiResponse.error(new AppError(TURNED_OFF_MESSAGE, { code: TURNED_OFF_CODE, status: 404 }), 404, { operation: 'featureTurnedOff' });
}

/** null when every area is on; else the 404, or the error when the switches couldn't be read. */
async function refuseUnlessOn(areas: readonly Area[], anyOf = false): Promise<NextResponse | null> {
  try {
    for (const area of areas) {
      const isOn = await isAreaOn(area);
      if (anyOf && isOn) return null;
      if (!anyOf && !isOn) return turnedOff();
    }
    return anyOf && areas.length ? turnedOff() : null;
  } catch (error) {
    // Answered and logged like any API error; the handler never runs
    return apiResponse.error(error, 500, { operation: 'checkFeatureSwitches' });
  }
}

/**
 * The request's path and method; route handlers always get the request first. The path is
 * decoded and its slashes tidied the way the router reads it, so /api/%61i-experiences or
 * /api//tools can't step around the table.
 */
function routeOf(request: unknown): { pathname: string; method: string } | null {
  const { url, method } = (request ?? {}) as { url?: unknown; method?: unknown };
  if (typeof url !== 'string' || typeof method !== 'string') return null;
  let pathname = new URL(url, 'http://localhost').pathname;
  try {
    pathname = decodeURIComponent(pathname);
  } catch {
    // Not valid percent-encoding: the router can't read it either; match it as it is
  }
  return { pathname: pathname.replace(/\/{2,}/g, '/').replace(/(.)\/$/, '$1'), method };
}

/** For admin routes and ingestion: the 404 to send when the route's area is off, or null. */
export async function refuseIfRouteOff(request: unknown): Promise<NextResponse | null> {
  const route = routeOf(request);
  const area = route && routeArea(route.pathname, route.method);
  if (!area) return null; // every route has a rule (features/access/routes.access.test.ts)
  return refuseUnlessOn(area.areas);
}

/**
 * For public routes, before anything else: the 404 when nothing the route serves can be on.
 * An experience route stays open while the Help assistant is on (its built-in experiences
 * use the same routes); the token check then decides for the experience asked for.
 */
async function refusePublicIfOff(request: unknown): Promise<NextResponse | null> {
  const route = routeOf(request);
  const area = route && routeArea(route.pathname, route.method);
  if (!area) return null;
  if (!area.experience) return refuseUnlessOn(area.areas);
  return refuseUnlessOn([...area.areas, 'help-assistant'], true);
}

/**
 * For the access-token checks, once the experience is known: the 404 when its area is off. A
 * built-in help experience is the Help assistant's; otherwise `kind` (the embed snippet, which
 * serves either kind) or the route's own area applies.
 */
export async function refuseExperienceIfOff(
  request: unknown,
  experience: { isBuiltIn?: boolean },
  kind?: Area,
): Promise<NextResponse | null> {
  let areas: readonly Area[];
  if (experience.isBuiltIn) areas = ['help-assistant'];
  else if (kind) areas = [kind];
  else {
    const route = routeOf(request);
    const area = route && routeArea(route.pathname, route.method);
    if (!area) return null;
    areas = area.areas;
  }
  return refuseUnlessOn(areas);
}

/**
 * For a dashboard session calling an experience route, once the experience is known: that is
 * the playground (real traffic comes with the experience's token), so Playground must be on
 * too. The built-in help experiences are the Help assistant's and need only that, already
 * checked by refuseExperienceIfOff.
 */
export async function refuseSessionIfPlaygroundOff(experience: { isBuiltIn?: boolean }): Promise<NextResponse | null> {
  if (experience.isBuiltIn) return null;
  return refuseUnlessOn(['playground']);
}

/** Marks a route wrapped by publicApiRoute (a test checks every /api/v1 route is). */
export const FEATURE_GATED = Symbol.for('interakt.featureGated');

/**
 * publicRoute (visitor-safe errors) with the feature switch check in front. Every /api/v1
 * route uses this.
 */
export function publicApiRoute<A extends unknown[], R extends Response>(
  handler: (...args: A) => Promise<R>,
): (...args: A) => Promise<R | NextResponse> {
  const route = publicRoute(async (...args: A): Promise<R | NextResponse> => (await refusePublicIfOff(args[0])) ?? handler(...args));
  Object.defineProperty(route, FEATURE_GATED, { value: true });
  return route;
}

export function isFeatureGated(fn: unknown): boolean {
  return typeof fn === 'function' && (fn as unknown as Record<symbol, unknown>)[FEATURE_GATED] === true;
}
