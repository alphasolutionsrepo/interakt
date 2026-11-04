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

import { NextRequest } from 'next/server';

import { apiResponse } from '@/shared/api/response';
import { AppError } from '@/shared/errors/app-error';
import { ZodError } from 'zod';
import { searchExperienceAccess } from '@/features/auth/public-access';
import { withAnalyticsSource } from '@/features/analytics/analytics-source-context';
import { authenticateTokenOrSession } from '@/features/auth/token-or-session';
import { runWithTelemetryLevel } from '@/features/telemetry';
import { createSummaryStream } from '@/features/chat/summary-stream';
import * as repository from '@/features/search-experience/search-experience.repository';
import { summarizeAPIRequestSchema } from '@/features/search-experience/search-experience.schemas';
import type { SummarizeAPIRequest } from '@/features/search-experience/search-experience.types';
import { publicRoute } from '@/shared/api/public-route';

async function post(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  try {
    // 1. Get search experience by slug
    const baseExperience = await repository.getSearchExperienceBySlug(slug);

    if (!baseExperience) {
      return apiResponse.notFound('Search experience not found');
    }

    if (!baseExperience.isActive) {
      return apiResponse.error(new AppError('Search experience is not active', { code: 'INACTIVE', status: 403 }));
    }

    // Get experience with indexes for AI config
    const experience = await repository.getSearchExperienceWithIndexes(baseExperience.id);
    if (!experience) {
      return apiResponse.notFound('Search experience not found');
    }

    // 2. Check if AI summary is enabled
    if (!experience.aiConfig.enabled || !experience.aiConfig.summary.enabled) {
      return apiResponse.error(new AppError('AI summarization is not enabled for this search experience', { code: 'AI_UNAVAILABLE', status: 403 }));
    }

    // 3. Authenticate: the experience's access token, or an admin session. Admin
    //    summaries are not traced unless the request asks for it (then in full).
    const { caller, refused, analyticsSource } = await authenticateTokenOrSession(request, searchExperienceAccess(experience));
    if (!caller) {
      return refused ?? apiResponse.unauthorized('Unauthorized');
    }
    const isAdmin = caller === 'admin';

    // 4. Parse and validate request
    const body = await request.json();
    const validated = summarizeAPIRequestSchema.parse(body);
    const trace = (body as { trace?: unknown })?.trace === true;

    // 5. Same summary stream as the public summarize API
    // The summary's model call records where it came from (the stream starts inside this)
    const createStream = () => withAnalyticsSource(analyticsSource, () => createSummaryStream(experience, validated as SummarizeAPIRequest));

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
    if (error instanceof ZodError) return apiResponse.validationError(error);
    return apiResponse.error(error, undefined, { slug, operation: 'summarize' });
  }
}

export const POST = publicRoute(post);
