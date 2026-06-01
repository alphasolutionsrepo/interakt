// src/features/chat/chat.api.handlers.ts

/**
 * Chat API Handlers
 *
 * Handlers for AI-powered features:
 * - Summary generation from search results
 */

import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { createLogger } from '@/shared/logger/logger';
import * as aiService from '@/features/ai-service/ai-service.service';
import type { ChatMessage } from '@/features/ai-service/ai-service.types';
import { flushTelemetry } from '@/features/telemetry';
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
  ChatStreamEvent,
  DocumentReference,
} from '@/features/search-experience/search-experience.types';
import { buildSummarySystemPrompt } from '@/features/chat/prompt-builder';
import {
  truncateText,
} from '@/features/chat/chat.utils';

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

    const summaryConfig = experience.aiConfig.summary;

    // Build the system prompt using prompt builder (Core + Domain + Custom)
    const systemPrompt = buildSummarySystemPrompt({ experience });

    // Build the user prompt with search results
    // Cast validated.results to the expected type - Zod ensures these are present
    const resultsForPrompt = validated.results as Array<{
      id: string;
      index: { id: string; name: string };
      fields: Record<string, unknown>;
    }>;
    const userPrompt = buildSummaryUserPrompt(
      validated.query,
      resultsForPrompt,
      validated.totalResults,
      validated.instruction
    );

    // Build messages for AI
    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    // Create streaming response
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const maxTokens = summaryConfig.maxTokens ?? 500;
          logger.info('Starting summary generation', {
            experienceId: experience.id,
            providerId: experience.aiConfig.providerId,
            modelId: experience.aiConfig.modelId,
            configuredMaxTokens: summaryConfig.maxTokens,
            effectiveMaxTokens: maxTokens,
          });

          const generator = aiService.streamChat(messages, {
            providerId: experience.aiConfig.providerId ?? undefined,
            modelId: experience.aiConfig.modelId ?? undefined,
            maxTokens,
            temperature: 0.3, // Lower temperature for summaries
            feature: 'search_experience_summary',
          });

          const sources: DocumentReference[] = validated.results.slice(0, 5).map((r) => ({
            id: r.id,
            indexId: r.index.id,
            indexName: r.index.name,
            title: r.fields.title as string | undefined,
          }));

          // Send sources event first
          const sourcesEvent: ChatStreamEvent = {
            type: 'sources',
            sources,
          };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(sourcesEvent)}\n\n`));

          let totalContent = '';

          for await (const chunk of generator) {
            if (chunk.content) {
              totalContent += chunk.content;
              const contentEvent: ChatStreamEvent = {
                type: 'content',
                text: chunk.content,
              };
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(contentEvent)}\n\n`));
            }

            if (chunk.done && chunk.usage) {
              const doneEvent: ChatStreamEvent = {
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
          await flushTelemetry();
          controller.close();

          logger.info('Summary generated', {
            experienceId: experience.id,
            query: validated.query.substring(0, 50),
            resultCount: validated.results.length,
          });
        } catch (error) {
          logger.error('Summary generation failed', {
            experienceId: experience.id,
            error: error instanceof Error ? error.message : 'Unknown error',
          });

          const errorEvent: ChatStreamEvent = {
            type: 'error',
            error: error instanceof Error ? error.message : 'Failed to generate summary',
            code: 'AI_ERROR',
          };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorEvent)}\n\n`));
          await flushTelemetry();
          controller.close();
        }
      },
    });

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
 * Build user prompt for summary generation
 */
function buildSummaryUserPrompt(
  query: string,
  results: Array<{ id: string; index: { id: string; name: string }; fields: Record<string, unknown> }>,
  totalResults?: number,
  instruction?: string
): string {
  const resultsText = results
    .map((r, i) => {
      const title = r.fields.title || r.fields.name || `Item ${i + 1}`;
      const content = r.fields.content || r.fields.description || r.fields.body || '';
      return `[${i + 1}] ${title}\n${truncateText(String(content), 500)}`;
    })
    .join('\n\n---\n\n');

  let prompt = `Search query: "${query}"

${totalResults ? `Total results found: ${totalResults}` : ''}
Showing top ${results.length} results:

${resultsText}`;

  if (instruction) {
    prompt += `\n\nAdditional instruction: ${instruction}`;
  }

  prompt += '\n\nPlease provide a helpful summary of these search results.';

  return prompt;
}

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
