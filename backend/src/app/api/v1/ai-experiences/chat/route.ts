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

import { authenticateAIAccessToken } from '@/features/ai-experience/access-token.middleware';
import { chatRequestSchema } from '@/features/ai-experience/ai-experience.validation';
import { auth } from '@/features/auth/auth.api.handlers';
import { readAccessToken } from '@/features/auth/public-access';
import { analyticsSourceOfTokenCaller } from '@/features/auth/token-or-session';
import { runChatPipeline } from '@/features/pipeline/chat-pipeline';
import type { PipelineStreamEvent } from '@/features/pipeline/pipeline.types';
import { flushTelemetry } from '@/features/telemetry';
import { publicRoute } from '@/shared/api/public-route';

async function post(request: NextRequest) {
  // ── No access token: a dashboard session is pointed at the slug route ──────
  if (!readAccessToken(request)) {
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

  // ── Parse & validate body ──────────────────────────────────────────────────
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = chatRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? 'Invalid request body' },
      { status: 400 },
    );
  }

  const { message, sessionId: clientSessionId } = parsed.data;

  // ── Resolve experience from token; allowed origins and rate limits ────────
  const authResult = await authenticateAIAccessToken(request);
  if (authResult.response) return authResult.response;
  const { experience } = authResult;
  const analyticsSource = await analyticsSourceOfTokenCaller(request);

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

export const POST = publicRoute(post);
