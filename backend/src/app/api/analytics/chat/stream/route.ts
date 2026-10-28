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
import { isValidTimeZone } from '@/features/analytics/analytics-period';

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
  experienceName: z.string().max(200).nullish().transform((v) => v ?? undefined),
  timeRange: z.enum(['1h', '24h', '7d', '30d', '90d']).nullish().transform((v) => v ?? undefined),
  /** The page's exact period; answers default to it */
  period: z
    .object({ from: z.string().datetime(), to: z.string().datetime() })
    .refine((p) => new Date(p.from) < new Date(p.to), 'period.from must be before period.to')
    .refine((p) => new Date(p.to).getTime() - new Date(p.from).getTime() <= 400 * 86_400_000, 'period can cover at most 400 days')
    .nullish()
    .transform((v) => v ?? undefined),
  /** The viewer's IANA time zone: what "today" and "Oct 13" mean */
  timeZone: z
    .string()
    .refine(isValidTimeZone, 'Unknown time zone')
    .nullish()
    .transform((v) => v ?? undefined),
  /** The analytics section the question was asked from */
  pageSection: z.string().max(40).nullish().transform((v) => v ?? undefined),
});

// ============================================================================
// HANDLER
// ============================================================================

export async function POST(request: NextRequest) {
  const encoder = new TextEncoder();

  try {
    const body = await request.json();
    const parsed = chatRequestSchema.parse(body);

    // Stop in the browser closes the connection; stop the turn with it, so it spends no more tokens and isn't saved
    const turn = new AbortController();
    request.signal.addEventListener('abort', () => turn.abort(), { once: true });

    // Create SSE stream
    const stream = new ReadableStream({
      cancel() {
        turn.abort();
      },
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
              experienceName: parsed.experienceName,
              timeRange: parsed.timeRange,
              // The schema checks both instants; its inferred type loses that they're required
              period: parsed.period as { from: string; to: string } | undefined,
              timeZone: parsed.timeZone,
              pageSection: parsed.pageSection,
              providerId: parsed.providerId,
              modelId: parsed.modelId,
              signal: turn.signal,
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

        // Close stream (already closed if the asker went away)
        try {
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch {
          // Stream was cancelled
        }
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
