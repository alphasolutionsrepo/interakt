// app/api/v1/ai-experiences/[slug]/chat/route.ts
//
// POST /api/v1/ai-experiences/{slug}/chat
//
// Public chat endpoint for AI Experiences.
// Auth: Bearer {accessToken}  OR  logged-in dashboard session (NextAuth).
//
// Request body:
//   { message: string, sessionId?: string }
//
// Response: text/event-stream (SSE)
//   data: {"type":"content","content":"..."}
//   data: {"type":"tool_call","id":"...","name":"...","input":{...}}
//   data: {"type":"tool_result","id":"...","name":"...","success":true,"durationMs":340}
//   data: {"type":"done","sessionId":"...","usage":{...}}
//   data: {"type":"error","message":"..."}

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/features/auth/auth.api.handlers';
import { getAIExperienceBySlug } from '@/features/ai-experience/ai-experience.service';
import { runChatPipeline } from '@/features/pipeline/chat-pipeline';
import { flushTelemetry } from '@/features/telemetry';
import type { PipelineStreamEvent } from '@/features/pipeline/pipeline.types';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;

  // ── Parse body ─────────────────────────────────────────────────────────────
  let body: { message?: unknown; sessionId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const message =
    typeof body.message === 'string' ? body.message.trim() : '';
  if (!message) {
    return NextResponse.json(
      { error: '"message" is required and must be a non-empty string' },
      { status: 400 },
    );
  }

  const clientSessionId =
    typeof body.sessionId === 'string' ? body.sessionId.trim() : '';

  // ── Load experience ────────────────────────────────────────────────────────
  const experience = await getAIExperienceBySlug(slug);
  if (!experience) {
    return NextResponse.json({ error: 'AI Experience not found' }, { status: 404 });
  }
  if (!experience.isActive) {
    return NextResponse.json({ error: 'AI Experience is not active' }, { status: 403 });
  }

  // ── Authenticate ───────────────────────────────────────────────────────────
  let isAuthenticated = false;
  let analyticsSource: 'api' | 'admin_test' = 'api';

  // 1. Bearer access token (for external/demo-site clients)
  const authHeader = request.headers.get('Authorization') ?? '';
  const bearerToken = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : (request.headers.get('X-Access-Token') ?? '').trim();

  if (bearerToken && bearerToken === experience.accessToken) {
    isAuthenticated = true;
    analyticsSource = 'api';
  }

  // 2. Dashboard session (for admin test panel)
  if (!isAuthenticated) {
    const session = await auth();
    if (session?.user) {
      isAuthenticated = true;
      analyticsSource = 'admin_test';
    }
  }

  if (!isAuthenticated) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ── Stream pipeline ────────────────────────────────────────────────────────
  const encoder = new TextEncoder();

  function sseEvent(event: PipelineStreamEvent): Uint8Array {
    return encoder.encode(`data: ${JSON.stringify(event)}\n\n`);
  }

  const stream = new ReadableStream({
    async start(controller) {
      try {
        await runChatPipeline({
          experience,
          message,
          sessionId: clientSessionId || undefined,
          analyticsSource,
          onEvent: (event) => controller.enqueue(sseEvent(event)),
        });
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Unexpected error';
        try {
          controller.enqueue(
            sseEvent({ type: 'error', message: errorMessage }),
          );
        } catch {
          // Controller may already be closed
        }
      } finally {
        await flushTelemetry();
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable Nginx buffering for SSE
    },
  });
}

export async function OPTIONS() {
  // Blanket CORS response headers come from next.config.ts headers().
  // Explicit 204 here prevents Next.js returning 405 Method Not Allowed for preflights.
  return new NextResponse(null, { status: 204 });
}
