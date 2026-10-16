// src/features/auth/token-or-session.ts

/**
 * Authenticate an experience request by its access token, or by an admin session.
 *
 * Routes that serve both real clients and the admin playgrounds use this: a
 * matching access token (`Authorization: Bearer …` or `X-Access-Token`) is real
 * traffic; otherwise a signed-in admin is testing. Callers record admin requests
 * as test traffic (analytics source 'admin_test') and don't trace them by default.
 */

import 'server-only';

import type { NextRequest } from 'next/server';
import { auth } from './auth.api.handlers';

/** Who is calling: a client with the experience's token, or a signed-in admin. */
export type ExperienceCaller = 'api' | 'admin';

/**
 * @returns 'api' for a matching access token, 'admin' for a signed-in session,
 *   or null when neither (respond 401)
 */
export async function authenticateTokenOrSession(
  request: NextRequest,
  experienceAccessToken: string | null | undefined,
): Promise<ExperienceCaller | null> {
  const authHeader = request.headers.get('Authorization') ?? '';
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : (request.headers.get('X-Access-Token') ?? '').trim();

  if (token && experienceAccessToken && token === experienceAccessToken) {
    return 'api';
  }

  const session = await auth();
  return session?.user ? 'admin' : null;
}
