// app/api/analytics/chat/sessions/route.ts

/**
 * Analytics Chat Sessions API
 *
 * GET  - List all sessions (with pagination)
 * POST - Create a new session
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createLogger } from '@/shared/logger/logger';
import {
  listAdminChatSessions,
  createAdminChatSession,
  getAdminChatSessionCount,
} from '@/features/analytics';

const logger = createLogger('analytics-chat-sessions-api');

// ============================================================================
// SCHEMAS
// ============================================================================

const listQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
});

const createBodySchema = z.object({
  title: z.string().min(1).max(255).optional(),
  providerId: z.string().optional(),
  modelId: z.number().optional(),
});

// ============================================================================
// GET - List Sessions
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = listQuerySchema.parse({
      limit: searchParams.get('limit'),
      offset: searchParams.get('offset'),
    });

    const [sessions, totalCount] = await Promise.all([
      listAdminChatSessions(query),
      getAdminChatSessionCount(),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        sessions,
        pagination: {
          limit: query.limit,
          offset: query.offset,
          total: totalCount,
          hasMore: query.offset + sessions.length < totalCount,
        },
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: `Invalid query parameters: ${error.message}` },
        { status: 400 }
      );
    }

    const err = error as Error;
    logger.error('Failed to list chat sessions', err);
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}

// ============================================================================
// POST - Create Session
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const data = createBodySchema.parse(body);

    const session = await createAdminChatSession(data);

    return NextResponse.json({
      success: true,
      data: session,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: `Invalid request body: ${error.message}` },
        { status: 400 }
      );
    }

    const err = error as Error;
    logger.error('Failed to create chat session', err);
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
