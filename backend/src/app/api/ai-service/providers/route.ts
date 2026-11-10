// app/api/ai-service/providers/route.ts

/**
 * AI Providers API Route
 * GET /api/ai-service/providers - Get available providers and models
 */

import { NextRequest } from 'next/server';

import { forModelReaders } from '@/features/access/provider-addresses';
import { handleGetProviders } from '@/features/ai-service/ai-service.api.handlers';

export const GET = forModelReaders(async function GET(request: NextRequest) {
  return handleGetProviders(request);
});