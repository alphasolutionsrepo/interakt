// app/api/ai-service/chat/route.ts

/**
 * Chat API Route
 * POST /api/ai-service/chat - Chat completion (non-streaming)
 */

import { NextRequest } from 'next/server';

import { withPermission } from '@/features/access/route-guard';
import { handleChat } from '@/features/ai-service/ai-service.api.handlers';

export const POST = withPermission('playground:use', async function POST(request: NextRequest) {
  return handleChat(request);
});