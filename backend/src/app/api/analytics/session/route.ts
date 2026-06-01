// app/api/analytics/session/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  getOrCreateSession,
  endSession,
  generateSessionId,
  hashIP,
} from '@/features/analytics';
import type { SessionType } from '@/features/analytics';

// ============================================================================
// SCHEMAS
// ============================================================================

const createSessionSchema = z.object({
  sessionId: z.string().optional(), // Optional - we'll generate if not provided
  experienceId: z.string().uuid().optional(),
  experienceSlug: z.string().optional(),
  sessionType: z.enum(['search_only', 'chat', 'mixed']).default('search_only'),
});

const endSessionSchema = z.object({
  sessionId: z.string(),
});

// ============================================================================
// HANDLERS
// ============================================================================

/**
 * POST /api/analytics/session
 * Create or get an analytics session
 * Returns the session ID for the client to use in subsequent requests
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const data = createSessionSchema.parse(body);

    // Generate session ID if not provided
    const externalSessionId = data.sessionId || generateSessionId();

    // Get client info (privacy-respecting)
    const userAgent = request.headers.get('user-agent') || undefined;
    const forwardedFor = request.headers.get('x-forwarded-for');
    const realIp = request.headers.get('x-real-ip');
    const ip = forwardedFor?.split(',')[0]?.trim() || realIp || undefined;
    const ipHash = ip ? hashIP(ip) : undefined;
    const origin = request.headers.get('origin') || undefined;

    // Create or get session
    const sessionId = await getOrCreateSession({
      externalSessionId,
      experienceId: data.experienceId,
      experienceSlug: data.experienceSlug,
      sessionType: data.sessionType as SessionType,
      originDomain: origin ? new URL(origin).hostname : undefined,
      userAgent,
      ipHash,
    });

    return NextResponse.json({
      success: true,
      data: {
        sessionId: externalSessionId,
        internalSessionId: sessionId,
        tracked: sessionId !== null,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: `Invalid request: ${error.message}` },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, error: 'Failed to create session' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/analytics/session
 * End an analytics session (called when user leaves)
 */
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const data = endSessionSchema.parse(body);

    await endSession(data.sessionId);

    return NextResponse.json({
      success: true,
      message: 'Session ended',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: `Invalid request: ${error.message}` },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, error: 'Failed to end session' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/analytics/session
 * Generate a new session ID (for clients that don't have one)
 */
export async function GET() {
  return NextResponse.json({
    success: true,
    data: {
      sessionId: generateSessionId(),
    },
  });
}
