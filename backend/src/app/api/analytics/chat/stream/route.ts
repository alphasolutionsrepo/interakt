// app/api/analytics/chat/stream/route.ts

/**
 * Analytics Chat Streaming API
 *
 * Uses the deterministic analytics pipeline:
 * S2 (Context) → D1 (Plan) → D2 (Execute) → D3 (Synthesize) → D4 (Persist)
 *
 * Total: 2 AI calls per request (planner + synthesis).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createLogger } from '@/shared/logger/logger';
import { runAnalyticsPipeline } from '@/features/analytics/pipeline/analytics-pipeline-orchestrator';

const logger = createLogger('analytics-chat-stream-api');

// ============================================================================
// SCHEMA
// ============================================================================

const chatRequestSchema = z.object({
  message: z.string().min(1).max(1000),
  sessionId: z.string().uuid().nullish().transform((v) => v ?? undefined),
  providerId: z.string().nullish().transform((v) => v ?? undefined),
  modelId: z.number().nullish().transform((v) => v ?? undefined),
  experienceId: z.string().uuid().nullish().transform((v) => v ?? undefined),
});

// ============================================================================
// HANDLER
// ============================================================================

export async function POST(request: NextRequest) {
  const encoder = new TextEncoder();

  try {
    const body = await request.json();
    const parsed = chatRequestSchema.parse(body);

    // Create SSE stream
    const stream = new ReadableStream({
      async start(controller) {
        const emit = (data: Record<string, unknown>) => {
          try {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
            );
          } catch {
            // Stream may be closed
          }
        };

        try {
          await runAnalyticsPipeline(
            {
              message: parsed.message,
              sessionId: parsed.sessionId,
              experienceId: parsed.experienceId,
              providerId: parsed.providerId,
              modelId: parsed.modelId,
            },
            emit
          );
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : 'Unknown error';
          logger.error('Pipeline error', { error: errorMessage });
          emit({ type: 'error', error: errorMessage });
          emit({ type: 'done', sessionId: parsed.sessionId || '', usage: {}, toolsUsed: [] });
        }

        // Close stream
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      },
    });

    return new NextResponse(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    logger.error('Request parsing failed', { error });

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Invalid request', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
