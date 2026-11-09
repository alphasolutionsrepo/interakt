// src/features/auth/token-or-session.ts

/**
 * Authenticate an experience request by its access token, or by an admin session.
 *
 * Routes that serve both real clients and the admin playgrounds use this: a
 * matching access token (`Authorization: Bearer …` or `X-Access-Token`) is real
 * traffic and gets the experience's access settings (allowed origins, rate limits);
 * otherwise a signed-in user whose role allows the playground (playground:use) is testing. Callers record admin requests as test
 * traffic (analytics source 'admin_test') and don't trace them by default.
 */

import 'server-only';

import type { NextRequest, NextResponse } from 'next/server';

import { checkAccess, SIGNED_IN } from '@/features/access/route-guard';
import { isBuiltInHelpExperience } from '@/shared/seeders/docs/built-in-help';

import { auth } from './auth.api.handlers';
import { checkPublicAccess, readAccessToken, type ExperienceAccess } from './public-access';

import { markAdminCaller } from '@/shared/api/public-route';
import { TEST_MARKER_HEADER } from '@/shared/constants/test-marker.constants';

/** Who is calling: a client with the experience's token, or a signed-in admin. */
export type ExperienceCaller = 'api' | 'admin';

/**
 * `caller` is null when the request may not go ahead. `refused` then holds the 403 or
 * 429 response for a token caller outside the experience's settings; without it, the
 * request had neither a matching token nor a session and the route answers 401.
 */
export type TokenOrSessionResult =
  | { caller: ExperienceCaller; analyticsSource: 'api' | 'admin_test'; refused?: undefined }
  | { caller: null; analyticsSource?: undefined; refused?: NextResponse };

export async function authenticateTokenOrSession(
  request: NextRequest,
  experience: ExperienceAccess,
  /** The experience's slug and creation time, to recognise the built-in help experiences */
  options: { slug?: string; createdAt?: Date | string | null } = {},
): Promise<TokenOrSessionResult> {
  const token = readAccessToken(request);
  if (token && experience.accessToken && token === experience.accessToken) {
    const refused = checkPublicAccess(request, experience);
    if (refused) return { caller: null, refused };
    return { caller: 'api', analyticsSource: await analyticsSourceOfTokenCaller(request) };
  }

  const session = await auth();
  if (!session?.user) return { caller: null };
  // A dashboard session is the playground, which spends tokens: the role must allow it. The
  // built-in help (seeded by the docs setup) is for everyone signed in.
  const isHelp = await isBuiltInHelpExperience(options);
  const { response } = await checkAccess(isHelp ? SIGNED_IN : 'playground:use');
  if (response) return { caller: null, refused: response };
  // The playground: an admin testing the experience gets errors explained in full
  markAdminCaller();
  return { caller: 'admin', analyticsSource: 'admin_test' };
}

/**
 * Whether a request with a valid access token is the admin testing, and if so marks it as
 * the admin's, so a failure is explained rather than given the visitors' plain message.
 * The admin's playgrounds send a test marker and, being on the admin's origin, the admin's
 * login: only both together make it a test, and only for a user whose role may use the
 * playgrounds. A visitor can send the marker but not the
 * login, and a signed-in admin using a live widget sends the login but not the marker;
 * both are live traffic.
 */
export async function markIfAdminTest(request: NextRequest): Promise<boolean> {
  if (request.headers.get(TEST_MARKER_HEADER) !== '1') return false;
  const session = await auth();
  if (!session?.user) return false;
  // Only a user who may use the playgrounds now (active, role with playground:use) is testing.
  // If that can't be checked, the request is live traffic (plain errors, counted as 'api').
  const allowed = await checkAccess('playground:use').then((r) => !r.response, () => false);
  if (!allowed) return false;
  markAdminCaller();
  return true;
}

/** Where a request with a valid access token came from (see markIfAdminTest, which it calls) */
export async function analyticsSourceOfTokenCaller(request: NextRequest): Promise<'api' | 'admin_test'> {
  return (await markIfAdminTest(request)) ? 'admin_test' : 'api';
}
