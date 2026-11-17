// src/features/access/route-guard.ts

/**
 * The gate in front of every admin API route.
 *
 *   export const GET = withPermission('search-experiences:view', (request: NextRequest) => ...);
 *
 * Before the handler runs, the wrapper reads the session, then the user's current role and
 * active flag from the database (resolveAccess). No session, a deactivated or deleted user ->
 * 401. A role without the permission -> 403. If the check itself fails (database down), the
 * request is answered as an error (logged, with the request id) and the handler never runs.
 *
 * SIGNED_IN gates routes any active user may call (the dashboard, help, their own profile);
 * the handler still checks ownership where it acts on a user's own data.
 *
 * Then the feature switches: a route whose area is turned off for this installation answers
 * 404 "turned off", to an Admin too (features/feature-switches).
 *
 * The rule is attached to the returned function so a test can read it for every route.
 */

import 'server-only';

import { AsyncLocalStorage } from 'node:async_hooks';

import type { NextRequest, NextResponse } from 'next/server';

import { resolveAccess } from './access.service';
import { can, type UserAccess } from './user-access';
import type { Permission } from './permissions';

import { auth } from '@/features/auth/auth.api.handlers';
import { refuseIfRouteOff } from '@/features/feature-switches/gate';
import { authenticateIngestionKey, hasBearerCredentials } from '@/features/ingestion-keys/ingestion-key.middleware';
import { apiResponse } from '@/shared/api/response';


export const SIGNED_IN = 'signed-in' as const;
/** One permission, any one of several (data that more than one area's pages read), or just a session. */
export type AccessRule = Permission | readonly Permission[] | typeof SIGNED_IN;

function allows(access: UserAccess, rule: AccessRule): boolean {
  if (rule === SIGNED_IN) return true;
  return typeof rule === 'string' ? can(access, rule) : rule.some((p) => can(access, p));
}

const describeRule = (rule: Exclude<AccessRule, typeof SIGNED_IN>) =>
  typeof rule === 'string' ? rule : `one of ${rule.join(', ')}`;

/** Where withPermission stores a route's rule on the function it returns. */
export const ACCESS_RULE = Symbol.for('interakt.accessRule');

type Handler<A extends unknown[]> = (...args: A) => Response | Promise<Response>;

export type CheckResult = { access: UserAccess; response?: undefined } | { access?: undefined; response: NextResponse };

/** The access the route's gate read, for the rest of that request (one lookup per request). */
const requestAccess = new AsyncLocalStorage<UserAccess>();

async function currentAccess(): Promise<UserAccess | null> {
  const known = requestAccess.getStore();
  if (known) return known;
  const session = await auth();
  const userId = session?.user?.id;
  return userId ? resolveAccess(userId) : null;
}

/**
 * Check the current session against a rule. Use withPermission for routes; handlers call this
 * for the caller's access (it reuses the gate's lookup within the same request).
 */
export async function checkAccess(rule: AccessRule): Promise<CheckResult> {
  const access = await currentAccess();
  if (!access) return { response: apiResponse.unauthorized() };

  if (rule !== SIGNED_IN && !allows(access, rule)) {
    return { response: apiResponse.forbidden(`Your role doesn't allow this (needs ${describeRule(rule)})`) };
  }
  return { access };
}

export function withPermission<A extends unknown[]>(rule: AccessRule, handler: Handler<A>): Handler<A> {
  const guarded = async (...args: A): Promise<Response> => {
    let checked: CheckResult;
    try {
      checked = await checkAccess(rule);
    } catch (error) {
      // The check itself failed (database down): answer and log it like any API error.
      // The handler never runs.
      return apiResponse.error(error, 500, { operation: 'checkAccess' });
    }
    if (checked.response) return checked.response;
    const off = await refuseIfRouteOff(args[0]);
    if (off) return off;
    return requestAccess.run(checked.access, () => handler(...args));
  };
  Object.defineProperty(guarded, ACCESS_RULE, { value: rule });
  return guarded;
}

/**
 * For the search index document routes, which servers also call with an ingestion key: a
 * request with a Bearer credential goes to the handler, which authenticates the key itself
 * (resolveDocumentActor) and rejects an invalid one. Any other request needs a session whose
 * role holds `rule`. Mirrors the middleware's exemption for the same subtree. Either way the
 * route's area must be on.
 *
 * With the area off (or the switches unreadable), only a key that is live for the route's index
 * is told so; any other key gets the key check's own refusal (the one the handler gives with the
 * area on), so a caller without a valid key can't learn which areas are off. The handler does
 * not run while the area is off.
 */
export function withPermissionOrIngestionKey<A extends [NextRequest, ...unknown[]]>(
  rule: AccessRule,
  handler: Handler<A>,
): Handler<A> {
  const sessionGuarded = withPermission(rule, handler);
  const guarded = async (...args: A): Promise<Response> => {
    if (!hasBearerCredentials(args[0])) return sessionGuarded(...args);
    const off = await refuseIfRouteOff(args[0]);
    if (!off) return handler(...args);
    // Key first, then the area, then the handler: only a live key learns the area is off, and
    // any other key gets the key check's own refusal, so the handler never runs while it is off
    let auth: Awaited<ReturnType<typeof authenticateIngestionKey>>;
    try {
      const params = (await (args[1] as { params?: Promise<{ id?: string }> } | undefined)?.params) ?? {};
      auth = await authenticateIngestionKey(args[0], { searchIndexId: params.id ?? '' });
    } catch (error) {
      return apiResponse.error(error, 500, { operation: 'checkIngestionKey' });
    }
    return auth.success ? off : auth.response;
  };
  Object.defineProperty(guarded, ACCESS_RULE, { value: rule });
  Object.defineProperty(guarded, INGESTION_KEY_ALLOWED, { value: true });
  return guarded;
}

/** Marks a route that also accepts an ingestion key (tests check only document routes do). */
export const INGESTION_KEY_ALLOWED = Symbol.for('interakt.ingestionKeyAllowed');

export function acceptsIngestionKey(fn: unknown): boolean {
  return typeof fn === 'function' && (fn as unknown as Record<symbol, unknown>)[INGESTION_KEY_ALLOWED] === true;
}

export function accessRuleOf(fn: unknown): AccessRule | undefined {
  return typeof fn === 'function' ? (fn as unknown as Record<symbol, AccessRule>)[ACCESS_RULE] : undefined;
}
