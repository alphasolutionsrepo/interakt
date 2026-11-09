// src/features/chat/chat.api.handlers.ts

/**
 * Chat API Handlers
 *
 * Handlers for AI-powered features:
 * - Summary generation from search results
 */

import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';

import { apiResponse } from '@/shared/api/response';
import { readJsonBody } from '@/shared/api/read-json-body';
import { AppError } from '@/shared/errors/app-error';
import { withAnalyticsSource } from '@/features/analytics/analytics-source-context';
import { analyticsSourceOfTokenCaller } from '@/features/auth/token-or-session';
import { createCorsHeaders, openPublicRequest, withCors } from '@/features/search-experience/access-token.middleware';
import {
  summarizeAPIRequestSchema,
} from '@/features/search-experience/search-experience.schemas';
import type {
  SearchExperienceWithIndexes,
  SummarizeAPIRequest,
} from '@/features/search-experience/search-experience.types';
import { createSummaryStream } from './summary-stream';

// ============================================================================
// AI SUMMARY HANDLER
// ============================================================================

/**
 * Generate AI summary from search results
 * POST /api/v1/summarize
 *
 * Returns a streaming response with the AI-generated summary.
 */
export async function handleSummarize(request: NextRequest): Promise<Response> {
  // CORS preflight, or the access token's experience
  const opened = await openPublicRequest(request);
  if ('response' in opened) return opened.response;
  const { experience, origin } = opened;

  // Check if AI is enabled
  if (!experience.aiConfig.enabled || !experience.aiConfig.summary.enabled) {
    return withCors(
      apiResponse.error(new AppError('AI summarization is not enabled for this search experience', { code: 'AI_UNAVAILABLE', status: 403 }), undefined, { operation: 'summarize', experienceId: experience.id }),
      experience,
      origin
    );
  }

  try {
    const body = await readJsonBody(request);
    const validated = summarizeAPIRequestSchema.parse(body);

    // The summary's model call records where it came from (the stream starts inside this;
    // the admin's own Widget playground is test traffic)
    const source = await analyticsSourceOfTokenCaller(request);
    const stream = withAnalyticsSource(source, () => createSummaryStream(experience, validated as SummarizeAPIRequest));

    const corsHeaders = createCorsHeaders(experience, origin);
    return new Response(stream, {
      headers: {
        ...Object.fromEntries(corsHeaders.entries()),
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    return handleAIError(error, experience, origin);
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Handle AI-related errors: the shared error shape with a request id and the
 * experience's CORS headers. Visitors get a plain message on server failures.
 * apiResponse.error logs the failure, once.
 */
function handleAIError(
  error: unknown,
  experience: SearchExperienceWithIndexes,
  origin: string | null
): NextResponse {
  if (error instanceof ZodError) return withCors(apiResponse.validationError(error), experience, origin);
  return withCors(apiResponse.error(error, undefined, { experienceId: experience.id, operation: 'summarize' }), experience, origin);
}
