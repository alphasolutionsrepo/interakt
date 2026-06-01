// app/api/ai-service/chat/stream/route.ts

/**
 * Chat Streaming API Route
 * POST /api/ai-service/chat/stream - Chat completion with streaming (SSE)
 */

import { NextRequest } from 'next/server';
import { handleChatStream } from '@/features/ai-service/ai-service.api.handlers';

export async function POST(request: NextRequest) {
  return handleChatStream(request);
}