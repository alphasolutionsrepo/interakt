// src/features/ai-experience/access-token.middleware.ts

/**
 * Authenticate a public AI experience request by its access token, applying the
 * experience's allowed origins and rate limits. The AI counterpart of
 * features/search-experience/access-token.middleware.ts; routes use this rather
 * than looking the token up themselves.
 */

import 'server-only';

import { NextResponse, type NextRequest } from 'next/server';

import { getAIExperienceByAccessToken } from './ai-experience.service';
import type { AIExperienceWithTools } from './ai-experience.types';

import {
  aiExperienceAccess,
  checkPublicAccess,
  readAccessToken,
  type AccessCheckOptions,
} from '@/features/auth/public-access';

export type AIAccessResult =
  | { experience: AIExperienceWithTools; response?: undefined }
  | { experience?: undefined; response: NextResponse };

/** The AI experience the request's token belongs to, or the response to send (401, 403 or 429). */
export async function authenticateAIAccessToken(
  request: NextRequest,
  options: AccessCheckOptions = {},
): Promise<AIAccessResult> {
  const accessToken = readAccessToken(request);
  if (!accessToken) {
    return { response: NextResponse.json({ error: 'Access token is required' }, { status: 401 }) };
  }

  const experience = await getAIExperienceByAccessToken(accessToken);
  if (!experience) {
    return { response: NextResponse.json({ error: 'Invalid access token' }, { status: 401 }) };
  }
  if (!experience.isActive) {
    return { response: NextResponse.json({ error: 'AI Experience is not active' }, { status: 403 }) };
  }

  const refused = checkPublicAccess(request, aiExperienceAccess(experience), options);
  return refused ? { response: refused } : { experience };
}
