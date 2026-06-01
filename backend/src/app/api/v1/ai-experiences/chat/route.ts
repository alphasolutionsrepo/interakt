// app/api/v1/ai-experiences/chat/route.ts
//
// POST /api/v1/ai-experiences/chat
//
// Token-only public chat endpoint for AI Experiences.
// The access token uniquely identifies the experience — no slug needed.
//
// Auth: X-Access-Token header  OR  Bearer token  OR  dashboard session
//
// Request body:
//   { message: string, sessionId?: string }
//
// Response: text/event-stream (SSE)

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/features/auth/auth.api.handlers';
import { getAIExperienceByAccessToken } from '@/features/ai-experience/ai-experience.service';
import { runChatPipeline } from '@/features/pipeline/chat-pipeline';
import { flushTelemetry } from '@/features/telemetry';
import type { PipelineStreamEvent } from '@/features/pipeline/pipeline.types';

export async function POST(request: NextRequest) {
  // ── Extract access token ───────────────────────────────────────────────────
  const authHeader = request.headers.get('Authorization') ?? '';
  const accessToken = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : (request.headers.get('X-Access-Token') ?? '').trim();

  if (!accessToken) {
    // Fall back to dashboard session auth
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Access token is required' }, { status: 401 });
    }
    // Dashboard users need to use the slug-based endpoint
    return NextResponse.json(
      { error: 'Dashboard session auth requires the slug-based endpoint: /api/v1/ai-experiences/{slug}/chat' },
      { status: 400 },
    );
  }

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

  // ── Resolve experience from token (cached) ────────────────────────────────
  const experience = await getAIExperienceByAccessToken(accessToken);
  if (!experience) {
    return NextResponse.json({ error: 'Invalid access token' }, { status: 401 });
  }
  if (!experience.isActive) {
    return NextResponse.json({ error: 'AI Experience is not active' }, { status: 403 });
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
        // Flush telemetry spans before closing — in serverless environments (Vercel)
        // the runtime freezes after the response, so the BatchSpanProcessor's background
        // timer never fires and spans are lost without an explicit flush.
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
      'X-Accel-Buffering': 'no',
    },
  });
}
