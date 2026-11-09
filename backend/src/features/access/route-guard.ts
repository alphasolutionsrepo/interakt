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
 * The rule is attached to the returned function so a test can read it for every route.
 */

import 'server-only';

import type { NextRequest, NextResponse } from 'next/server';

import { can, resolveAccess, type UserAccess } from './access.service';
import type { Permission } from './permissions';

import { auth } from '@/features/auth/auth.api.handlers';
import { hasBearerCredentials } from '@/features/ingestion-keys/ingestion-key.middleware';
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

/** Check the current session against a rule. Use withPermission for routes. */
export async function checkAccess(rule: AccessRule): Promise<CheckResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { response: apiResponse.unauthorized() };

  const access = await resolveAccess(userId);
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
    return handler(...args);
  };
  Object.defineProperty(guarded, ACCESS_RULE, { value: rule });
  return guarded;
}

/**
 * For the search index document routes, which servers also call with an ingestion key: a
 * request with a Bearer credential goes to the handler, which authenticates the key itself
 * (resolveDocumentActor) and rejects an invalid one. Any other request needs a session whose
 * role holds `rule`. Mirrors the middleware's exemption for the same subtree.
 */
export function withPermissionOrIngestionKey<A extends [NextRequest, ...unknown[]]>(
  rule: AccessRule,
  handler: Handler<A>,
): Handler<A> {
  const sessionGuarded = withPermission(rule, handler);
  const guarded = async (...args: A): Promise<Response> =>
    hasBearerCredentials(args[0]) ? handler(...args) : sessionGuarded(...args);
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
