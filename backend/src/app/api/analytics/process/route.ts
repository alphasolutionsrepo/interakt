// app/api/analytics/process/route.ts

/**
 * Analytics Processing API
 *
 * POST - Trigger analytics processing pipeline
 * GET  - Get processing status (latest run info + staleness)
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  runAnalyticsProcessing,
  getProcessingStatus,
} from '@/features/analytics/analytics-processing.service';
import type { TimeRange } from '@/features/analytics/analytics-query.service';
import { createLogger } from '@/shared/logger/logger';

const logger = createLogger('api-analytics-process');

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Get experience IDs that have OTel span data (i.e. active experiences worth processing).
 */
async function getActiveExperienceIds(): Promise<string[]> {
  try {
    const { analyticsDB } = await import('@/db/index');
    if (!analyticsDB) return [];

    const { otelSpans } = await import('@/db/analytics-schema');
    const { sql } = await import('drizzle-orm');

    const rows = await analyticsDB
      .selectDistinct({ experienceId: otelSpans.experienceId })
      .from(otelSpans)
      .where(sql`${otelSpans.experienceId} IS NOT NULL`)
      .limit(50);

    return rows.map(r => r.experienceId).filter((id): id is string => id != null);
  } catch {
    return [];
  }
}

// ============================================================================
// POST — Trigger Processing
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const {
      experienceId,
      timeRanges,
      triggeredBy = 'admin',
    } = body as {
      experienceId?: string;
      timeRanges?: TimeRange[];
      triggeredBy?: string;
    };

    // Validate timeRanges if provided
    const validRanges: TimeRange[] = ['24h', '7d', '30d'];
    if (timeRanges) {
      for (const range of timeRanges) {
        if (!validRanges.includes(range as TimeRange)) {
          return NextResponse.json(
            { success: false, error: `Invalid timeRange: ${range}` },
            { status: 400 }
          );
        }
      }
    }

    // Check if already running
    const status = await getProcessingStatus(experienceId);
    if (status.currentRun) {
      return NextResponse.json(
        {
          success: false,
          error: 'Processing is already running',
          currentRun: status.currentRun,
        },
        { status: 409 }
      );
    }

    // Use streaming to keep connection alive during long processing
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        function emit(msg: Record<string, unknown>) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(msg)}\n\n`));
        }

        try {
          emit({ type: 'status', message: 'Processing started' });

          const resolvedRanges = (timeRanges as TimeRange[]) || validRanges;

          // Run global processing
          const result = await runAnalyticsProcessing({
            experienceId,
            timeRanges: resolvedRanges,
            triggeredBy,
          });

          // When processing globally (no experienceId), also process per-experience
          if (!experienceId) {
            const expIds = await getActiveExperienceIds();
            if (expIds.length > 0) {
              emit({ type: 'status', message: `Processing ${expIds.length} experience(s)...` });
              for (const expId of expIds) {
                try {
                  await runAnalyticsProcessing({
                    experienceId: expId,
                    timeRanges: resolvedRanges,
                    triggeredBy,
                  });
                } catch (err) {
                  logger.warn('Per-experience processing failed', { experienceId: expId, error: (err as Error).message });
                }
              }
            }
          }

          emit({ type: 'complete', result });
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          logger.error('Processing stream error', { error: errorMessage });
          emit({ type: 'error', error: errorMessage });
          controller.close();
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
    logger.error('Failed to start processing', { error });
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// ============================================================================
// GET — Processing Status
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    const experienceId =
      request.nextUrl.searchParams.get('experienceId') || undefined;

    const status = await getProcessingStatus(experienceId);

    return NextResponse.json({ success: true, data: status });
  } catch (error) {
    logger.error('Failed to get processing status', { error });
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
