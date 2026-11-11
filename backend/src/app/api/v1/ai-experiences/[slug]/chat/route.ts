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

import { getAIExperienceBySlug } from '@/features/ai-experience/ai-experience.service';
import { chatRequestSchema } from '@/features/ai-experience/ai-experience.validation';
import { aiExperienceAccess } from '@/features/auth/public-access';
import { authenticateTokenOrSession } from '@/features/auth/token-or-session';
import { chatEventStream } from '@/features/pipeline/chat-event-stream';
import { publicApiRoute } from '@/features/feature-switches/gate';
import { readJsonBody } from '@/shared/api/read-json-body';
import { apiResponse } from '@/shared/api/response';

async function post(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> },
) {
  // A login lookup or a query that fails is answered like any error, with the request id
  try {
    const { slug } = await context.params;

    // ── Parse & validate body ──────────────────────────────────────────────────
    const parsed = chatRequestSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return apiResponse.badRequest(parsed.error.errors[0]?.message ?? 'Invalid request body');
    }

    const { message, sessionId: clientSessionId } = parsed.data;

    // ── Load experience ────────────────────────────────────────────────────────
    const experience = await getAIExperienceBySlug(slug);
    if (!experience) {
      return apiResponse.notFound('AI Experience not found');
    }
    if (!experience.isActive) {
      return apiResponse.forbidden('AI Experience is not active');
    }

    // ── Authenticate ───────────────────────────────────────────────────────────
    // Access token (external/demo-site clients) or dashboard session (admin test panel)
    const { caller, refused, analyticsSource } = await authenticateTokenOrSession(request, aiExperienceAccess(experience));
    if (!caller) {
      return refused ?? apiResponse.unauthorized();
    }

    return chatEventStream({ experience, message, sessionId: clientSessionId || undefined, analyticsSource });
  } catch (error) {
    return apiResponse.error(error, 500, { operation: 'chatBySlug' });
  }
}

export async function OPTIONS() {
  // Blanket CORS response headers come from next.config.ts headers().
  // Explicit 204 here prevents Next.js returning 405 Method Not Allowed for preflights.
  return new NextResponse(null, { status: 204 });
}

export const POST = publicApiRoute(post);
