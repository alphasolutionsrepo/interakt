// app/api/ai-service/chat/stream/route.ts

/**
 * Chat Streaming API Route
 * POST /api/ai-service/chat/stream - Chat completion with streaming (SSE)
 */

import { NextRequest } from 'next/server';

import { withPermission } from '@/features/access/route-guard';
import { handleChatStream } from '@/features/ai-service/ai-service.api.handlers';

export const POST = withPermission('playground:use', async function POST(request: NextRequest) {
  return handleChatStream(request);
});