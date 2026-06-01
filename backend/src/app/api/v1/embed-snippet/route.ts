// app/api/v1/embed-snippet/route.ts
//
// GET /api/v1/embed-snippet
//
// Returns the canonical drop-in embed snippet for whichever experience the
// access token identifies. Non-default admin-configured widget settings
// (theme, primaryColor, launcher, placement) are baked directly into the
// init() call so what the customer pastes is what they get. Content-level
// fields (greeting, suggested questions) still stream in from
// /widget-config at runtime so admin copy edits propagate automatically.
//
// Snippet construction lives in `@/features/embed/build-snippet` so the
// admin UI's live preview and this endpoint stay identical byte-for-byte.
//
// Auth: X-Access-Token header OR Bearer token
// Query:
//   containerId  (optional) — DOM id the widget mounts into; defaults per widget type.

import { NextRequest, NextResponse } from 'next/server';
import { getAIExperienceByAccessToken } from '@/features/ai-experience/ai-experience.service';
import {
  getSearchExperienceByAccessToken,
  UnauthorizedError,
  ForbiddenError,
} from '@/features/search-experience/search-experience.service';
import {
  buildEmbedSnippet,
  DEFAULT_CONTAINER_ID,
  GLOBAL_NAME,
  type EmbedBrandingConfig,
  type Widget,
} from '@/features/embed/build-snippet';

const BUNDLE_PATH = '/embed/v1/widgets.js';

interface ResolvedExperience {
  widget: Widget;
  name: string;
  embedConfig: EmbedBrandingConfig;
}

function extractAccessToken(request: NextRequest): string {
  const authHeader = request.headers.get('Authorization') ?? '';
  if (authHeader.startsWith('Bearer ')) return authHeader.slice(7).trim();
  return (request.headers.get('X-Access-Token') ?? '').trim();
}

/** Prefer the public-facing origin if the app is behind a proxy/CDN. */
function resolveOrigin(request: NextRequest): string {
  const forwardedProto = request.headers.get('x-forwarded-proto');
  const forwardedHost = request.headers.get('x-forwarded-host');
  if (forwardedProto && forwardedHost) return `${forwardedProto}://${forwardedHost}`;
  return request.nextUrl.origin;
}

async function resolveExperience(accessToken: string): Promise<ResolvedExperience | null> {
  const ai = await getAIExperienceByAccessToken(accessToken);
  if (ai) {
    if (!ai.isActive) return null;
    const embed = (ai.accessConfig as { embedConfig?: EmbedBrandingConfig } | null)?.embedConfig ?? {};
    return { widget: 'chat', name: ai.name, embedConfig: embed };
  }

  try {
    const search = await getSearchExperienceByAccessToken(accessToken);
    // Search experiences don't carry an embedConfig today — snippet stays minimal.
    return { widget: 'search', name: search.name, embedConfig: {} };
  } catch (err) {
    if (err instanceof UnauthorizedError || err instanceof ForbiddenError) return null;
    throw err;
  }
}

export async function GET(request: NextRequest) {
  const accessToken = extractAccessToken(request);
  if (!accessToken) {
    return NextResponse.json({ error: 'Access token is required' }, { status: 401 });
  }

  const resolved = await resolveExperience(accessToken);
  if (!resolved) {
    return NextResponse.json(
      { error: 'Invalid or inactive access token' },
      { status: 401 },
    );
  }

  const { widget, name, embedConfig } = resolved;
  const containerId =
    (request.nextUrl.searchParams.get('containerId') ?? '').trim() ||
    DEFAULT_CONTAINER_ID[widget];

  const scriptUrl = `${resolveOrigin(request)}${BUNDLE_PATH}`;

  const html = buildEmbedSnippet({
    widget,
    scriptUrl,
    containerId,
    accessToken,
    experienceName: name,
    embedConfig,
  });

  return NextResponse.json(
    {
      success: true,
      data: {
        widget,
        experienceName: name,
        scriptUrl,
        containerId,
        globalName: GLOBAL_NAME[widget],
        appliedConfig: {
          theme: embedConfig.widgetTheme ?? null,
          primaryColor: embedConfig.primaryColor ?? null,
          launcher: embedConfig.launcher ?? null,
          placement: embedConfig.placement ?? null,
        },
        html,
      },
    },
    { headers: { 'Cache-Control': 'private, no-cache' } },
  );
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
