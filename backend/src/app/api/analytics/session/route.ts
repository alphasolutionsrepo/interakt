// app/api/analytics/session/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { withPermission } from '@/features/access/route-guard';
import {
  getOrCreateSession,
  endSession,
  generateSessionId,
  hashIP,
} from '@/features/analytics';
import type { SessionType } from '@/features/analytics';
import { clientIp } from '@/shared/api/client-ip';
import { readJsonBody } from '@/shared/api/read-json-body';
import { apiResponse } from '@/shared/api/response';

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
export const POST = withPermission('analytics:manage', async function POST(request: NextRequest) {
  try {
    const body = await readJsonBody(request);
    const data = createSessionSchema.parse(body);

    // Generate session ID if not provided
    const externalSessionId = data.sessionId || generateSessionId();

    // Get client info (privacy-respecting)
    const userAgent = request.headers.get('user-agent') || undefined;
    const ip = clientIp(request);
    const ipHash = ip === 'unknown' ? undefined : hashIP(ip);
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
    if (error instanceof z.ZodError) return apiResponse.validationError(error);
    return apiResponse.error(error, 500, { operation: 'startAnalyticsSession' });
  }
});

/**
 * DELETE /api/analytics/session
 * End an analytics session (called when user leaves)
 */
export const DELETE = withPermission('analytics:manage', async function DELETE(request: NextRequest) {
  try {
    const body = await readJsonBody(request);
    const data = endSessionSchema.parse(body);

    await endSession(data.sessionId);

    return NextResponse.json({
      success: true,
      message: 'Session ended',
    });
  } catch (error) {
    if (error instanceof z.ZodError) return apiResponse.validationError(error);
    return apiResponse.error(error, 500, { operation: 'endAnalyticsSession' });
  }
});

/**
 * GET /api/analytics/session
 * Generate a new session ID (for clients that don't have one)
 */
export const GET = withPermission('analytics:view', async function GET() {
  return NextResponse.json({
    success: true,
    data: {
      sessionId: generateSessionId(),
    },
  });
});
