// src/features/embed/embed-access.ts

/**
 * Find the experience an embed-snippet request's token belongs to (AI or search). The
 * admin's embed-code card and integrators' tooling call the snippet route from anywhere, so
 * allowed origins don't apply; it's a setup call, so it isn't counted towards any limit.
 */

import 'server-only';

import { NextResponse, type NextRequest } from 'next/server';

import type { EmbedBrandingConfig, Widget } from './build-snippet';

import { getAIExperienceByAccessToken } from '@/features/ai-experience/ai-experience.service';
import { readAccessToken } from '@/features/auth/public-access';
import { refuseExperienceIfOff } from '@/features/feature-switches/gate';
import {
  ForbiddenError,
  getSearchExperienceByAccessToken,
  UnauthorizedError,
} from '@/features/search-experience/search-experience.service';

export interface EmbedExperience {
  /** The access token the snippet embeds. */
  accessToken: string;
  widget: Widget;
  name: string;
  embedConfig: EmbedBrandingConfig;
}

type Found = Omit<EmbedExperience, 'accessToken'> & { isBuiltIn: boolean };

async function findExperience(accessToken: string): Promise<Found | null> {
  const ai = await getAIExperienceByAccessToken(accessToken);
  if (ai) {
    if (!ai.isActive) return null;
    const embed = (ai.accessConfig as { embedConfig?: EmbedBrandingConfig } | null)?.embedConfig ?? {};
    return { widget: 'chat', name: ai.name, embedConfig: embed, isBuiltIn: ai.isBuiltIn === true };
  }

  try {
    const search = await getSearchExperienceByAccessToken(accessToken);
    // Search experiences don't carry an embedConfig today — snippet stays minimal.
    return { widget: 'search', name: search.name, embedConfig: {}, isBuiltIn: search.isBuiltIn === true };
  } catch (err) {
    if (err instanceof UnauthorizedError || err instanceof ForbiddenError) return null;
    throw err;
  }
}

/** The experience to build the snippet for, or the 401 to send (404 when its kind is turned off). */
export async function authenticateEmbedRequest(
  request: NextRequest,
): Promise<{ experience: EmbedExperience; response?: undefined } | { experience?: undefined; response: NextResponse }> {
  const accessToken = readAccessToken(request);
  if (!accessToken) {
    return { response: NextResponse.json({ error: 'Access token is required' }, { status: 401 }) };
  }

  const found = await findExperience(accessToken);
  if (!found) {
    return { response: NextResponse.json({ error: 'Invalid or inactive access token' }, { status: 401 }) };
  }
  const { isBuiltIn, ...experience } = found;
  const off = await refuseExperienceIfOff(request, { isBuiltIn }, experience.widget === 'chat' ? 'chat' : 'search');
  if (off) return { response: off };

  return { experience: { accessToken, ...experience } };
}
