// app/api/v1/search/[slug]/summarize/route.ts

/**
 * AI Summary API Route (by slug)
 *
 * Generate AI-powered summaries from search results.
 * Supports both access token auth (X-Access-Token) and session auth (for playground).
 * The summary itself is the public summarize stream (createSummaryStream); this route
 * only adds session auth and the playground's trace switch.
 *
 * POST /api/v1/search/:slug/summarize
 */

import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { createLogger } from '@/shared/logger/logger';
import { authenticateTokenOrSession } from '@/features/auth/token-or-session';
import { runWithTelemetryLevel } from '@/features/telemetry';
import { createSummaryStream } from '@/features/chat/summary-stream';
import * as repository from '@/features/search-experience/search-experience.repository';
import { summarizeAPIRequestSchema } from '@/features/search-experience/search-experience.schemas';
import type { SummarizeAPIRequest } from '@/features/search-experience/search-experience.types';

const logger = createLogger('summarize-api-slug');

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  try {
    // 1. Get search experience by slug
    const baseExperience = await repository.getSearchExperienceBySlug(slug);

    if (!baseExperience) {
      return NextResponse.json(
        { success: false, error: 'Search experience not found', code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    if (!baseExperience.isActive) {
      return NextResponse.json(
        { success: false, error: 'Search experience is not active', code: 'INACTIVE' },
        { status: 403 }
      );
    }

    // Get experience with indexes for AI config
    const experience = await repository.getSearchExperienceWithIndexes(baseExperience.id);
    if (!experience) {
      return NextResponse.json(
        { success: false, error: 'Search experience not found', code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    // 2. Check if AI summary is enabled
    if (!experience.aiConfig.enabled || !experience.aiConfig.summary.enabled) {
      return NextResponse.json(
        { success: false, error: 'AI summarization is not enabled for this search experience', code: 'AI_UNAVAILABLE' },
        { status: 403 }
      );
    }

    // 3. Authenticate: the experience's access token, or an admin session. Admin
    //    summaries are not traced unless the request asks for it (then in full).
    const caller = await authenticateTokenOrSession(request, experience.accessToken);
    if (!caller) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized', code: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }
    const isAdmin = caller === 'admin';

    // 4. Parse and validate request
    const body = await request.json();
    const validated = summarizeAPIRequestSchema.parse(body);
    const trace = (body as { trace?: unknown })?.trace === true;

    // 5. Same summary stream as the public summarize API
    const createStream = () => createSummaryStream(experience, validated as SummarizeAPIRequest);

    const stream = isAdmin
      ? runWithTelemetryLevel(trace ? 'full' : 'off', createStream)
      : createStream();

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { success: false, error: 'Invalid request', code: 'VALIDATION_ERROR' },
        { status: 400 }
      );
    }

    logger.error('Summarize error', {
      slug,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return NextResponse.json(
      { success: false, error: 'An unexpected error occurred', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
