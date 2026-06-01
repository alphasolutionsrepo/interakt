// app/api/analytics/chat/sessions/[sessionId]/route.ts

/**
 * Analytics Chat Session API - Single Session Operations
 *
 * GET    - Get session by ID (with full messages)
 * PATCH  - Update session (add messages, update title)
 * DELETE - Delete session
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createLogger } from '@/shared/logger/logger';
import {
  getAdminChatSession,
  updateAdminChatSession,
  deleteAdminChatSession,
  addAdminChatMessages,
  type AdminChatMessage,
} from '@/features/analytics';

const logger = createLogger('analytics-chat-session-api');

// ============================================================================
// SCHEMAS
// ============================================================================

const messageSchema = z.object({
  id: z.string(),
  role: z.enum(['user', 'assistant']),
  content: z.string(),
  timestamp: z.string(),
  toolsUsed: z.array(z.string()).optional(),
  error: z.boolean().optional(),
  analyticsData: z.array(z.object({
    tool: z.string(),
    dataType: z.string(),
    data: z.unknown(),
  })).optional(),
  usage: z.object({
    inputTokens: z.number(),
    outputTokens: z.number(),
    totalTokens: z.number(),
  }).optional(),
});

const updateBodySchema = z.object({
  title: z.string().min(1).max(255).optional(),
  addMessages: z.array(messageSchema).optional(),
  tokenUsage: z.object({
    inputTokens: z.number(),
    outputTokens: z.number(),
    totalTokens: z.number(),
  }).optional(),
});

// ============================================================================
// ROUTE PARAMS
// ============================================================================

interface RouteParams {
  params: Promise<{ sessionId: string }>;
}

// ============================================================================
// GET - Get Session
// ============================================================================

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { sessionId } = await params;

    const session = await getAdminChatSession(sessionId);

    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Session not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: session,
    });
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to get chat session', err);
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}

// ============================================================================
// PATCH - Update Session
// ============================================================================

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { sessionId } = await params;
    const body = await request.json();
    const data = updateBodySchema.parse(body);

    // Check session exists
    const existing = await getAdminChatSession(sessionId);
    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'Session not found' },
        { status: 404 }
      );
    }

    let session;

    // If adding messages, use the addMessages function
    if (data.addMessages && data.addMessages.length > 0) {
      session = await addAdminChatMessages(
        sessionId,
        data.addMessages as AdminChatMessage[],
        data.tokenUsage as { inputTokens: number; outputTokens: number; totalTokens: number } | undefined
      );
    } else {
      // Otherwise just update title/tokens
      session = await updateAdminChatSession(sessionId, {
        title: data.title,
        tokenUsage: data.tokenUsage as { inputTokens: number; outputTokens: number; totalTokens: number } | undefined,
      });
    }

    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Failed to update session' },
        { status: 500 }
      );
    }

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
    logger.error('Failed to update chat session', err);
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}

// ============================================================================
// DELETE - Delete Session
// ============================================================================

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { sessionId } = await params;

    const deleted = await deleteAdminChatSession(sessionId);

    if (!deleted) {
      return NextResponse.json(
        { success: false, error: 'Session not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: { deleted: true },
    });
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to delete chat session', err);
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
