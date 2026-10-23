// app/api/v1/ai-experiences/widget-config/route.ts
//
// GET /api/v1/ai-experiences/widget-config
//
// Returns public widget configuration for a given AI Experience.
// Used by frontend chat widgets to display the correct greeting,
// description, suggested questions, and branding before any message is sent.
//
// Auth: X-Access-Token header  OR  Bearer token

import { NextRequest, NextResponse } from 'next/server';

import { authenticateAIAccessToken } from '@/features/ai-experience/access-token.middleware';

export async function GET(request: NextRequest) {
  // ── Authenticate (token, allowed origins) ──────────────────────────────────
  // Every page with the widget loads this: a setup call, checked for allowed origins but not
  // counted towards any limit.
  const auth = await authenticateAIAccessToken(request, { setup: true });
  if (auth.response) return auth.response;
  const { experience } = auth;

  // ── Build public widget config ─────────────────────────────────────────────
  const embed = (experience.accessConfig as unknown as Record<string, unknown>)?.embedConfig as Record<string, unknown> | undefined;
  const persona = experience.personaConfig as unknown as Record<string, unknown> | undefined;

  // NOTE: styling fields (theme, primaryColor, placement, launcher, logoUrl,
  // etc.) are intentionally NOT returned here. They're baked into the embed
  // snippet at admin-save time via build-snippet.ts so the widget can render
  // with correct branding before any network call resolves. Only content
  // fields — which change more often than styling — are delivered at runtime.
  const data = {
    name: (persona?.name as string) || experience.name || 'AI Assistant',
    greeting: (embed?.welcomeMessage as string) || undefined,
    description: (embed?.welcomeDescription as string) || undefined,
    suggestedQuestions: (embed?.suggestedQuestions as string[]) || undefined,
    placeholder: (embed?.placeholder as string) || undefined,
    showBranding: embed?.showBranding !== false,
  };

  return NextResponse.json(
    { success: true, data },
    {
      headers: {
        'Cache-Control': 'private, no-cache',
      },
    },
  );
}

export async function OPTIONS() {
  // Blanket CORS response headers come from next.config.ts headers().
  // Explicit 204 here prevents Next.js returning 405 Method Not Allowed for preflights.
  return new NextResponse(null, { status: 204 });
}

