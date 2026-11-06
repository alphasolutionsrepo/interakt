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

import { NextRequest } from 'next/server';

import { authenticateAIAccessToken } from '@/features/ai-experience/access-token.middleware';
import { chatRequestSchema } from '@/features/ai-experience/ai-experience.validation';
import { auth } from '@/features/auth/auth.api.handlers';
import { readAccessToken } from '@/features/auth/public-access';
import { analyticsSourceOfTokenCaller } from '@/features/auth/token-or-session';
import { chatEventStream } from '@/features/pipeline/chat-event-stream';
import { publicRoute } from '@/shared/api/public-route';
import { readJsonBody } from '@/shared/api/read-json-body';
import { apiResponse } from '@/shared/api/response';

async function post(request: NextRequest) {
  // A login lookup or a query that fails is answered like any error, with the request id
  try {
    // ── No access token: a dashboard session is pointed at the slug route ──────
    if (!readAccessToken(request)) {
      // Fall back to dashboard session auth
      const session = await auth();
      if (!session?.user) {
        return apiResponse.unauthorized('Access token is required');
      }
      // Dashboard users need to use the slug-based endpoint
      return apiResponse.badRequest('Dashboard session auth requires the slug-based endpoint: /api/v1/ai-experiences/{slug}/chat');
    }

    // ── Parse & validate body ──────────────────────────────────────────────────
    const parsed = chatRequestSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return apiResponse.badRequest(parsed.error.errors[0]?.message ?? 'Invalid request body');
    }

    const { message, sessionId: clientSessionId } = parsed.data;

    // ── Resolve experience from token; allowed origins and rate limits ────────
    const authResult = await authenticateAIAccessToken(request);
    if (authResult.response) return authResult.response;
    const { experience } = authResult;
    const analyticsSource = await analyticsSourceOfTokenCaller(request);

    return chatEventStream({ experience, message, sessionId: clientSessionId || undefined, analyticsSource });
  } catch (error) {
    return apiResponse.error(error, 500, { operation: 'chatByToken' });
  }
}

export const POST = publicRoute(post);
