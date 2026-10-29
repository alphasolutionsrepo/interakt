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

import { publicOrigin } from '@/features/auth/public-access';
import { buildEmbedSnippet, DEFAULT_CONTAINER_ID, GLOBAL_NAME } from '@/features/embed/build-snippet';
import { authenticateEmbedRequest } from '@/features/embed/embed-access';
import { publicRoute } from '@/shared/api/public-route';

const BUNDLE_PATH = '/embed/v1/widgets.js';

async function get(request: NextRequest) {
  const auth = await authenticateEmbedRequest(request);
  if (auth.response) return auth.response;
  const { accessToken, widget, name, embedConfig } = auth.experience;
  const containerId =
    (request.nextUrl.searchParams.get('containerId') ?? '').trim() ||
    DEFAULT_CONTAINER_ID[widget];

  const scriptUrl = `${publicOrigin(request)}${BUNDLE_PATH}`;

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

export const GET = publicRoute(get);
