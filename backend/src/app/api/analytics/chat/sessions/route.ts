// app/api/analytics/chat/sessions/route.ts

/**
 * Analytics Chat Sessions API
 *
 * GET  - List sessions (with pagination; ?q= searches titles, experiences and messages)
 * POST - Create a new session
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { withPermission } from '@/features/access/route-guard';
import {
  listAdminChatSessions,
  createAdminChatSession,
  getAdminChatSessionCount,
} from '@/features/analytics';
import { apiResponse } from '@/shared/api/response';

// ============================================================================
// SCHEMAS
// ============================================================================

const listQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
  q: z.string().trim().max(200).optional(),
});

const createBodySchema = z.object({
  title: z.string().min(1).max(255).optional(),
  providerId: z.string().optional(),
  modelId: z.number().optional(),
});

// ============================================================================
// GET - List Sessions
// ============================================================================

export const GET = withPermission('analytics:ask', async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = listQuerySchema.parse({
      limit: searchParams.get('limit'),
      offset: searchParams.get('offset'),
      q: searchParams.get('q') ?? undefined,
    });

    const [sessions, totalCount] = await Promise.all([
      listAdminChatSessions({ limit: query.limit, offset: query.offset, search: query.q }),
      getAdminChatSessionCount(query.q),
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
    if (error instanceof z.ZodError) return apiResponse.validationError(error);
    return apiResponse.error(error, 500, { operation: 'listAnalyticsChatSessions' });
  }
});

// ============================================================================
// POST - Create Session
// ============================================================================

export const POST = withPermission('analytics:ask', async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const data = createBodySchema.parse(body);

    const session = await createAdminChatSession(data);

    return NextResponse.json({
      success: true,
      data: session,
    });
  } catch (error) {
    if (error instanceof z.ZodError) return apiResponse.validationError(error);
    return apiResponse.error(error, 500, { operation: 'createAnalyticsChatSession' });
  }
});
