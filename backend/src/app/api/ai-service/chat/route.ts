// app/api/ai-service/chat/route.ts

/**
 * Chat API Route
 * POST /api/ai-service/chat - Chat completion (non-streaming)
 */

import { NextRequest } from 'next/server';
import { handleChat } from '@/features/ai-service/ai-service.api.handlers';

export async function POST(request: NextRequest) {
  return handleChat(request);
}