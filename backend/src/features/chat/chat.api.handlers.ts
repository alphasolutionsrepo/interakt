// src/features/chat/chat.api.handlers.ts

/**
 * Chat API Handlers
 *
 * Handlers for AI-powered features:
 * - Summary generation from search results
 */

import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/shared/logger/logger';
import {
  authenticateAccessToken,
  createCorsHeaders,
  handleCorsPreflight,
} from '@/features/search-experience/access-token.middleware';
import {
  summarizeAPIRequestSchema,
} from '@/features/search-experience/search-experience.schemas';
import type {
  SearchExperienceWithIndexes,
  SummarizeAPIRequest,
} from '@/features/search-experience/search-experience.types';
import { createSummaryStream } from './summary-stream';

const logger = createLogger('search-experience-ai');

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
  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return handleCorsPreflight();
  }

  // Authenticate using access token
  const authResult = await authenticateAccessToken(request);
  if (!authResult.success) {
    return (authResult as { success: false; response: NextResponse }).response;
  }

  const { experience } = authResult as { success: true; experience: SearchExperienceWithIndexes };
  const origin = request.headers.get('origin');

  // Check if AI is enabled
  if (!experience.aiConfig.enabled || !experience.aiConfig.summary.enabled) {
    return createErrorResponse(
      'AI summarization is not enabled for this search experience',
      'AI_UNAVAILABLE',
      403,
      experience,
      origin
    );
  }

  try {
    const body = await request.json();
    const validated = summarizeAPIRequestSchema.parse(body);

    const stream = createSummaryStream(experience, validated as SummarizeAPIRequest);

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
 * Handle AI-related errors
 */
function handleAIError(
  error: unknown,
  experience: SearchExperienceWithIndexes,
  origin: string | null
): NextResponse {
  logger.error('AI error', {
    experienceId: experience.id,
    error: error instanceof Error ? error.message : 'Unknown error',
  });

  if (error instanceof Error && error.name === 'ZodError') {
    return createErrorResponse(
      'Invalid request',
      'VALIDATION_ERROR',
      400,
      experience,
      origin,
      (error as unknown as { errors: unknown[] }).errors
    );
  }

  return createErrorResponse(
    error instanceof Error ? error.message : 'An error occurred',
    'AI_ERROR',
    500,
    experience,
    origin
  );
}

/**
 * Create error response with CORS headers
 */
function createErrorResponse(
  message: string,
  code: string,
  status: number,
  experience: SearchExperienceWithIndexes,
  origin: string | null,
  details?: unknown
): NextResponse {
  const corsHeaders = createCorsHeaders(experience, origin);

  return NextResponse.json(
    {
      success: false,
      error: message,
      code,
      details,
    },
    {
      status,
      headers: corsHeaders,
    }
  );
}
