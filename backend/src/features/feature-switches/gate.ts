// src/features/feature-switches/gate.ts

/**
 * The one server check for feature switches, asked everywhere a request comes in, always once
 * the caller is known, so a caller without a valid credential gets the same answer (401, 403)
 * whether an area is on or off and can't learn which areas are off:
 *  - admin routes: withPermission (route-guard.ts), after the session and role check;
 *  - server-to-server document writes with an ingestion key: withPermissionOrIngestionKey, which
 *    says "turned off" only to a live key for the index;
 *  - public /api/v1 routes: the access-token checks once the token or session is accepted (a
 *    built-in help experience is the Help assistant's), and the embed snippet by the
 *    experience's kind. publicApiRoute wraps every one, and refuses a route that answered
 *    without asking while its area is off (a net; routes.access.test.ts checks each route asks);
 *  - a dashboard session on a public experience route (the Test pages): Playground too.
 * A route whose area is off answers 404 "turned off" (to an Admin too), so a widget treats
 * the area as absent. Which area a route belongs to is route-areas.ts; a path no rule covers
 * is refused with a plain 404 (fail closed) and logged.
 */

import 'server-only';

import { AsyncLocalStorage } from 'node:async_hooks';

import type { NextResponse } from 'next/server';

import { TURNED_OFF_CODE, TURNED_OFF_MESSAGE, type Area } from './areas';
import { isAreaOn } from './feature-switches.service';
import { routeArea, type RouteArea } from './route-areas';

import { checkAccess, SIGNED_IN } from '@/features/access/route-guard';
import { publicRoute } from '@/shared/api/public-route';
import { apiResponse } from '@/shared/api/response';
import { AppError } from '@/shared/errors/app-error';
import { createLogger } from '@/shared/logger/logger';

export function turnedOff(): NextResponse {
  return apiResponse.error(new AppError(TURNED_OFF_MESSAGE, { code: TURNED_OFF_CODE, status: 404 }), 404, { operation: 'featureTurnedOff' });
}

const logger = createLogger('feature-switches');

/** Set by publicApiRoute for one request: whether the route asked for its area. */
const publicCheck = new AsyncLocalStorage<{ asked: boolean }>();

/** null when every area is on; else the 404, or the error when the switches couldn't be read. */
async function refuseUnlessOn(areas: readonly Area[], anyOf = false): Promise<NextResponse | null> {
  const asked = publicCheck.getStore();
  if (asked) asked.asked = true;
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

/**
 * A path no rule covers is refused (fail closed). Every route on disk has a rule
 * (features/access/routes.access.test.ts), so this is a path shape the table doesn't model: a
 * plain "not found", not "turned off", since no area is known to be off (a widget would take
 * "turned off" for its area gone, and an Admin would look for a switch that isn't there).
 */
function noRule(route: { pathname: string; method: string }): NextResponse {
  logger.warn('No feature area for this route; the request is refused', { pathname: route.pathname, method: route.method });
  return apiResponse.notFound();
}

type Route = { pathname: string; method: string };
type Found = { route: Route; area: RouteArea } | { route: Route; area?: undefined } | null;

/** The route and its area; null when there is no request to read (a handler called directly). */
function areaOf(request: unknown): Found {
  const route = routeOf(request);
  return route && { route, area: routeArea(route.pathname, route.method) };
}

/** For admin routes and ingestion: the 404 to send when the route's area is off, or null. */
export async function refuseIfRouteOff(request: unknown): Promise<NextResponse | null> {
  const found = areaOf(request);
  if (!found) return null;
  if (!found.area) return noRule(found.route);
  return refuseUnlessOn(found.area.areas);
}

/**
 * For a public route that answered without asking (publicApiRoute): the 404 when nothing the
 * route serves can be on. An experience route stays open while the Help assistant is on (its
 * built-in experiences use the same routes).
 */
async function refusePublicIfOff(request: unknown): Promise<NextResponse | null> {
  const found = areaOf(request);
  if (!found) return null;
  if (!found.area) return noRule(found.route);
  if (!found.area.experience) return refuseUnlessOn(found.area.areas);
  return refuseUnlessOn([...found.area.areas, 'help-assistant'], true);
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
    const found = areaOf(request);
    if (!found) return null;
    if (!found.area) return noRule(found.route);
    areas = found.area.areas;
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

/**
 * For a built-in help experience that doesn't exist yet: the 404 "turned off" when the Help
 * assistant is off, so the drawer says so instead of "not set up", or null. Only to someone
 * signed in (the built-in help is theirs); anyone else gets the route's own "not found", as
 * with the Help assistant on.
 */
export async function refuseHelpIfOff(): Promise<NextResponse | null> {
  // Sign-in first: a caller without a credential gets the route's own answer whatever the
  // switches say, and an unreadable switch store (a 500) is not something to tell them
  try {
    const { response } = await checkAccess(SIGNED_IN);
    if (response) return null;
  } catch (error) {
    return apiResponse.error(error, 500, { operation: 'checkHelpAccess' });
  }
  return refuseUnlessOn(['help-assistant']);
}

/** Marks a route wrapped by publicApiRoute (a test checks every /api/v1 route is). */
export const FEATURE_GATED = Symbol.for('interakt.featureGated');

/**
 * publicRoute (visitor-safe errors) for every /api/v1 route. The route asks for its area once
 * it knows the caller (the token and session checks above); asking first would tell a caller
 * without a valid credential which areas are off. A route that answers without having asked is
 * a bug: it is logged, and refused while its area is off (fail closed).
 */
export function publicApiRoute<A extends unknown[], R extends Response>(
  handler: (...args: A) => Promise<R>,
): (...args: A) => Promise<R | NextResponse> {
  const route = publicRoute((...args: A): Promise<R | NextResponse> => {
    const asked = { asked: false };
    return publicCheck.run(asked, async () => {
      const response = await handler(...args);
      if (asked.asked || response.status >= 400) return response;
      const found = areaOf(args[0]);
      logger.error('A public route answered without checking its feature area', found ? { pathname: found.route.pathname, method: found.route.method } : {});
      return (await refusePublicIfOff(args[0])) ?? response;
    });
  });
  Object.defineProperty(route, FEATURE_GATED, { value: true });
  return route;
}

export function isFeatureGated(fn: unknown): boolean {
  return typeof fn === 'function' && (fn as unknown as Record<symbol, unknown>)[FEATURE_GATED] === true;
}
