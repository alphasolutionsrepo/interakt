// src/features/ai-experience/access-token.middleware.ts

/**
 * Authenticate a public AI experience request by its access token, applying the
 * experience's allowed origins and rate limits. The AI counterpart of
 * features/search-experience/access-token.middleware.ts; routes use this rather
 * than looking the token up themselves.
 */

import 'server-only';

import type { NextRequest, NextResponse } from 'next/server';

import { getAIExperienceByAccessToken } from './ai-experience.service';
import type { AIExperienceWithTools } from './ai-experience.types';

import {
  aiExperienceAccess,
  checkPublicAccess,
  readAccessToken,
  type AccessCheckOptions,
} from '@/features/auth/public-access';
import { refuseExperienceIfOff } from '@/features/feature-switches/gate';
import { apiResponse } from '@/shared/api/response';

export type AIAccessResult =
  | { experience: AIExperienceWithTools; response?: undefined }
  | { experience?: undefined; response: NextResponse };

/**
 * The AI experience the request's token belongs to, or the response to send (401, 403 or 429,
 * or 404 when its area is turned off for this installation).
 */
export async function authenticateAIAccessToken(
  request: NextRequest,
  options: AccessCheckOptions = {},
): Promise<AIAccessResult> {
  const accessToken = readAccessToken(request);
  if (!accessToken) {
    return { response: apiResponse.unauthorized('Access token is required') };
  }

  const experience = await getAIExperienceByAccessToken(accessToken);
  if (!experience) {
    return { response: apiResponse.unauthorized('Invalid access token') };
  }
  if (!experience.isActive) {
    return { response: apiResponse.forbidden('AI Experience is not active') };
  }
  const off = await refuseExperienceIfOff(request, experience);
  if (off) return { response: off };

  const refused = checkPublicAccess(request, aiExperienceAccess(experience), options);
  return refused ? { response: refused } : { experience };
}
