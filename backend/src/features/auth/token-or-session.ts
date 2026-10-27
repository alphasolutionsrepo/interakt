// src/features/auth/token-or-session.ts

/**
 * Authenticate an experience request by its access token, or by an admin session.
 *
 * Routes that serve both real clients and the admin playgrounds use this: a
 * matching access token (`Authorization: Bearer …` or `X-Access-Token`) is real
 * traffic and gets the experience's access settings (allowed origins, rate limits);
 * otherwise a signed-in admin is testing. Callers record admin requests as test
 * traffic (analytics source 'admin_test') and don't trace them by default.
 */

import 'server-only';

import type { NextRequest, NextResponse } from 'next/server';
import { auth } from './auth.api.handlers';
import { checkPublicAccess, readAccessToken, type ExperienceAccess } from './public-access';

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
): Promise<TokenOrSessionResult> {
  const token = readAccessToken(request);
  if (token && experience.accessToken && token === experience.accessToken) {
    const refused = checkPublicAccess(request, experience);
    if (refused) return { caller: null, refused };
    // The real widget in the admin's own Widget playground sends the token and, being on the
    // admin's origin, the admin's session cookie; a visitor on another site never sends it.
    const session = await auth();
    return { caller: 'api', analyticsSource: session?.user ? 'admin_test' : 'api' };
  }

  const session = await auth();
  return session?.user ? { caller: 'admin', analyticsSource: 'admin_test' } : { caller: null };
}
