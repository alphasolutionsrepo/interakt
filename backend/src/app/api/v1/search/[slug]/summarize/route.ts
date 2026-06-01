// app/api/v1/search/[slug]/summarize/route.ts

/**
 * AI Summary API Route (by slug)
 *
 * Generate AI-powered summaries from search results.
 * Supports both access token auth (X-Access-Token) and session auth (for playground).
 *
 * POST /api/v1/search/:slug/summarize
 */

import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { createLogger } from '@/shared/logger/logger';
import { auth } from '@/features/auth/auth.api.handlers';
import * as aiService from '@/features/ai-service/ai-service.service';
import type { ChatMessage } from '@/features/ai-service/ai-service.types';
import * as repository from '@/features/search-experience/search-experience.repository';
import { summarizeAPIRequestSchema } from '@/features/search-experience/search-experience.schemas';
import { buildSummarySystemPrompt } from '@/features/chat/prompt-builder';

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

    // 3. Check authentication
    const accessToken = request.headers.get('Authorization')?.replace('Bearer ', '') ||
                        request.headers.get('X-Access-Token');

    let isAuthenticated = false;

    if (accessToken && accessToken === experience.accessToken) {
      isAuthenticated = true;
    }

    if (!isAuthenticated) {
      const session = await auth();
      if (session?.user) {
        isAuthenticated = true;
      }
    }

    if (!isAuthenticated) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized', code: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    // 4. Parse and validate request
    const body = await request.json();
    const validated = summarizeAPIRequestSchema.parse(body);

    // 5. Build prompts
    const summaryConfig = experience.aiConfig.summary;
    const systemPrompt = buildSummarySystemPrompt({ experience });

    // Limit results to maxResultsForContext to control token usage
    const maxResults = summaryConfig.maxResultsForContext ?? 10;
    const limitedResults = validated.results.slice(0, maxResults) as Array<{ id: string; index: { id: string; name: string }; fields: Record<string, unknown> }>;

    const userPrompt = buildSummaryUserPromptLocal(
      validated.query,
      limitedResults,
      validated.totalResults,
      validated.instruction
    );

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    // 6. Create streaming response
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const generator = aiService.streamChat(messages, {
            providerId: experience.aiConfig.providerId ?? undefined,
            modelId: experience.aiConfig.modelId ?? undefined,
            maxTokens: summaryConfig.maxTokens ?? 500,
            temperature: 0.3,
            feature: 'search_experience_summary',
          });

          for await (const chunk of generator) {
            if (chunk.content) {
              const event = { type: 'content', content: chunk.content };
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
            }

            if (chunk.done && chunk.usage) {
              const doneEvent = {
                type: 'done',
                usage: {
                  promptTokens: chunk.usage.inputTokens,
                  completionTokens: chunk.usage.outputTokens,
                  totalTokens: chunk.usage.totalTokens,
                },
                messageId: uuidv4(),
              };
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(doneEvent)}\n\n`));
            }
          }

          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();

          logger.info('Summary generated via slug', {
            slug,
            query: validated.query.substring(0, 50),
            resultCount: limitedResults.length,
            totalProvided: validated.results.length,
          });
        } catch (error) {
          logger.error('Summary generation failed', {
            slug,
            error: error instanceof Error ? error.message : 'Unknown error',
          });

          const errorEvent = {
            type: 'error',
            error: error instanceof Error ? error.message : 'Failed to generate summary',
          };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorEvent)}\n\n`));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
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

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function buildSummaryUserPromptLocal(
  query: string,
  results: Array<{ id: string; index: { id: string; name: string }; fields: Record<string, unknown> }>,
  _totalResults?: number,
  instruction?: string
): string {
  // Build context from ALL fields marked as includeInResponse (already filtered by search service)
  const knowledgeContext = results
    .map((r) => formatFieldsForContext(r.fields))
    .filter(Boolean)
    .join('\n\n---\n\n');

  let prompt = `<context>\n${knowledgeContext}\n</context>\n\nUser question: ${query}`;

  if (instruction) {
    prompt += `\n\n${instruction}`;
  }

  return prompt;
}

/**
 * Format all fields from a result into a readable context string.
 * Uses all fields that were marked as includeInResponse in the data template.
 */
function formatFieldsForContext(fields: Record<string, unknown>): string {
  const parts: string[] = [];

  for (const [key, value] of Object.entries(fields)) {
    // Skip internal/meta fields
    if (key.startsWith('_')) continue;
    if (value === null || value === undefined || value === '') continue;

    // Format the value
    let formattedValue: string;
    if (Array.isArray(value)) {
      formattedValue = value.join(', ');
    } else if (typeof value === 'object') {
      formattedValue = JSON.stringify(value);
    } else {
      formattedValue = String(value);
    }

    // Truncate very long values
    if (formattedValue.length > 500) {
      formattedValue = formattedValue.substring(0, 500) + '...';
    }

    // Use readable field name (convert camelCase/snake_case to Title Case)
    const readableKey = key
      .replace(/([A-Z])/g, ' $1')
      .replace(/_/g, ' ')
      .replace(/^\w/, (c) => c.toUpperCase())
      .trim();

    parts.push(`${readableKey}: ${formattedValue}`);
  }

  return parts.join('\n');
}
