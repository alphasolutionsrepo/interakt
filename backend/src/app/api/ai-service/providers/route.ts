// app/api/ai-service/providers/route.ts

/**
 * AI Providers API Route
 * GET /api/ai-service/providers - Get available providers and models
 */

import { NextRequest } from 'next/server';

import { AI_MODEL_READERS } from '@/features/access/permissions';
import { withPermission } from '@/features/access/route-guard';
import { handleGetProviders } from '@/features/ai-service/ai-service.api.handlers';

export const GET = withPermission(AI_MODEL_READERS, async function GET(request: NextRequest) {
  return handleGetProviders(request);
});